import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RepoId } from "../data/types";
import { queryKeys } from "./query-keys";
import {
  createIssueProxyFetcher,
  SIGN_IN_REQUIRED_MESSAGE,
  WRITES_DISABLED_MESSAGE,
} from "./useCreateIssue";
import type { IssueComment } from "./useIssueComments";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** Fallback for any failure without a more specific mapping. */
export const CREATE_COMMENT_FAILED_MESSAGE = "Could not post the comment. Please try again.";

export interface CreateCommentInput {
  body: string;
}

/** Injected transport for tests — mirrors the proxy's POST-capable fetcher shape. */
export type CreateCommentFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface CreateCommentOptions {
  fetcher?: CreateCommentFetcher;
}

/** Friendly message for a failed comment post, keyed by the proxy's status code. */
function commentErrorMessage(status: number, payload: unknown): string {
  if (status === 405) return WRITES_DISABLED_MESSAGE;
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  // A write-time 403 is GitHub's permission answer (the App needs
  // "Issues: Read and write") and is shown verbatim.
  if (status === 403) return upstreamMessage(payload) ?? CREATE_COMMENT_FAILED_MESSAGE;
  return CREATE_COMMENT_FAILED_MESSAGE;
}

/** Extract the human message from a GitHub/proxy error payload, when present. */
function upstreamMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const candidate = payload as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error) return candidate.error;
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Post a comment on the selected GitHub issue/PR through the write proxy
 * (`POST /api/github/repos/{owner}/{repo}/issues/{number}/comments`).
 */
export function useCreateComment(
  repo: RepoId,
  number: number,
  options: CreateCommentOptions = {},
) {
  const queryClient = useQueryClient();

  return useMutation<IssueComment, Error, CreateCommentInput>({
    mutationFn: async ({ body }) => {
      const trimmed = body.trim();
      if (!trimmed) {
        throw new Error("A comment body is required.");
      }
      const fetcher = options.fetcher ?? createIssueProxyFetcher;
      const response = await fetcher(
        `${GITHUB_API_ORIGIN}/repos/${repo}/issues/${number}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        },
      );

      if (!response.ok) {
        throw new Error(commentErrorMessage(response.status, await readJson(response)));
      }

      return (await response.json()) as IssueComment;
    },
    onSuccess: () => {
      // Comments are live reads (never mirrored), so invalidating their query is
      // the whole refresh: the detail refetches and shows the new comment.
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueComments });
    },
  });
}
