import { render, screen, waitFor } from "@testing-library/react";
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

/** Answer the comments read with an empty list so the detail renders cleanly. */
function stubEmptyComments() {
  const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([])));
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

  it("keeps every non-comment mutation out of the detail", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Read only" }));
    stubEmptyComments();

    renderDetail({ repo: REPO, number: 7 });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Read only" })).toBeInTheDocument(),
    );

    // The comment composer is the detail's only write control: no edit, close,
    // or re-label affordances exist yet (those arrive with their own tasks).
    expect(screen.getByRole("textbox", { name: "New comment" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    for (const text of ["Edit", "Create", "Close", "Re-label", "Save"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("renders the live comments section with its composer", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 7, title: "Fix auth" }));
    const fetchMock = stubEmptyComments();

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
