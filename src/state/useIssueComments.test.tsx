import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestQueryClient, queryWrapper } from "./test-utils";
import { useIssueComments, type IssueCommentsFetcher } from "./useIssueComments";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const comments = [
  {
    id: 11,
    body: "First comment",
    html_url: "https://github.com/meperdonas/meperboard/issues/7#issuecomment-11",
    created_at: "2026-10-16T08:03:00Z",
    user: { login: "alice" },
  },
  {
    id: 12,
    body: "Second comment",
    html_url: "https://github.com/meperdonas/meperboard/issues/7#issuecomment-12",
    created_at: "2026-10-16T09:10:00Z",
    user: { login: "bob" },
  },
];

function renderComments(repo?: string, number?: number, fetcher?: IssueCommentsFetcher) {
  const client = createTestQueryClient();
  const { result } = renderHook(() => useIssueComments(repo, number, { fetcher }), {
    wrapper: queryWrapper(client),
  });
  return { client, result };
}

describe("useIssueComments", () => {
  it("fetches one 100-item page of comments from the selected issue", async () => {
    const fetcher = vi.fn<IssueCommentsFetcher>();
    fetcher.mockResolvedValue(jsonResponse(comments));

    const { result } = renderComments("meperdonas/meperboard", 7, fetcher);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues/7/comments?per_page=100",
    );
    expect(result.current.data).toMatchObject([
      { id: 11, body: "First comment" },
      { id: 12, body: "Second comment" },
    ]);
  });

  it("stays disabled until both a repo and a number are selected", () => {
    const noSelection = vi.fn<IssueCommentsFetcher>();
    const nothingSelected = renderComments(undefined, undefined, noSelection);
    expect(nothingSelected.result.current.fetchStatus).toBe("idle");
    expect(noSelection).not.toHaveBeenCalled();

    const missingNumber = vi.fn<IssueCommentsFetcher>();
    const repoOnly = renderComments("meperdonas/meperboard", undefined, missingNumber);
    expect(repoOnly.result.current.fetchStatus).toBe("idle");
    expect(missingNumber).not.toHaveBeenCalled();
  });

  it("surfaces an error when GitHub answers with a non-2xx status", async () => {
    const fetcher = vi.fn<IssueCommentsFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));

    const { result } = renderComments("meperdonas/meperboard", 7, fetcher);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/comments/i);
  });
});
