import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GithubItem, RepoId } from "../data/types";
import { queryKeys } from "./query-keys";
import { createIssueProxyFetcher } from "./useCreateIssue";
import { proxyFetcher } from "./useSync";
import {
  invalidateIssueWrites,
  issueWriteErrorMessage,
  readJson,
  writeIssueIntoMirror,
} from "./updateIssue";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** One page of repo labels; the label editor shows a single page. */
const LABELS_PER_PAGE = 100;

/** The subset of GitHub's label payload the label editor consumes. */
export interface RepoLabel {
  id: number;
  name: string;
  color: string;
}

/** Fallback for any label write without a more specific mapping. */
export const SET_ISSUE_LABELS_FAILED_MESSAGE =
  "Could not update the labels. Please try again.";

/** Read-path transport for the repo label catalog; `proxyFetcher` matches this shape. */
export type RepoLabelsFetcher = (url: string) => Promise<Response>;

/** Injected transport for tests — mirrors the proxy's PATCH-capable fetcher shape. */
export type SetIssueLabelsFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface RepoLabelsOptions {
  fetcher?: RepoLabelsFetcher;
}

export interface SetIssueLabelsOptions {
  fetcher?: SetIssueLabelsFetcher;
}

/**
 * Live label catalog of a repo, read through the per-user proxy
 * (`GET /api/github/repos/{owner}/{repo}/labels`).
 *
 * The catalog is configuration-like data that changes rarely, so it is never
 * mirrored — the label editor fetches it on demand and TanStack caches it per
 * repo. Disabled until a repo is selected.
 */
export function useRepoLabels(repo?: RepoId, options: RepoLabelsOptions = {}) {
  const fetcher = options.fetcher ?? proxyFetcher;

  return useQuery<RepoLabel[]>({
    queryKey: [...queryKeys.repoLabels, repo],
    queryFn: async () => {
      const response = await fetcher(
        `${GITHUB_API_ORIGIN}/repos/${repo}/labels?per_page=${LABELS_PER_PAGE}`,
      );
      if (!response.ok) {
        throw new Error(`Could not load the repo labels: ${response.status}`);
      }
      return (await response.json()) as RepoLabel[];
    },
    enabled: repo != null,
  });
}

/**
 * Replace the selected GitHub issue/PR's labels through the write proxy
 * (`PATCH /api/github/repos/{owner}/{repo}/issues/{number}` with `{ labels }`).
 *
 * GitHub's labels field is a full replacement list, so the mutation takes the
 * complete list the editor currently shows (not a delta). The PATCH response IS
 * the updated issue: it goes through the shared write-through (mirror upsert +
 * detail/board/backlog invalidation), so the detail re-renders immediately.
 * Failures are thrown with a friendly, status-mapped message for the editor.
 */
export function useSetIssueLabels(
  repo: RepoId,
  number: number,
  options: SetIssueLabelsOptions = {},
) {
  const queryClient = useQueryClient();

  return useMutation<GithubItem, Error, string[]>({
    mutationFn: async (labels) => {
      const fetcher = options.fetcher ?? createIssueProxyFetcher;
      const response = await fetcher(`${GITHUB_API_ORIGIN}/repos/${repo}/issues/${number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labels }),
      });

      if (!response.ok) {
        throw new Error(
          issueWriteErrorMessage(
            response.status,
            await readJson(response),
            SET_ISSUE_LABELS_FAILED_MESSAGE,
          ),
        );
      }

      return writeIssueIntoMirror(repo, await readJson(response));
    },
    onSuccess: () => invalidateIssueWrites(queryClient),
  });
}
