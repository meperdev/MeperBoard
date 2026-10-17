import { useQuery, type QueryKey } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { repoRepo } from "../../data/repositories";
import { queryKeys } from "../../state/query-keys";
import { ACTIVE_REPO_KEY } from "../../state/use-repos";
import { createTestQueryClient, queryWrapper, resetDb } from "../../state/test-utils";
import { CreateIssueTrigger } from "./create-issue-trigger";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const createdIssue = {
  number: 7,
  title: "Fix login",
  html_url: "https://github.com/meperdonas/meperboard/issues/7",
};

function renderTrigger() {
  const client = createTestQueryClient();
  const utils = render(<CreateIssueTrigger />, { wrapper: queryWrapper(client) });
  return { client, ...utils };
}

/** Counting probe: proves the affected queries actually refetch after a create. */
function RefetchProbe({ queryKey, onFetch }: { queryKey: QueryKey; onFetch: () => void }) {
  useQuery({
    queryKey,
    queryFn: async () => {
      onFetch();
      return null;
    },
  });
  return null;
}

async function openDialog(client: ReturnType<typeof createTestQueryClient>) {
  fireEvent.click(screen.getByRole("button", { name: "New issue" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument(),
  );
  // The dialog resolves its target repo from the shared active-repo query.
  await waitFor(() => expect(client.getQueryState(ACTIVE_REPO_KEY)?.status).toBe("success"));
}

function fillAndSubmit(title: string, body?: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  if (body !== undefined) {
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: body } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Create issue" }));
}

describe("create issue dialog", () => {
  beforeEach(async () => {
    await resetDb();
    await repoRepo.setActive("meperdonas", "meperboard");
  });

  it("opens the create dialog from the trigger", async () => {
    renderTrigger();

    fireEvent.click(screen.getByRole("button", { name: "New issue" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("keeps submit disabled until the title has non-whitespace text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();
      await openDialog(client);

      const submit = screen.getByRole("button", { name: "Create issue" });
      expect(submit).toBeDisabled();

      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
      expect(submit).toBeDisabled();
      fireEvent.click(submit);
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Fix login" } });
      expect(submit).toBeEnabled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("posts the issue to the active repo through the proxy", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(createdIssue, 201)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();
      await openDialog(client);

      fillAndSubmit("Fix login", "Some details");

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/github/repos/meperdonas/meperboard/issues",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Fix login", body: "Some details" }),
          },
        ),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("closes the dialog and refreshes the board, backlog, and detail after success", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(createdIssue, 201)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const boardFetch = vi.fn();
      const backlogFetch = vi.fn();
      const detailFetch = vi.fn();
      const client = createTestQueryClient();
      render(
        <>
          <RefetchProbe queryKey={queryKeys.board} onFetch={boardFetch} />
          <RefetchProbe queryKey={queryKeys.backlog} onFetch={backlogFetch} />
          <RefetchProbe queryKey={queryKeys.issueDetail} onFetch={detailFetch} />
          <CreateIssueTrigger />
        </>,
        { wrapper: queryWrapper(client) },
      );

      await waitFor(() => {
        expect(boardFetch).toHaveBeenCalledTimes(1);
        expect(backlogFetch).toHaveBeenCalledTimes(1);
        expect(detailFetch).toHaveBeenCalledTimes(1);
      });

      await openDialog(client);
      fillAndSubmit("Fix login");

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "New issue" })).not.toBeInTheDocument(),
      );
      await waitFor(() => {
        expect(boardFetch).toHaveBeenCalledTimes(2);
        expect(backlogFetch).toHaveBeenCalledTimes(2);
        expect(detailFetch).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows the writes-disabled message on 405 and stays open", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "Method not allowed" }, 405)),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();
      await openDialog(client);

      fillAndSubmit("Fix login");

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/read-only/i),
      );
      expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows GitHub's permission message on 403", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ message: "Resource not accessible by integration" }, 403),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();
      await openDialog(client);

      fillAndSubmit("Fix login");

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Resource not accessible by integration",
        ),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("closes without submitting on Escape, backdrop, or Cancel", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();

      await openDialog(client);
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "New issue" })).not.toBeInTheDocument(),
      );

      await openDialog(client);
      fireEvent.click(screen.getByTestId("create-issue-backdrop"));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "New issue" })).not.toBeInTheDocument(),
      );

      await openDialog(client);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "New issue" })).not.toBeInTheDocument(),
      );

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a live markdown preview of the description", async () => {
    const { client } = renderTrigger();
    await openDialog(client);

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "**Important** context with `code`" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/context/i)).not.toBeInTheDocument();
  });

  it("shows an empty preview note when the description is blank", async () => {
    const { client } = renderTrigger();
    await openDialog(client);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument();
  });

  it("creates the issue with Cmd/Ctrl+Enter", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(createdIssue, 201)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { client } = renderTrigger();
      await openDialog(client);

      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Shortcut issue" } });
      fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Enter", metaKey: true });

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/github/repos/meperdonas/meperboard/issues",
          expect.objectContaining({ method: "POST" }),
        ),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
