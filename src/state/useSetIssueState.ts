import { useMutation, useQueryClient } from "@tanstack/react-query";

import { githubItemRepo } from "../data/repositories";
import type { GithubItem, RepoId } from "../data/types";
import { GitHubConnector } from "../domain/sync/connector";
import type { RawGithubIssue } from "../domain/sync/map";
import { queryKeys } from "./query-keys";
import {
  createIssueProxyFetcher,
  SIGN_IN_REQUIRED_MESSAGE,
  WRITES_DISABLED_MESSAGE,
} from "./useCreateIssue";
import { proxyFetcher } from "./useSync";

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

/** Friendly message for a failed state change, keyed by the proxy's status code. */
function setIssueStateErrorMessage(status: number, payload: unknown): string {
  if (status === 405) return WRITES_DISABLED_MESSAGE;
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  // A write-time 403 is GitHub's permission answer (the App needs
  // "Issues: Read and write") and is shown verbatim.
  if (status === 403) return upstreamMessage(payload) ?? SET_ISSUE_STATE_FAILED_MESSAGE;
  return SET_ISSUE_STATE_FAILED_MESSAGE;
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
        throw new Error(setIssueStateErrorMessage(response.status, await readJson(response)));
      }

      const raw = (await readJson(response)) as RawGithubIssue;
      const [owner, name] = repo.split("/");
      // `mapItem` is pure: the fetcher/store below are never called here, they
      // just satisfy the connector's one-way-pipeline deps.
      const connector = new GitHubConnector({
        owner,
        name,
        fetcher: proxyFetcher,
        store: githubItemRepo,
      });
      const item = connector.mapItem(raw);
      await githubItemRepo.upsert(item);
      return item;
    },
    onSuccess: () => {
      // The write already refreshed the mirror; invalidating re-reads it so the
      // detail, board, and backlog show the new state right away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueDetail });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board });
      void queryClient.invalidateQueries({ queryKey: queryKeys.backlog });
    },
  });
}
