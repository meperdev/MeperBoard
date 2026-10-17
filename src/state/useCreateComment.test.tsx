import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "./query-keys";
import { createTestQueryClient, queryWrapper } from "./test-utils";
import {
  CREATE_COMMENT_FAILED_MESSAGE,
  useCreateComment,
  type CreateCommentFetcher,
} from "./useCreateComment";
import { SIGN_IN_REQUIRED_MESSAGE, WRITES_DISABLED_MESSAGE } from "./useCreateIssue";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const createdComment = {
  id: 42,
  body: "Fixed in 1.2",
  html_url: "https://github.com/meperdonas/meperboard/issues/7#issuecomment-42",
  created_at: "2026-10-16T10:00:00Z",
  user: { login: "meper" },
};

function renderCreateComment(fetcher: CreateCommentFetcher) {
  const client = createTestQueryClient();
  const { result } = renderHook(
    () => useCreateComment("meperdonas/meperboard", 7, { fetcher }),
    { wrapper: queryWrapper(client) },
  );
  return { client, result };
}

describe("useCreateComment", () => {
  it("POSTs the trimmed comment to the selected issue as JSON", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdComment, 201));

    const { result } = renderCreateComment(fetcher);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ body: "  Fixed in 1.2  " });
    });

    expect(returned).toMatchObject(createdComment);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues/7/comments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Fixed in 1.2" }),
      },
    );
  });

  it("rejects an empty comment without calling the proxy", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdComment, 201));

    const { result } = renderCreateComment(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ body: "   " })).rejects.toThrow(/comment/i);
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps a 405 to the writes-disabled message", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Method not allowed" }, 405));

    const { result } = renderCreateComment(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ body: "Fixed in 1.2" })).rejects.toThrow(
        WRITES_DISABLED_MESSAGE,
      );
    });
  });

  it("maps a 401 to the sign-in message", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    const { result } = renderCreateComment(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ body: "Fixed in 1.2" })).rejects.toThrow(
        SIGN_IN_REQUIRED_MESSAGE,
      );
    });
  });

  it("surfaces GitHub's 403 permission message verbatim", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(
      jsonResponse({ message: "Resource not accessible by integration" }, 403),
    );

    const { result } = renderCreateComment(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ body: "Fixed in 1.2" })).rejects.toThrow(
        "Resource not accessible by integration",
      );
    });
  });

  it("maps any other failure to the generic message", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const { result } = renderCreateComment(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync({ body: "Fixed in 1.2" })).rejects.toThrow(
        CREATE_COMMENT_FAILED_MESSAGE,
      );
    });
  });

  it("invalidates the comments query after a successful post", async () => {
    const fetcher = vi.fn<CreateCommentFetcher>();
    fetcher.mockResolvedValue(jsonResponse(createdComment, 201));

    const { client, result } = renderCreateComment(fetcher);
    const commentsKey = [...queryKeys.issueComments, "meperdonas/meperboard", 7];
    client.setQueryData(commentsKey, [{ id: 11 }]);

    await act(async () => {
      await result.current.mutateAsync({ body: "Fixed in 1.2" });
    });

    await waitFor(() => expect(client.getQueryState(commentsKey)?.isInvalidated).toBe(true));
  });
});
