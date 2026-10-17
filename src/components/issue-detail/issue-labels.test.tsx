import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GithubItem } from "../../data/types";
import { createTestQueryClient, makeGithubItem, queryWrapper } from "../../state/test-utils";
import { IssueLabels } from "./issue-labels";

const REPO = "meperdonas/meperboard";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Raw GitHub label payloads as the repo's labels endpoint returns them. */
const labelCatalog = [
  { id: 1, name: "bug", color: "d73a4a" },
  { id: 2, name: "feature", color: "0e8a16" },
];

/** Raw GitHub issue payload as the labels PATCH answers. */
function rawIssue(labels: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: "Fix auth",
    body: "",
    state: "open",
    html_url: "https://github.com/meperdonas/meperboard/issues/7",
    updated_at: "2026-10-16T12:00:00Z",
    labels,
    ...overrides,
  };
}

/**
 * Stub the per-user proxy: GETs answer the repo label catalog (or the given
 * handler), PATCHes answer the updated raw issue (or the given handler).
 */
function stubProxy(getLabels: () => Promise<Response>, patch?: () => Promise<Response>) {
  const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return patch ? patch() : Promise.resolve(jsonResponse(rawIssue([{ name: "bug" }])));
    }
    return getLabels();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderLabels(item: GithubItem) {
  const client = createTestQueryClient();
  const utils = render(<IssueLabels item={item} />, { wrapper: queryWrapper(client) });
  return { client, ...utils };
}

function patchCalls(fetchMock: ReturnType<typeof stubProxy>) {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "PATCH",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IssueLabels", () => {
  it("opens the editor with the repo catalog and the item's current selection", async () => {
    const fetchMock = stubProxy(() => Promise.resolve(jsonResponse(labelCatalog)));

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    // Read view first: the item's labels plus the Edit affordance.
    expect(screen.getByText("bug")).toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "Edit labels" });

    fireEvent.click(edit);

    // The catalog comes live through the per-user proxy, one full page.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/labels?per_page=100",
      ),
    );
    expect(await screen.findByRole("button", { name: "feature" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bug" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "feature" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit labels" })).not.toBeInTheDocument();
  });

  it("toggles a label and saves the full replacement list through the proxy", async () => {
    const fetchMock = stubProxy(
      () => Promise.resolve(jsonResponse(labelCatalog)),
      () => Promise.resolve(jsonResponse(rawIssue([{ name: "bug" }, { name: "feature" }]))),
    );

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    fireEvent.click(await screen.findByRole("button", { name: "feature" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/issues/7",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ labels: ["bug", "feature"] }),
        },
      ),
    );

    // The editor closes once the write succeeded.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit labels" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("discards the pending selection on cancel", async () => {
    const fetchMock = stubProxy(() => Promise.resolve(jsonResponse(labelCatalog)));

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    const feature = await screen.findByRole("button", { name: "feature" });
    fireEvent.click(feature);
    expect(feature).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // No write happened and the read view still shows the original labels.
    expect(patchCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.queryByText("feature")).not.toBeInTheDocument();

    // Re-opening starts again from the item's labels.
    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    await screen.findByRole("button", { name: "feature" });
    expect(screen.getByRole("button", { name: "feature" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "bug" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables the editor while the save is in flight", async () => {
    let resolvePatch!: (response: Response) => void;
    stubProxy(
      () => Promise.resolve(jsonResponse(labelCatalog)),
      () =>
        new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        }),
    );

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    await screen.findByRole("button", { name: "bug" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "feature" })).toBeDisabled();

    await act(async () => {
      resolvePatch(jsonResponse(rawIssue([{ name: "bug" }])));
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit labels" })).toBeInTheDocument(),
    );
  });

  it("renders a failed save inline and keeps the editor open", async () => {
    stubProxy(
      () => Promise.resolve(jsonResponse(labelCatalog)),
      () =>
        Promise.resolve(
          jsonResponse({ message: "Resource not accessible by integration" }, 403),
        ),
    );

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    await screen.findByRole("button", { name: "bug" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resource not accessible by integration",
    );
    // The editor stays open, retryable, with the selection intact.
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "bug" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a message when the repo catalog fails to load", async () => {
    stubProxy(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404)));

    renderLabels(makeGithubItem({ number: 7, labels: ["bug"] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));

    expect(await screen.findByText("Could not load the repo labels.")).toBeInTheDocument();
  });
});
