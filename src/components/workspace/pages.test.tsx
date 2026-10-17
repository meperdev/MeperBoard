import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

import { githubItemRepo } from "../../data/repositories";
import {
  createTestQueryClient,
  makeGithubItem,
  queryWrapper,
  resetDb,
} from "../../state/test-utils";
import { BacklogPage } from "./backlog-page";
import { IssuePage } from "./issue-page";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** One issue as the MeperPOS issues endpoint returns it. */
const issuePayloads = [
  {
    number: 1,
    title: "Expenses slice 1",
    body: "",
    state: "open",
    html_url: "https://github.com/meperdonas/meperpos/issues/1",
    updated_at: "2026-08-01T00:00:00Z",
    labels: [],
  },
];

describe("BacklogPage", () => {
  beforeEach(resetDb);

  it("renders the backlog with the app header", async () => {
    const client = createTestQueryClient();
    render(<BacklogPage />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "MeperBoard" })).toHaveAttribute("href", "/");
  });

  it("auto-syncs on load when the last successful sync is stale", async () => {
    window.localStorage.clear();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/auth/me") return Promise.resolve(jsonResponse({}, 401));
      return Promise.resolve(jsonResponse(issuePayloads));
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const client = createTestQueryClient();
      render(<BacklogPage />, { wrapper: queryWrapper(client) });

      // The mirrored issue shows up without a Sync click.
      await waitFor(() => expect(screen.getByText("Expenses slice 1")).toBeInTheDocument());

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/MeperDonas/MeperPOS/issues?state=all&per_page=100",
      );
    } finally {
      vi.unstubAllGlobals();
      window.localStorage.clear();
    }
  });
});

describe("IssuePage", () => {
  beforeEach(resetDb);

  it("renders the issue detail for the selected number", async () => {
    await githubItemRepo.upsert(
      makeGithubItem({
        repo: "MeperDonas/MeperPOS",
        number: 8,
        title: "Expenses slice 1",
        body: "details",
      }),
    );

    const client = createTestQueryClient();
    render(<IssuePage number={8} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Expenses slice 1" })).toBeInTheDocument());
    expect(screen.getByText("details")).toBeInTheDocument();
  });

  it("shows the not-found placeholder for an unknown number", async () => {
    const client = createTestQueryClient();
    render(<IssuePage number={999} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByText(/issue not found/i)).toBeInTheDocument());
  });
});
