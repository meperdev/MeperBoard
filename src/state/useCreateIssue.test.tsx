import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo, repoRepo } from "../data/repositories";
import { queryKeys } from "./query-keys";
import { ACTIVE_REPO_KEY } from "./use-repos";
import { createTestQueryClient, queryWrapper, resetDb } from "./test-utils";
import {
  CREATE_ISSUE_FAILED_MESSAGE,
  SIGN_IN_REQUIRED_MESSAGE,
  WRITES_DISABLED_MESSAGE,
  useCreateIssue,
  type CreateIssueFetcher,
} from "./useCreateIssue";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const createdIssue = {
  number: 7,
  title: "Fix login",
  html_url: "https://github.com/meperdonas/meperboard/issues/7",
};

/** The 201 response body as GitHub sends it: the full created issue. */
const createdRawIssue = {
  number: 7,
  title: "Fix login",
  body: "Details",
  state: "open",
  html_url: "https://github.com/meperdonas/meperboard/issues/7",
  updated_at: "2026-10-16T12:00:00Z",
  labels: [{ name: "bug" }],
};

/**
 * Render the hook and wait until the shared active-repo query settled, so the
 * mutation resolves the same repo the read path would use. `useActiveRepo`
 * reports an error state when no repo is active (React Query rejects undefined
 * query data), which still leaves `data` undefined → default-repo fallback.
 */
async function renderCreateIssue(fetcher: CreateIssueFetcher) {
  const client = createTestQueryClient();
  const { result } = renderHook(() => useCreateIssue({ fetcher }), {
    wrapper: queryWrapper(client),
  });
  await waitFor(() => expect(client.getQueryState(ACTIVE_REPO_KEY)?.status).not.toBe("pending"));
  return { client, result };
}

describe("useCreateIssue", () => {
  beforeEach(resetDb);

  it("POSTs the issue to the active repo's proxy path with a JSON body", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdIssue, 201));

    const { result } = await renderCreateIssue(fetcher);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ title: "  Fix login  ", body: "  Details  " });
    });

    expect(returned).toMatchObject(createdIssue);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Fix login", body: "Details" }),
      },
    );
  });

  it("falls back to the default tracked repo when none is active", async () => {
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdIssue, 201));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await result.current.mutateAsync({ title: "Fix login" });
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/MeperDonas/MeperPOS/issues",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects an empty title without calling the proxy", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdIssue, 201));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "   " })).rejects.toThrow(/title/i);
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps a 405 to the writes-disabled message", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Method not allowed" }, 405));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Fix login" })).rejects.toThrow(
        WRITES_DISABLED_MESSAGE,
      );
    });
  });

  it("maps a 401 to the sign-in message", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Fix login" })).rejects.toThrow(
        SIGN_IN_REQUIRED_MESSAGE,
      );
    });
  });

  it("surfaces GitHub's 403 permission message verbatim", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(
      jsonResponse({ message: "Resource not accessible by integration" }, 403),
    );

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Fix login" })).rejects.toThrow(
        "Resource not accessible by integration",
      );
    });
  });

  it("maps any other failure to the generic message", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Fix login" })).rejects.toThrow(
        CREATE_ISSUE_FAILED_MESSAGE,
      );
    });
  });

  it("invalidates the board, backlog, and issue detail after a successful create", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdIssue, 201));

    const { client, result } = await renderCreateIssue(fetcher);
    client.setQueryData(queryKeys.board, ["stale"]);
    client.setQueryData(queryKeys.backlog, ["stale"]);
    client.setQueryData(queryKeys.issueDetail, ["stale"]);

    await act(async () => {
      await result.current.mutateAsync({ title: "Fix login" });
    });

    for (const key of [queryKeys.board, queryKeys.backlog, queryKeys.issueDetail]) {
      await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    }
  });

  it("upserts the issue GitHub returned into the mirror so it shows without a manual sync", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdRawIssue, 201));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await result.current.mutateAsync({ title: "Fix login", body: "Details" });
    });

    expect(await githubItemRepo.get("meperdonas/meperboard", 7)).toMatchObject({
      repo: "meperdonas/meperboard",
      number: 7,
      kind: "issue",
      title: "Fix login",
      body: "Details",
      state: "open",
      labels: ["bug"],
      html_url: "https://github.com/meperdonas/meperboard/issues/7",
    });
  });

  it("leaves the mirror untouched when the create fails", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    const fetcher = vi.fn<CreateIssueFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const { result } = await renderCreateIssue(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Fix login" })).rejects.toThrow(
        CREATE_ISSUE_FAILED_MESSAGE,
      );
    });

    expect(await githubItemRepo.getAll()).toHaveLength(0);
  });
});
