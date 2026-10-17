import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestQueryClient, queryWrapper } from "../../state/test-utils";
import type { Card } from "../../state/cards";
import { ProjectDashboard, type ProjectDashboardProps } from "./project-dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

function renderDashboard(props: Partial<ProjectDashboardProps> & { cards: Card[] }) {
  const client = createTestQueryClient();
  return render(
    <ProjectDashboard
      searchQuery=""
      onSearchChange={vi.fn()}
      filterType="all"
      onFilterTypeChange={vi.fn()}
      {...props}
    />,
    { wrapper: queryWrapper(client) },
  );
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "github:owner/repo:1",
    source: "github",
    type: "issue",
    title: "Setup Next.js",
    body: "Body",
    labels: [],
    columnId: "backlog",
    repo: "owner/repo",
    number: 1,
    state: "open",
    htmlUrl: null,
    linkedPrs: [],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectDashboard", () => {
  const cards: Card[] = [
    makeCard({ id: "1", columnId: "done", state: "closed" }),
    makeCard({ id: "2", columnId: "in-progress" }),
    makeCard({ id: "3", columnId: "todo", labels: ["bug", "critical"] }),
    makeCard({ id: "4", columnId: "backlog" }),
    makeCard({ id: "5", columnId: "backlog" }),
  ];

  it("renders KPI cards and progress percentage", () => {
    renderDashboard({ cards });

    expect(screen.getByRole("region", { name: "Project health dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("kpi-completed")).toHaveTextContent("1/5");
    expect(screen.getByTestId("kpi-in-progress")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-velocity")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("updates search query when typing", () => {
    const onSearch = vi.fn();
    renderDashboard({ cards, onSearchChange: onSearch });

    const input = screen.getByLabelText("Search issues and cards");
    fireEvent.change(input, { target: { value: "Setup" } });
    expect(onSearch).toHaveBeenCalledWith("Setup");
  });

  it("switches filter types from the filters dropdown", () => {
    const onFilter = vi.fn();
    renderDashboard({ cards, onFilterTypeChange: onFilter });

    fireEvent.click(screen.getByRole("button", { name: "Filter cards" }));
    fireEvent.click(screen.getByRole("button", { name: /PRs Only/i }));
    expect(onFilter).toHaveBeenCalledWith("pull");
  });

  it("triggers creation on New Card CTA click", () => {
    const onOpenCreate = vi.fn();
    renderDashboard({ cards, onOpenCreate });

    fireEvent.click(screen.getByRole("button", { name: "New card or issue" }));
    expect(onOpenCreate).toHaveBeenCalled();
  });

  it("opens the in-app issue dialog from the creation menu", async () => {
    renderDashboard({ cards });

    fireEvent.click(screen.getByRole("button", { name: "More creation options" }));
    fireEvent.click(screen.getByRole("button", { name: /GitHub Issue/ }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument(),
    );
  });
});
