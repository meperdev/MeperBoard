import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { githubItemRepo } from "../../data/repositories";
import type { RepoId } from "../../data/types";
import { createTestQueryClient, makeGithubItem, queryWrapper, resetDb } from "../../state/test-utils";
import { IssueDetail, type IssueDetailProps } from "./issue-detail";

const REPO: RepoId = "meperdonas/meperboard";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Raw GitHub issue payload as the PATCH write answers for issue 7. */
function rawIssue(state: "open" | "closed", overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: "Fix auth",
    body: "",
    state,
    html_url: "https://github.com/meperdonas/meperboard/issues/7",
    updated_at: "2026-10-16T12:00:00Z",
    labels: [],
    ...overrides,
  };
}

/**
 * Stub the per-user proxy for the detail's requests: a PATCH answers with the
 * updated raw issue (or the given handler), the repo label catalog read answers
 * with a small catalog, and every other request — the comments read — answers
 * with an empty list.
 */
function stubProxyFetch(handlePatch?: () => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return handlePatch ? handlePatch() : Promise.resolve(jsonResponse(rawIssue("closed")));
    }
    if (String(input).includes("/labels?")) {
      return Promise.resolve(
        jsonResponse([
          { id: 1, name: "bug", color: "d73a4a" },
          { id: 2, name: "feature", color: "0e8a16" },
        ]),
      );
    }
    return Promise.resolve(jsonResponse([]));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDetail(props: IssueDetailProps = {}) {
  const client = createTestQueryClient();
  const utils = render(<IssueDetail {...props} />, { wrapper: queryWrapper(client) });
  return { client, ...utils };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IssueDetail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("renders read-only title, body, labels, state, and linked PRs", async () => {
    await githubItemRepo.upsert(
      makeGithubItem({
        number: 7,
        title: "Fix auth",
        body: "details here",
        state: "open",
        labels: ["bug", "security"],
        linked_prs: [12, 34],
      }),
    );

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fix auth" })).toBeInTheDocument(),
    );

    expect(screen.getByText("details here")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("#34")).toBeInTheDocument();
  });

  it("renders placeholders for empty body, labels, and linked PRs", async () => {
    await githubItemRepo.upsert(
      makeGithubItem({ number: 7, title: "Empty issue", body: "", labels: [], linked_prs: [] }),
    );

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Empty issue" })).toBeInTheDocument(),
    );

    expect(screen.getByText("No description provided.")).toBeInTheDocument();
    expect(screen.getByText("No labels.")).toBeInTheDocument();
    expect(screen.getByText("No linked pull requests.")).toBeInTheDocument();
  });

  it("offers only the comment composer, close/reopen, and labels editor as writes", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Read only" }));
    stubProxyFetch();

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Read only" })).toBeInTheDocument(),
    );

    // The detail's write surfaces are the comment composer, the close/reopen
    // control, and the labels editor (spec github-write-path S7); creating and
    // editing an issue still have no affordance here. "Save" lives inside the
    // labels editor, which only renders after "Edit labels" is activated.
    expect(screen.getByRole("textbox", { name: "New comment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close issue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit labels" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    for (const text of ["Edit", "Create", "Re-label", "Save"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("closes the issue through the proxy and flips the detail to the closed state", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix auth", state: "open" }));
    const fetchMock = stubProxyFetch();

    renderDetail({ repo: REPO, number: 7 });

    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/issues/7",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: "closed" }),
        },
      ),
    );

    expect(await screen.findByRole("button", { name: "Reopen issue" })).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("labels the control for the item's kind and reopens a closed issue", async () => {
    await githubItemRepo.upsert(
      makeGithubItem({ number: 7, title: "Ship auth", kind: "pull", state: "closed" }),
    );
    const fetchMock = stubProxyFetch(() =>
      Promise.resolve(
        jsonResponse(
          rawIssue("open", {
            title: "Ship auth",
            // GitHub answers a PR PATCH with the issue payload that still
            // carries its `pull_request` marker, so the kind survives the map.
            pull_request: { url: "https://api.github.com/repos/meperdonas/meperboard/pulls/7" },
          }),
        ),
      ),
    );

    renderDetail({ repo: REPO, number: 7 });

    fireEvent.click(await screen.findByRole("button", { name: "Reopen pull request" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/issues/7",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: "open" }),
        },
      ),
    );

    expect(await screen.findByRole("button", { name: "Close pull request" })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("disables the control with a pending label while the write is in flight", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix auth", state: "open" }));
    let resolvePatch!: (response: Response) => void;
    stubProxyFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        }),
    );

    renderDetail({ repo: REPO, number: 7 });

    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));

    expect(await screen.findByRole("button", { name: "Closing…" })).toBeDisabled();

    await act(async () => {
      resolvePatch(jsonResponse(rawIssue("closed")));
    });

    expect(await screen.findByRole("button", { name: "Reopen issue" })).toBeInTheDocument();
  });

  it("renders the mapped failure inline and keeps the previous state", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix auth", state: "open" }));
    stubProxyFetch(() =>
      Promise.resolve(jsonResponse({ message: "Resource not accessible by integration" }, 403)),
    );

    renderDetail({ repo: REPO, number: 7 });

    fireEvent.click(await screen.findByRole("button", { name: "Close issue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resource not accessible by integration",
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close issue" })).toBeEnabled();
  });

  it("applies the edited labels to the detail after a successful save", async () => {
    await githubItemRepo.upsert(
      makeGithubItem({ number: 7, title: "Fix auth", labels: ["bug", "security"] }),
    );
    const fetchMock = stubProxyFetch(() =>
      Promise.resolve(jsonResponse(rawIssue("open", { labels: [{ name: "bug" }] }))),
    );

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fix auth" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));

    // The editor lists the repo catalog plus the item's current labels
    // ("security" is on the item but not in the catalog); toggling it off and
    // saving sends the full replacement list.
    fireEvent.click(await screen.findByRole("button", { name: "security" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/issues/7",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ labels: ["bug"] }),
        },
      ),
    );

    // The write-through refreshes the detail from the mirror: the badge row is
    // back and drops the label that the PATCH response no longer lists.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit labels" })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.queryByText("security")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("renders the live comments section with its composer", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix auth" }));
    const fetchMock = stubProxyFetch();

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fix auth" })).toBeInTheDocument(),
    );

    expect(screen.getByRole("region", { name: "Comments" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New comment" })).toBeInTheDocument();

    // The list reads the issue's comments live through the per-user proxy.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github/repos/meperdonas/meperboard/issues/7/comments?per_page=100",
    );
    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());
  });

  it("prompts to select an issue when none is selected", () => {
    renderDetail({});

    expect(screen.getByText(/select an issue/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a not-found message for a missing issue", async () => {
    renderDetail({ repo: REPO, number: 999 });

    await waitFor(() => expect(screen.getByText(/not found/i)).toBeInTheDocument());
  });
});
