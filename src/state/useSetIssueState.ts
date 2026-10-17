import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GithubItem, RepoId } from "../data/types";
import { createIssueProxyFetcher } from "./useCreateIssue";
import { invalidateIssueWrites, issueWriteErrorMessage, readJson, writeIssueIntoMirror } from "./updateIssue";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** Issue/PR state the write path can set. */
export type IssueState = "open" | "closed";

/** Fallback for any failure without a more specific mapping. */
export const SET_ISSUE_STATE_FAILED_MESSAGE =
  "Could not update the issue state. Please try again.";

/** Injected transport for tests — mirrors the proxy's PATCH-capable fetcher shape. */
export type SetIssueStateFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface SetIssueStateOptions {
  fetcher?: SetIssueStateFetcher;
}

/**
 * Close or reopen the selected GitHub issue/PR through the write proxy
 * (`PATCH /api/github/repos/{owner}/{repo}/issues/{number}`).
 *
 * The item is addressed explicitly (like the comment composer), so the
 * detail's own repo/number drive the write instead of the active-repo
 * fallback. The PATCH response IS the updated GitHub issue: it is mapped with
 * the sync connector and upserted into the mirror, so the detail/board/backlog
 * flip immediately instead of waiting for the next sync. Failures are thrown
 * with a friendly, status-mapped message for the caller to render.
 */
export function useSetIssueState(
  repo: RepoId,
  number: number,
  state: IssueState,
  options: SetIssueStateOptions = {},
) {
  const queryClient = useQueryClient();

  return useMutation<GithubItem, Error, void>({
    mutationFn: async () => {
      const fetcher = options.fetcher ?? createIssueProxyFetcher;
      const response = await fetcher(`${GITHUB_API_ORIGIN}/repos/${repo}/issues/${number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });

      if (!response.ok) {
        throw new Error(
          issueWriteErrorMessage(
            response.status,
            await readJson(response),
            SET_ISSUE_STATE_FAILED_MESSAGE,
          ),
        );
      }

      return writeIssueIntoMirror(repo, await readJson(response));
    },
    onSuccess: () => invalidateIssueWrites(queryClient),
  });
}
