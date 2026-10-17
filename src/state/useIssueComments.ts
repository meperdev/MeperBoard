import { useQuery } from "@tanstack/react-query";

import type { RepoId } from "../data/types";
import { queryKeys } from "./query-keys";
import { proxyFetcher } from "./useSync";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** One page of comments; the detail view shows a single page. */
const COMMENTS_PER_PAGE = 100;

/** The subset of GitHub's comment payload the detail view consumes. */
export interface IssueComment {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  /** `null` for comments whose author account was deleted ("ghost"). */
  user: { login: string } | null;
}

/** Read-path transport for comments; `proxyFetcher` matches this shape. */
export type IssueCommentsFetcher = (url: string) => Promise<Response>;

export interface IssueCommentsOptions {
  fetcher?: IssueCommentsFetcher;
}

/**
 * Live comments for a GitHub issue/PR number, read through the per-user proxy.
 *
 * Comments are volatile conversation data, so they are never mirrored — this
 * query fetches them on demand and the caller only enables it once the detail's
 * repo and number are known.
 */
export function useIssueComments(
  repo?: RepoId,
  number?: number,
  options: IssueCommentsOptions = {},
) {
  const fetcher = options.fetcher ?? proxyFetcher;

  return useQuery<IssueComment[]>({
    queryKey: [...queryKeys.issueComments, repo, number],
    queryFn: async () => {
      const response = await fetcher(
        `${GITHUB_API_ORIGIN}/repos/${repo}/issues/${number}/comments?per_page=${COMMENTS_PER_PAGE}`,
      );
      if (!response.ok) {
        throw new Error(`Could not load comments: ${response.status}`);
      }
      return (await response.json()) as IssueComment[];
    },
    enabled: repo != null && number != null,
  });
}
