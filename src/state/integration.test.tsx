import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localItemRepo } from "../data/repositories";
import { aggregateSlices } from "../domain/grouping";
import {
  createTestQueryClient,
  makeLocalItem,
  queryWrapper,
  resetDb,
} from "./test-utils";
import { useBacklog } from "./useBacklog";
import { useBoard } from "./useBoard";
import { useIssueDetail } from "./useIssueDetail";
import { useSync } from "./useSync";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Nine issues mirroring the real MeperPOS repo (9 non-PR issues). The five
 * "Expenses slice N" issues follow the spec's title heuristic and group under
 * an "Expenses" epic; the other four are top-level.
 */
const MEPERPOS_ISSUES = [
  { number: 2, title: "Extender importador multi-hoja", body: null, state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/2", updated_at: "2026-08-01T00:00:00Z", labels: [] },
  { number: 3, title: "Ajustes generales de UI y estilos", body: null, state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/3", updated_at: "2026-08-01T00:00:00Z", labels: [] },
  { number: 8, title: "Expenses slice 1", body: "data models + categories", state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/8", updated_at: "2026-08-02T00:00:00Z", labels: [] },
  { number: 10, title: "Expenses slice 2", body: "", state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/10", updated_at: "2026-08-03T00:00:00Z", labels: [] },
  { number: 12, title: "Expenses slice 3", body: "", state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/12", updated_at: "2026-08-04T00:00:00Z", labels: [] },
  { number: 14, title: "Expenses slice 4", body: "", state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/14", updated_at: "2026-08-05T00:00:00Z", labels: [] },
  { number: 16, title: "Expenses slice 5", body: "", state: "open", html_url: "https://github.com/meperdonas/meperpos/issues/16", updated_at: "2026-08-06T00:00:00Z", labels: [] },
  { number: 18, title: "Salidas (expenses) module - final integration", body: null, state: "closed", html_url: "https://github.com/meperdonas/meperpos/issues/18", updated_at: "2026-08-07T00:00:00Z", labels: [] },
  { number: 20, title: "Expenses: read-only detail view", body: null, state: "closed", html_url: "https://github.com/meperdonas/meperpos/issues/20", updated_at: "2026-08-08T00:00:00Z", labels: [] },
];

function FlowProbe({ fetcher }: { fetcher: (url: string) => Promise<Response> }) {
  const sync = useSync({ owner: "meperdev", name: "MeperPOS", fetcher });
  const board = useBoard();
  const backlog = useBacklog();
  const detail = useIssueDetail("meperdev/MeperPOS", 8);

  const boardCards = (board.data?.columns ?? []).flatMap((column) => column.cards);
  const backlogCards = backlog.data ?? [];

  return (
    <div>
      <button data-testid="sync" onClick={() => sync.mutate()}>
        sync
      </button>
      <span data-testid="board-count">{boardCards.length}</span>
      <span data-testid="backlog-count">{backlogCards.length}</span>
      <span data-testid="detail-title">{detail.data?.title ?? "none"}</span>
      <ul data-testid="board-titles">
        {boardCards.map((card) => (
          <li key={card.id}>{card.title}</li>
        ))}
      </ul>
    </div>
  );
}

describe("sync → board → backlog → detail integration", () => {
  beforeEach(resetDb);

  it("imports nine issues and reflects them across every view", async () => {
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(MEPERPOS_ISSUES));
    const client = createTestQueryClient();

    render(<FlowProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("board-count")).toHaveTextContent("0"));

    act(() => screen.getByTestId("sync").click());

    await waitFor(() => expect(screen.getByTestId("board-count")).toHaveTextContent("9"));
    await waitFor(() => expect(screen.getByTestId("backlog-count")).toHaveTextContent("9"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-title")).toHaveTextContent("Expenses slice 1"),
    );

    const titles = screen
      .getByTestId("board-titles")
      .querySelectorAll("li");
    expect(titles).toHaveLength(9);

    // Read-only: the connector fetched only the issues GET endpoint.
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/meperdev/MeperPOS/issues?state=all&per_page=100",
    );
  });

  it("groups the five Expenses slices under a single Expenses epic", () => {
    const slices = MEPERPOS_ISSUES.map((issue) => ({ id: `#${issue.number}`, title: issue.title }));
    const result = aggregateSlices(slices);

    const expenses = result.groups.find((group) => group.epicTitle === "Expenses");
    expect(expenses).toBeDefined();
    expect(expenses?.slices.map((slice) => slice.slice)).toEqual([1, 2, 3, 4, 5]);
    expect(expenses?.slices).toHaveLength(5);

    // Non-slice issues stay top-level and are never dropped.
    expect(result.ungrouped).toHaveLength(4);
  });

  it("leaves local cards untouched by a sync", async () => {
    await localItemRepo.upsert(makeLocalItem({ id: "l1", title: "Buy milk", column_id: "todo" }));

    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    fetcher.mockResolvedValue(jsonResponse(MEPERPOS_ISSUES));
    const client = createTestQueryClient();

    render(<FlowProbe fetcher={fetcher} />, { wrapper: queryWrapper(client) });

    await waitFor(() => expect(screen.getByTestId("board-count")).toHaveTextContent("1"));
    act(() => screen.getByTestId("sync").click());

    // After sync: 9 GitHub cards + the local card that survived = 10 on the board.
    await waitFor(() => expect(screen.getByTestId("board-count")).toHaveTextContent("10"));

    expect(await localItemRepo.get("l1")).toMatchObject({ title: "Buy milk" });
  });
});
