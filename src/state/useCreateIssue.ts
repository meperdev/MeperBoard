import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GithubItem, RepoId } from "../data/types";
import { invalidateIssueWrites, writeIssueIntoMirror } from "./updateIssue";
import { useActiveRepo } from "./use-repos";
import { DEFAULT_REPO } from "./useSync";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** Shown when the deployment runs without `WRITE_MODE=enabled` (proxy 405). */
export const WRITES_DISABLED_MESSAGE =
  "This deployment is read-only, so writes are disabled.";

/** Shown when the proxy has no authenticated session (401). */
export const SIGN_IN_REQUIRED_MESSAGE =
  "Your session expired. Sign in with GitHub and try again.";

/** Fallback for any failure without a more specific mapping. */
export const CREATE_ISSUE_FAILED_MESSAGE = "Could not create the issue. Please try again.";

export interface CreateIssueInput {
  title: string;
  /** Optional issue body; omitted input is sent as an empty string. */
  body?: string;
}

/** The subset of GitHub's created-issue payload the UI consumes. */
export interface CreatedIssue {
  number: number;
  title: string;
  html_url: string;
}

/** Injected transport for tests — mirrors the proxy's fetcher shape. */
export type CreateIssueFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface CreateIssueOptions {
  fetcher?: CreateIssueFetcher;
}

/**
 * Rewrite a GitHub API URL to the POST-capable proxy route so the PAT never
 * reaches the browser. Mirrors the read path's `proxyFetcher`, which is
 * GET-only and therefore cannot carry the write's method/body/headers.
 */
export function createIssueProxyFetcher(url: string, init: RequestInit): Promise<Response> {
  const path = url.startsWith(GITHUB_API_ORIGIN) ? url.slice(GITHUB_API_ORIGIN.length) : url;
  return fetch(`/api/github${path}`, init);
}

/** Friendly message for a failed create, keyed by the proxy's status code. */
function createIssueErrorMessage(status: number, payload: unknown): string {
  if (status === 405) return WRITES_DISABLED_MESSAGE;
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  // A write-time 403 is GitHub's permission answer (the App needs
  // "Issues: Read and write") and is shown verbatim.
  if (status === 403) return upstreamMessage(payload) ?? CREATE_ISSUE_FAILED_MESSAGE;
  return CREATE_ISSUE_FAILED_MESSAGE;
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
 * Create a GitHub issue in the active repo through the write proxy
 * (`POST /api/github/repos/{owner}/{repo}/issues`).
 *
 * The repo comes from the same `useActiveRepo` source as the read path, falling
 * back to the default tracked repo when none is selected. Failures are thrown
 * with a friendly, status-mapped message for the dialog to render.
 *
 * The 201 response IS the created issue: it is mapped with the sync connector
 * and upserted into the mirror that board/backlog/detail read, so the new issue
 * appears immediately instead of waiting for a manual sync.
 */
export function useCreateIssue(options: CreateIssueOptions = {}) {
  const queryClient = useQueryClient();
  const activeRepo = useActiveRepo();

  return useMutation<GithubItem, Error, CreateIssueInput>({
    mutationFn: async ({ title, body }) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error("An issue title is required.");
      }

      const repo = activeRepo.data ?? DEFAULT_REPO;
      const repoId: RepoId = `${repo.owner}/${repo.name}`;
      const fetcher = options.fetcher ?? createIssueProxyFetcher;
      const response = await fetcher(
        `${GITHUB_API_ORIGIN}/repos/${repo.owner}/${repo.name}/issues`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle, body: (body ?? "").trim() }),
        },
      );

      if (!response.ok) {
        throw new Error(createIssueErrorMessage(response.status, await readJson(response)));
      }

      return writeIssueIntoMirror(repoId, await readJson(response));
    },
    onSuccess: () => invalidateIssueWrites(queryClient),
  });
}
