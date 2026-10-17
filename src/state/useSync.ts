import { useMutation, useQueryClient } from "@tanstack/react-query";

import { githubItemRepo, repoRepo } from "../data/repositories";
import type { RepoId } from "../data/types";
import { GitHubConnector } from "../domain/sync/connector";
import { saveLastSync } from "../lib/last-sync";
import { queryKeys } from "./query-keys";

const GITHUB_API_ORIGIN = "https://api.github.com";

/** Default source repository — MeperPOS is the board's first tracked repo. */
export const DEFAULT_REPO = { owner: "MeperDonas", name: "MeperPOS" } as const;

/** Read-path default repo id (`owner/name`) used when no active repo has been
 * selected. Mirrors `DEFAULT_REPO` so the board/backlog fall back to the same
 * repo the connector would sync by default. */
export const DEFAULT_REPO_ID: RepoId = `${DEFAULT_REPO.owner}/${DEFAULT_REPO.name}`;

export interface SyncOptions {
  owner?: string;
  name?: string;
  fetcher?: (url: string) => Promise<Response>;
  connector?: GitHubConnector;
}

/**
 * Rewrite a GitHub API URL to the read-only proxy route so the PAT never
 * reaches the browser (design: proxy `src/app/api/github/[...path]`).
 */
export function proxyFetcher(url: string): Promise<Response> {
  const path = url.startsWith(GITHUB_API_ORIGIN) ? url.slice(GITHUB_API_ORIGIN.length) : url;
  return fetch(`/api/github${path}`);
}

/**
 * Read-only sync mutation. Runs the `GitHubConnector`'s one-way import and
 * invalidates every derived read so the board/backlog/detail reflect the new
 * mirror. Local cards are intentionally NOT invalidated — sync never touches
 * them.
 *
 * A successful sync also records its timestamp (`src/lib/last-sync.ts`) so the
 * load-time auto-sync (`useAutoSync`) can tell when the mirror went stale.
 *
 * When multiple repos are active, syncs each active repo sequentially.
 * An explicit `owner`/`name` option always wins.
 */
export function useSync(options: SyncOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (options.connector) {
        return options.connector.sync();
      }

      if (options.owner && options.name) {
        const connector = new GitHubConnector({
          owner: options.owner,
          name: options.name,
          fetcher: options.fetcher ?? proxyFetcher,
          store: githubItemRepo,
        });
        return connector.sync();
      }

      const activeRepos = await repoRepo.getActiveRepos();
      const targetRepos = activeRepos.length > 0 ? activeRepos : [DEFAULT_REPO];

      const results = [];
      for (const repo of targetRepos) {
        const connector = new GitHubConnector({
          owner: repo.owner,
          name: repo.name,
          fetcher: options.fetcher ?? proxyFetcher,
          store: githubItemRepo,
        });
        results.push(await connector.sync());
      }

      return {
        imported: results.reduce((sum, r) => sum + r.imported, 0),
        paused: results.some((r) => r.paused),
      };
    },
    onSuccess: () => {
      saveLastSync(Date.now());
      void queryClient.invalidateQueries({ queryKey: queryKeys.board });
      void queryClient.invalidateQueries({ queryKey: queryKeys.backlog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueDetail });
    },
  });
}
