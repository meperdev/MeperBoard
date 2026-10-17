import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

import { githubItemRepo, localItemRepo, repoRepo } from "../../data/repositories";
import {
  loadLocalCardsCollapsed,
  saveLocalCardsCollapsed,
} from "../../lib/local-cards-collapsed";
import {
  createTestQueryClient,
  makeGithubItem,
  makeLocalItem,
  queryWrapper,
  resetDb,
} from "../../state/test-utils";
import { BoardWorkspace } from "./board-workspace";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
  {
    number: 2,
    title: "Extender importador multi-hoja",
    body: null,
    state: "open",
    html_url: "https://github.com/meperdonas/meperpos/issues/2",
    updated_at: "2026-08-01T00:00:00Z",
    labels: [],
  },
];

function renderWorkspace() {
  const client = createTestQueryClient();
  const utils = render(<BoardWorkspace />, { wrapper: queryWrapper(client) });
  return { client, ...utils };
}

function columnSection(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
}

describe("BoardWorkspace", () => {
  beforeEach(resetDb);

  it("renders the board, local cards, and a sync control", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kanban board" })).toBeInTheDocument(),
    );

    expect(screen.getByRole("region", { name: "Local cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
  });

  it("imports issues through the proxy fetcher and renders them on the board", async () => {
    // URL-aware so the header's `/api/auth/me` check resolves as logged out
    // (a fresh Response per call; `mockResolvedValue` shares one body and a
    // second `.json()` on it would throw "Body is unusable").
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/auth/me") return Promise.resolve(jsonResponse({}, 401));
      return Promise.resolve(jsonResponse(issuePayloads));
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderWorkspace();

      await waitFor(() =>
        expect(screen.getByRole("region", { name: "Kanban board" })).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole("button", { name: /sync/i }));

      await waitFor(() =>
        expect(within(columnSection("Backlog")).getByText("Expenses slice 1")).toBeInTheDocument(),
      );

      // The default source repo is MeperPOS.
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/MeperDonas/MeperPOS/issues?state=all&per_page=100",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders local and GitHub cards together on the board", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    await localItemRepo.upsert(makeLocalItem({ id: "l1", title: "Buy milk", column_id: "todo" }));
    await githubItemRepo.upsert(makeGithubItem({ number: 1, state: "open", title: "Fix login" }));

    renderWorkspace();

    await waitFor(() => {
      expect(within(columnSection("To Do")).getByText("Buy milk")).toBeInTheDocument();
      expect(within(columnSection("Backlog")).getByText("Fix login")).toBeInTheDocument();
    });
  });

  it("opens the create-issue dialog from the board", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kanban board" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "New issue" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
});

describe("Local cards rail", () => {
  beforeEach(async () => {
    await resetDb();
    // Collapse state persists in localStorage — isolate every test.
    window.localStorage.clear();
  });

  it("renders stat pills per kind with a stable test id", async () => {
    await repoRepo.setActive("meperdonas", "meperboard");
    await githubItemRepo.upsert(makeGithubItem({ number: 1, state: "open", title: "Fix login" }));
    await githubItemRepo.upsert(
      makeGithubItem({ number: 2, kind: "pull", state: "open", title: "Update deps" }),
    );
    await localItemRepo.upsert(makeLocalItem({ id: "l1", title: "Buy milk" }));

    renderWorkspace();

    const pills = screen.getByTestId("total-count");
    await waitFor(() => expect(pills).toHaveTextContent("1 issues"));
    expect(pills).toHaveTextContent("1 PRs");
    expect(pills).toHaveTextContent("1 local");
  });

  it("collapses and reopens the rail through the toolbar toggle", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kanban board" })).toBeInTheDocument(),
    );

    const toggle = screen.getByTestId("rail-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "local-cards-panel");
    expect(screen.getByRole("region", { name: "Local cards" })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(loadLocalCardsCollapsed()).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Local cards" })).not.toBeInTheDocument(),
    );

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Local cards" })).toBeInTheDocument(),
    );
  });

  it("restores a persisted collapsed state on mount", async () => {
    saveLocalCardsCollapsed(true);

    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kanban board" })).toBeInTheDocument(),
    );

    expect(screen.getByTestId("rail-toggle")).toHaveAttribute("aria-expanded", "false");
  });
});
