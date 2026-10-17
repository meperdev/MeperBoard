import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo } from "../data/repositories";
import { AUTO_SYNC_STALE_MS } from "../lib/config";
import { loadLastSync, saveLastSync } from "../lib/last-sync";
import { createTestQueryClient, queryWrapper, resetDb } from "./test-utils";
import { isSyncStale, useAutoSync } from "./useAutoSync";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SYNC_URL =
  "https://api.github.com/repos/meperdonas/meperboard/issues?state=all&per_page=100";

const issuePayloads = [
  {
    number: 1,
    title: "Expenses slice 1",
    body: "",
    state: "open",
    html_url: "https://github.com/meperdonas/meperboard/issues/1",
    updated_at: "2026-08-01T00:00:00Z",
    labels: [],
  },
];

function renderAutoSync(fetcher: (url: string) => Promise<Response>) {
  const client = createTestQueryClient();
  const utils = renderHook(
    () => useAutoSync({ owner: "meperdonas", name: "meperboard", fetcher }),
    { wrapper: queryWrapper(client) },
  );
  return { client, ...utils };
}

describe("isSyncStale", () => {
  beforeEach(() => window.localStorage.clear());

  it("treats a missing timestamp as stale", () => {
    expect(isSyncStale(1_000)).toBe(true);
  });

  it("is fresh inside the 30-minute window and stale past it", () => {
    saveLastSync(1_000);

    expect(isSyncStale(1_000)).toBe(false);
    expect(isSyncStale(1_000 + AUTO_SYNC_STALE_MS)).toBe(false);
    expect(isSyncStale(1_000 + AUTO_SYNC_STALE_MS + 1)).toBe(true);
  });
});

describe("useAutoSync", () => {
  beforeEach(async () => {
    await resetDb();
    window.localStorage.clear();
  });

  it("fires a sync on mount when the last successful sync is stale", async () => {
    saveLastSync(Date.now() - AUTO_SYNC_STALE_MS - 60_000);
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(issuePayloads));

    renderAutoSync(fetcher);

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(SYNC_URL));
    await waitFor(() => expect(githubItemRepo.getAll()).resolves.toHaveLength(1));
  });

  it("does not sync when the last successful sync is fresh", () => {
    const fresh = Date.now();
    saveLastSync(fresh);
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(issuePayloads));

    renderAutoSync(fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(loadLastSync()).toBe(fresh);
  });

  it("records the successful sync timestamp through useSync", async () => {
    const fixedNow = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    try {
      saveLastSync(fixedNow - AUTO_SYNC_STALE_MS - 1);
      const fetcher = vi.fn<(url: string) => Promise<Response>>();
      fetcher.mockResolvedValue(jsonResponse(issuePayloads));

      renderAutoSync(fetcher);

      await waitFor(() => expect(fetcher).toHaveBeenCalledWith(SYNC_URL));
      await waitFor(() => expect(loadLastSync()).toBe(fixedNow));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("fires at most one sync per mount while the first one is in flight", async () => {
    saveLastSync(Date.now() - AUTO_SYNC_STALE_MS - 1);
    const pending: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));

    const { rerender } = renderAutoSync(fetcher);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending[0](jsonResponse(issuePayloads));
    });
  });
});
