import type { QueryClient } from "@tanstack/react-query";

import { githubItemRepo } from "../data/repositories";
import type { GithubItem, RepoId } from "../data/types";
import { GitHubConnector } from "../domain/sync/connector";
import { queryKeys } from "./query-keys";
import { SIGN_IN_REQUIRED_MESSAGE, WRITES_DISABLED_MESSAGE } from "./useCreateIssue";
import { proxyFetcher } from "./useSync";

/**
 * Shared write-through plumbing for issue writes (close/reopen, labels).
 *
 * Every write against `repos/{owner}/{repo}/issues/{n}` answers with the
 * updated GitHub issue, so the hooks share the same post-write contract:
 * status-mapped error messages, mapping the response into the mirror, and
 * invalidating the reads the write refreshed.
 */

/** Friendly message for a failed issue write, keyed by the proxy's status code. */
export function issueWriteErrorMessage(
  status: number,
  payload: unknown,
  fallback: string,
): string {
  if (status === 405) return WRITES_DISABLED_MESSAGE;
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  // A write-time 403 is GitHub's permission answer (the App needs
  // "Issues: Read and write") and is shown verbatim.
  if (status === 403) return upstreamMessage(payload) ?? fallback;
  return fallback;
}

/** Extract the human message from a GitHub/proxy error payload, when present. */
export function upstreamMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const candidate = payload as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error) return candidate.error;
  }
  return null;
}

/** Parse a response body as JSON, falling back to the raw text (or null). */
export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Map a write response's raw GitHub issue into the mirror and return the
 * mapped item. `mapItem` is pure: the fetcher/store below are never called
 * here, they just satisfy the connector's one-way-pipeline deps.
 */
export async function writeIssueIntoMirror(repo: RepoId, raw: unknown): Promise<GithubItem> {
  const [owner, name] = repo.split("/");
  const connector = new GitHubConnector({
    owner,
    name,
    fetcher: proxyFetcher,
    store: githubItemRepo,
  });
  const item = connector.mapItem(raw);
  await githubItemRepo.upsert(item);
  return item;
}

/**
 * Invalidate the reads an issue write refreshed. The write already updated the
 * mirror; invalidating re-reads it so the detail, board, and backlog show the
 * new state right away.
 */
export function invalidateIssueWrites(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.issueDetail });
  void queryClient.invalidateQueries({ queryKey: queryKeys.board });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backlog });
}
