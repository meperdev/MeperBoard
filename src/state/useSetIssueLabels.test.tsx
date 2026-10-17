import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo } from "../data/repositories";
import { queryKeys } from "./query-keys";
import { createTestQueryClient, makeGithubItem, queryWrapper, resetDb } from "./test-utils";
import { SIGN_IN_REQUIRED_MESSAGE, WRITES_DISABLED_MESSAGE } from "./useCreateIssue";
import {
  SET_ISSUE_LABELS_FAILED_MESSAGE,
  useRepoLabels,
  useSetIssueLabels,
  type RepoLabelsFetcher,
  type SetIssueLabelsFetcher,
} from "./useSetIssueLabels";

const REPO = "meperdonas/meperboard";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Raw GitHub label payload as the repo's labels endpoint returns it. */
const labelCatalog = [
  { id: 1, name: "bug", color: "d73a4a" },
  { id: 2, name: "feature", color: "0e8a16" },
];

/** Raw GitHub issue payload as returned by the labels PATCH (list replaced). */
const relabeledRawIssue = {
  number: 7,
  title: "Fix login",
  body: "details",
  state: "open",
  html_url: "https://github.com/meperdonas/meperboard/issues/7",
  updated_at: "2026-10-16T12:00:00Z",
  labels: [{ name: "bug" }, { name: "feature" }],
};

function renderRepoLabels(repo: string | undefined, fetcher: RepoLabelsFetcher) {
  const client = createTestQueryClient();
  const { result } = renderHook(() => useRepoLabels(repo, { fetcher }), {
    wrapper: queryWrapper(client),
  });
  return { client, result };
}

function renderSetIssueLabels(fetcher: SetIssueLabelsFetcher) {
  const client = createTestQueryClient();
  const { result } = renderHook(() => useSetIssueLabels(REPO, 7, { fetcher }), {
    wrapper: queryWrapper(client),
  });
  return { client, result };
}

describe("useRepoLabels", () => {
  beforeEach(resetDb);

  it("fetches the repo's one-page label catalog through the proxy", async () => {
    const fetcher = vi.fn<RepoLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse(labelCatalog));

    const { result } = renderRepoLabels(REPO, fetcher);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/labels?per_page=100",
    );
    expect(result.current.data).toMatchObject([
      { id: 1, name: "bug" },
      { id: 2, name: "feature" },
    ]);
  });

  it("stays disabled until a repo is selected", () => {
    const fetcher = vi.fn<RepoLabelsFetcher>();

    const { result } = renderRepoLabels(undefined, fetcher);

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces an error when the catalog request fails", async () => {
    const fetcher = vi.fn<RepoLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));

    const { result } = renderRepoLabels(REPO, fetcher);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/labels/i);
  });
});

describe("useSetIssueLabels", () => {
  beforeEach(resetDb);

  it("PATCHes the full replacement list to the issue's proxy path as JSON", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse(relabeledRawIssue));

    const { result } = renderSetIssueLabels(fetcher);

    await act(async () => {
      await result.current.mutateAsync(["bug", "feature"]);
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdonas/meperboard/issues/7",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labels: ["bug", "feature"] }),
      },
    );
  });

  it("maps the response into the mirror and returns the updated item", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse(relabeledRawIssue));

    await githubItemRepo.upsert(
      makeGithubItem({ number: 7, title: "Fix login", labels: [] }),
    );

    const { result } = renderSetIssueLabels(fetcher);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(["bug", "feature"]);
    });

    expect(returned).toMatchObject({
      repo: REPO,
      number: 7,
      kind: "issue",
      labels: ["bug", "feature"],
    });
    expect(await githubItemRepo.get(REPO, 7)).toMatchObject({
      title: "Fix login",
      labels: ["bug", "feature"],
    });
  });

  it("invalidates the detail, board, and backlog after a successful write", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse(relabeledRawIssue));

    const { client, result } = renderSetIssueLabels(fetcher);
    client.setQueryData(queryKeys.board, ["stale"]);
    client.setQueryData(queryKeys.backlog, ["stale"]);
    client.setQueryData([...queryKeys.issueDetail, REPO, 7], ["stale"]);

    await act(async () => {
      await result.current.mutateAsync(["bug"]);
    });

    for (const key of [
      queryKeys.board,
      queryKeys.backlog,
      [...queryKeys.issueDetail, REPO, 7],
    ]) {
      await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    }
  });

  it("maps a 405 to the writes-disabled message", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Method not allowed" }, 405));

    const { result } = renderSetIssueLabels(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync(["bug"])).rejects.toThrow(
        WRITES_DISABLED_MESSAGE,
      );
    });
  });

  it("maps a 401 to the sign-in message", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    const { result } = renderSetIssueLabels(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync(["bug"])).rejects.toThrow(
        SIGN_IN_REQUIRED_MESSAGE,
      );
    });
  });

  it("surfaces GitHub's 403 permission message verbatim", async () => {
    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(
      jsonResponse({ message: "Resource not accessible by integration" }, 403),
    );

    const { result } = renderSetIssueLabels(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync(["bug"])).rejects.toThrow(
        "Resource not accessible by integration",
      );
    });
  });

  it("maps any other failure to the labels-specific generic message, leaving the mirror intact", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix login", labels: [] }));

    const fetcher = vi.fn<SetIssueLabelsFetcher>();
    fetcher.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const { result } = renderSetIssueLabels(fetcher);

    await act(async () => {
      await expect(result.current.mutateAsync(["bug"])).rejects.toThrow(
        SET_ISSUE_LABELS_FAILED_MESSAGE,
      );
    });

    expect(await githubItemRepo.get(REPO, 7)).toMatchObject({ labels: [] });
  });
});
