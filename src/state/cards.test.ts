import { beforeEach, describe, expect, it } from "vitest";

import { githubItemRepo, localItemRepo } from "../data/repositories";
import {
  buildBoard,
  DEFAULT_BOARD_COLUMNS,
  filterCards,
  loadBoard,
  loadCards,
  sortCards,
  toCard,
} from "./cards";
import type { Card } from "./cards";
import { makeGithubItem, makeLocalItem, resetDb } from "./test-utils";

describe("toCard (column resolution)", () => {
  it("maps an open issue to Backlog", () => {
    const card = toCard(makeGithubItem({ number: 3, state: "open" }));
    expect(card).toMatchObject({
      id: "github:meperdonas/meperboard:3",
      source: "github",
      type: "issue",
      columnId: "backlog",
      number: 3,
    });
  });

  it("maps a closed issue to Done", () => {
    expect(toCard(makeGithubItem({ state: "closed" })).columnId).toBe("done");
  });

  it("maps an open PR to In Review and a closed PR to Done", () => {
    expect(toCard(makeGithubItem({ kind: "pull", state: "open" })).columnId).toBe("in-review");
    expect(toCard(makeGithubItem({ kind: "pull", state: "closed" })).columnId).toBe("done");
  });

  it("honors an explicit column_id over the strategy", () => {
    expect(toCard(makeGithubItem({ state: "open", column_id: "done" })).columnId).toBe("done");
  });

  it("maps a local card to its stored column", () => {
    const card = toCard(makeLocalItem({ id: "l9", column_id: "doing" }));
    expect(card).toMatchObject({
      id: "local:l9",
      source: "local",
      type: "local",
      columnId: "doing",
    });
  });
});

describe("filterCards", () => {
  const cards: Card[] = [
    toCard(makeGithubItem({ number: 1, kind: "issue", labels: ["bug"] })),
    toCard(makeGithubItem({ number: 2, kind: "pull", labels: ["feature"] })),
    toCard(makeLocalItem({ id: "l1", labels: ["bug"] })),
  ];

  it("filters by type", () => {
    expect(filterCards(cards, { type: "issue" })).toHaveLength(1);
    expect(filterCards(cards, { type: "pull" })).toHaveLength(1);
    expect(filterCards(cards, { type: "local" })).toHaveLength(1);
  });

  it("filters by label", () => {
    expect(filterCards(cards, { label: "bug" })).toHaveLength(2);
    expect(filterCards(cards, { label: "feature" })).toHaveLength(1);
  });

  it("combines label and type filters", () => {
    expect(filterCards(cards, { label: "bug", type: "local" })).toHaveLength(1);
  });

  it("filters by repo", () => {
    const multiRepoCards: Card[] = [
      toCard(makeGithubItem({ repo: "acme/a", number: 1 })),
      toCard(makeGithubItem({ repo: "acme/b", number: 2 })),
      toCard(makeLocalItem({ id: "l1" })),
    ];
    expect(filterCards(multiRepoCards, { repo: "acme/a" })).toHaveLength(1);
    expect(filterCards(multiRepoCards, { repo: "acme/b" })).toHaveLength(1);
  });

  it("returns all cards when no filters are given", () => {
    expect(filterCards(cards, {})).toHaveLength(3);
    expect(filterCards(cards)).toHaveLength(3);
  });
});

describe("sortCards", () => {
  const cards: Card[] = [
    toCard(makeGithubItem({ number: 1, title: "zeta", synced_at: "2026-08-03T00:00:00Z" })),
    toCard(makeGithubItem({ number: 2, title: "alpha", synced_at: "2026-08-01T00:00:00Z" })),
    toCard(makeLocalItem({ id: "l1", title: "middle", created_at: "2026-08-02T00:00:00Z" })),
  ];

  it("sorts by title ascending and descending", () => {
    expect(sortCards(cards, { field: "title" }).map((c) => c.title)).toEqual([
      "alpha",
      "middle",
      "zeta",
    ]);
    expect(sortCards(cards, { field: "title", direction: "desc" }).map((c) => c.title)).toEqual([
      "zeta",
      "middle",
      "alpha",
    ]);
  });

  it("sorts by created date", () => {
    expect(sortCards(cards, { field: "created" }).map((c) => c.createdAt)).toEqual([
      "2026-08-01T00:00:00Z",
      "2026-08-02T00:00:00Z",
      "2026-08-03T00:00:00Z",
    ]);
  });

  it("sorts by issue number ascending and descending", () => {
    expect(sortCards(cards, { field: "number" }).map((c) => c.number)).toEqual([1, 2, null]);
    expect(sortCards(cards, { field: "number", direction: "desc" }).map((c) => c.number)).toEqual([
      null,
      2,
      1,
    ]);
  });

  it("returns a new array and does not mutate the input", () => {
    const input = [...cards];
    sortCards(cards, { field: "title" });
    expect(cards).toEqual(input);
  });
});

describe("buildBoard", () => {
  it("groups cards into ordered columns, leaving empty columns with no cards", () => {
    const cards = [
      toCard(makeGithubItem({ number: 1, state: "open" })),
      toCard(makeGithubItem({ number: 2, state: "closed" })),
      toCard(makeLocalItem({ id: "l1", column_id: "in-progress" })),
    ];

    const board = buildBoard(DEFAULT_BOARD_COLUMNS, cards);

    expect(board.columns.map((c) => c.id)).toEqual([
      "backlog",
      "todo",
      "in-progress",
      "in-review",
      "done",
    ]);
    expect(board.columns[0].cards).toHaveLength(1); // backlog
    expect(board.columns[1].cards).toHaveLength(0); // todo (empty)
    expect(board.columns[2].cards).toHaveLength(1); // in-progress (doing)
    expect(board.columns[4].cards).toHaveLength(1); // done
  });

  it("sorts cards in the Done column from most recent to oldest", () => {
    const cards = [
      toCard(makeGithubItem({ number: 1, state: "closed", github_updated_at: "2026-08-01T00:00:00Z" })),
      toCard(makeGithubItem({ number: 2, state: "closed", github_updated_at: "2026-08-03T00:00:00Z" })),
      toCard(makeGithubItem({ number: 3, state: "closed", github_updated_at: "2026-08-02T00:00:00Z" })),
    ];

    const board = buildBoard(DEFAULT_BOARD_COLUMNS, cards);
    const doneCards = board.columns.find((c) => c.id === "done")?.cards ?? [];

    expect(doneCards.map((c) => c.number)).toEqual([2, 3, 1]);
  });
});

describe("loadCards / loadBoard (IndexedDB)", () => {
  beforeEach(resetDb);

  it("projects persisted github + local items into a unified card list", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 1 }));
    await githubItemRepo.upsert(makeGithubItem({ number: 2, kind: "pull", state: "open" }));
    await localItemRepo.upsert(makeLocalItem({ id: "l1" }));

    const cards = await loadCards("meperdonas/meperboard");
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.source))).toEqual(new Set(["github", "local"]));
  });

  it("loadBoard returns the default columns when the columns table is empty", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 1 }));

    const board = await loadBoard("meperdonas/meperboard");
    expect(board.columns).toHaveLength(5);
    expect(board.columns[0].cards).toHaveLength(1);
  });

  it("resolves a GitHub card through a column override", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 1, state: "open" }));
    await githubItemRepo.setColumnOverride("meperdonas/meperboard", 1, "done");

    const cards = await loadCards("meperdonas/meperboard");
    const card = cards.find((c) => c.number === 1);
    expect(card?.columnId).toBe("done");
  });

  it("keeps the strategy mapping when no override exists", async () => {
    await githubItemRepo.upsert(makeGithubItem({ number: 1, state: "open" }));

    const cards = await loadCards("meperdonas/meperboard");
    const card = cards.find((c) => c.number === 1);
    expect(card?.columnId).toBe("backlog");
  });

  it("filters github items to the active repo and keeps local cards", async () => {
    await githubItemRepo.upsert(makeGithubItem({ repo: "meperdonas/meperboard", number: 1 }));
    await githubItemRepo.upsert(makeGithubItem({ repo: "acme/widgets", number: 1 }));
    await localItemRepo.upsert(makeLocalItem({ id: "l1" }));

    const cards = await loadCards("meperdonas/meperboard");
    expect(cards).toHaveLength(2); // 1 github (meperboard) + 1 local
    expect(cards.some((c) => c.repo === "acme/widgets")).toBe(false);
  });

  it("defaults to the DEFAULT_REPO when no active repo is given", async () => {
    await githubItemRepo.upsert(makeGithubItem({ repo: "meperdev/MeperPOS", number: 1 }));
    await githubItemRepo.upsert(makeGithubItem({ repo: "acme/widgets", number: 1 }));

    const cards = await loadCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].repo).toBe("meperdev/MeperPOS");
  });

  it("loads cards from multiple active repos", async () => {
    await githubItemRepo.upsert(makeGithubItem({ repo: "acme/a", number: 1 }));
    await githubItemRepo.upsert(makeGithubItem({ repo: "acme/b", number: 2 }));
    await githubItemRepo.upsert(makeGithubItem({ repo: "acme/c", number: 3 }));
    await localItemRepo.upsert(makeLocalItem({ id: "l1" }));

    const cards = await loadCards(["acme/a", "acme/b"]);
    expect(cards).toHaveLength(3); // 2 github (a + b) + 1 local
    expect(cards.some((c) => c.repo === "acme/c")).toBe(false);
  });

  it("falls back to DEFAULT_REPO_ID when given an empty array", async () => {
    await githubItemRepo.upsert(makeGithubItem({ repo: "meperdev/MeperPOS", number: 1 }));
    const cards = await loadCards([]);
    expect(cards).toHaveLength(1);
    expect(cards[0].repo).toBe("meperdev/MeperPOS");
  });
});
