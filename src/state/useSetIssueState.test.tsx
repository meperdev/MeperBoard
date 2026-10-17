import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo } from "../data/repositories";
import { queryKeys } from "./query-keys";
import { createTestQueryClient, makeGithubItem, queryWrapper, resetDb } from "./test-utils";
import { SIGN_IN_REQUIRED_MESSAGE, WRITES_DISABLED_MESSAGE } from "./useCreateIssue";
import {
  SET_ISSUE_STATE_FAILED_MESSAGE,
  useSetIssueState,
  type SetIssueStateFetcher,
} from "./useSetIssueState";

const REPO = "meperdonas/meperboard";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Raw GitHub issue payload as returned by the PATCH write (state flipped). */
const closedRawIssue = {
  number: 7,
  title: "Fix login",
  body: "details",
  state: "closed",
  html_url: "https://github.com/meperdonas/meperboard/issues/7",
  updated_at: "2026-10-16T12:00:00Z",
  labels: [{ name: "bug" }],
};

function renderSetIssueState(
  fetcher: SetIssueStateFetcher,
  state: "open" | "closed" = "closed",
) {
  const client = createTestQueryClient();
  const { result } = renderHook(() => useSetIssueState(REPO, 7, state, { fetcher }), {
    wrapper: queryWrapper(client),
  });
  return { client, result };
}

describe("useSetIssueState", () => {
  beforeEach(resetDb);

  it("PATCHes the requested state to the issue's proxy path as JSON", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse(closedRawIssue));

    const { result } = renderSetIssueState(fetcher);

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues/7",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
      },
    );
  });

  it("maps the response into the mirror and returns the updated item", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse(closedRawIssue));

    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix login", state: "open" }));

    const { result } = renderSetIssueState(fetcher);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync();
    });

    expect(returned).toMatchObject({
      repo: REPO,
      number: 7,
      kind: "issue",
      state: "closed",
      labels: ["bug"],
    });
    expect(await githubItemRepo.get(REPO, 7)).toMatchObject({
      state: "closed",
      title: "Fix login",
      labels: ["bug"],
    });
  });

  it("invalidates the detail, board, and backlog after a successful write", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse(closedRawIssue));

    const { client, result } = renderSetIssueState(fetcher);
    client.setQueryData(queryKeys.board, ["stale"]);
    client.setQueryData(queryKeys.backlog, ["stale"]);
    client.setQueryData([...queryKeys.issueDetail, REPO, 7], ["stale"]);

    await act(async () => {
      await result.current.mutateAsync();
    });

    for (const key of [
      queryKeys.board,
      queryKeys.backlog,
      [...queryKeys.issueDetail, REPO, 7],
    ]) {
      await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    }
  });

  it("maps a 405 to the writes-disabled message", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Method not allowed" }, 405));

    const { result } = renderSetIssueState(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(WRITES_DISABLED_MESSAGE);
    });
  });

  it("maps a 401 to the sign-in message", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    const { result } = renderSetIssueState(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(SIGN_IN_REQUIRED_MESSAGE);
    });
  });

  it("surfaces GitHub's 403 permission message verbatim", async () => {
    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(
      jsonResponse({ message: "Resource not accessible by integration" }, 403),
    );

    const { result } = renderSetIssueState(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        "Resource not accessible by integration",
      );
    });
  });

  it("maps any other failure to the state-specific generic message, leaving the mirror intact", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix login", state: "open" }));

    const fetcher = vi.fn<SetIssueStateFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const { result } = renderSetIssueState(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(SET_ISSUE_STATE_FAILED_MESSAGE);
    });

    expect(await githubItemRepo.get(REPO, 7)).toMatchObject({ state: "open" });
  });
});
