import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo, repoRepo } from "../data/repositories";
import { loadLastSync, saveLastSync } from "../lib/last-sync";
import { createTestQueryClient, queryWrapper, resetDb } from "./test-utils";
import { useActiveRepo } from "./use-repos";
import { useBoard } from "./useBoard";
import { DEFAULT_REPO, DEFAULT_REPO_ID, useSync } from "./useSync";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
  {
    number: 2,
    title: "Fix auth",
    body: null,
    state: "open",
    html_url: "https://github.com/meperdonas/meperboard/issues/2",
    updated_at: "2026-08-01T00:00:00Z",
    labels: [],
  },
];

function BoardProbe({ fetcher }: { fetcher: (url: string) => Promise<Response> }) {
  const board = useBoard();
  const sync = useSync({ owner: "meperdonas", name: "meperboard", fetcher });
  const count = board.data?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0;

  return (
    <div>
      <button data-testid="sync" onClick={() => sync.mutate()}>
        sync
      </button>
      <span data-testid="count">{count}</span>
      <span data-testid="status">
        {sync.isPending ? "syncing" : sync.isError ? "error" : "idle"}
      </span>
    </div>
  );
}

describe("useSync", () => {
  beforeEach(async () => {
    await resetDb();
    // The success timestamp persists in localStorage — isolate every test.
    window.localStorage.clear();
  });

  it("triggers a read-only import that updates the store and board", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(issuePayloads));
    const client = createTestQueryClient();

    render(<BoardProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));

    // The connector hits only the read-only issues endpoint.
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues?state=all&per_page=100",
    );

    const stored = await githubItemRepo.getAll();
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ number: 1, repo: "meperdonas/meperboard" });
  });

  it("surfaces an error and leaves the store untouched on failure", async () => {
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockRejectedValue(new Error("network down"));
    const client = createTestQueryClient();

    render(<BoardProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    expect(await githubItemRepo.getAll()).toHaveLength(0);
  });

  it("syncs the persisted active repo when no owner/name is passed", async () => {
    await repoRepo.setActive("acme", "widgets");

    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(issuePayloads));
    const client = createTestQueryClient();

    function RepoProbe() {
      const sync = useSync({ fetcher });
      return (
        <button data-testid="sync" onClick={() => sync.mutate()}>
          sync
        </button>
      );
    }

    render(<RepoProbe />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(githubItemRepo.getAll()).resolves.toHaveLength(0));

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(githubItemRepo.getAll()).resolves.toHaveLength(2));

    const stored = await githubItemRepo.getAll();
    expect(stored.every((item) => item.repo === "acme/widgets")).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widgets/issues?state=all&per_page=100",
    );
  });

  it("syncs all active repos sequentially when multiple are active", async () => {
    await repoRepo.toggleActive("acme", "widgets");
    await repoRepo.toggleActive("meperdonas", "meperboard");

    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockImplementation(() => Promise.resolve(jsonResponse(issuePayloads)));
    const client = createTestQueryClient();

    function RepoProbe() {
      const sync = useSync({ fetcher });
      return (
        <button data-testid="sync" onClick={() => sync.mutate()}>
          sync
        </button>
      );
    }

    render(<RepoProbe />, { wrapper: queryWrapper(client) });

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(githubItemRepo.getAll()).resolves.toHaveLength(4));

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widgets/issues?state=all&per_page=100",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues?state=all&per_page=100",
    );
  });

  it("records the timestamp of the last successful sync", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(issuePayloads));
    const client = createTestQueryClient();

    render(<BoardProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));
    expect(loadLastSync()).toBeNull();

    const before = Date.now();
    act(() => screen.getByTestId("sync").click());
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));

    const recorded = loadLastSync();
    expect(recorded).not.toBeNull();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(Date.now());
  });

  it("leaves the stored timestamp untouched when the sync fails", async () => {
    saveLastSync(1_234);
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockRejectedValue(new Error("network down"));
    const client = createTestQueryClient();

    render(<BoardProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(loadLastSync()).toBe(1_234);
  });
});

function ActiveRepoProbe() {
  const active = useActiveRepo();
  return (
    <div>
      <span data-testid="active-repo">{active.data ? `${active.data.owner}/${active.data.name}` : "none"}</span>
    </div>
  );
}

describe("useActiveRepo", () => {
  beforeEach(resetDb);

  it("returns the persisted active repo after repoRepo.setActive", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const client = createTestQueryClient();

    render(<ActiveRepoProbe />, { wrapper: queryWrapper(client) });

    await waitFor(() =>
      expect(screen.getByTestId("active-repo")).toHaveTextContent("meperdonas/meperboard"),
    );
  });

  it("returns none when no active repo is persisted", async () => {
    const client = createTestQueryClient();

    render(<ActiveRepoProbe />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("active-repo")).toHaveTextContent("none"));
  });
});

describe("DEFAULT_REPO", () => {
  it("points at the renamed account while keeping the tracked repository name", () => {
    expect(DEFAULT_REPO.owner).toBe("meperdev");
    expect(DEFAULT_REPO.name).toBe("MeperPOS");
  });

  it("derives DEFAULT_REPO_ID from owner/name", () => {
    expect(DEFAULT_REPO_ID).toBe("meperdev/MeperPOS");
    expect(DEFAULT_REPO_ID).toBe(`${DEFAULT_REPO.owner}/${DEFAULT_REPO.name}`);
  });
});
