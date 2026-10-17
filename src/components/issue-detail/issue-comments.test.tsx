import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient, queryWrapper } from "../../state/test-utils";
import { IssueComments } from "./issue-comments";

const REPO = "meperdonas/meperboard";
const NUMBER = 7;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    body: "First from Alice",
    html_url: "https://github.com/meperdonas/meperboard/issues/7#issuecomment-11",
    created_at: hoursAgo(3),
    user: { login: "alice" },
    ...overrides,
  };
}

/** Route the proxy calls the component makes: GET list, POST new comment. */
function stubProxy(onGet: () => Promise<Response>, onPost: () => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === "POST" ? onPost() : onGet(),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderComments() {
  const client = createTestQueryClient();
  const utils = render(<IssueComments repo={REPO} number={NUMBER} />, {
    wrapper: queryWrapper(client),
  });
  return { client, ...utils };
}

function submitComment(text: string) {
  fireEvent.change(screen.getByLabelText("New comment"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Comment" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IssueComments", () => {
  it("lists the authors, relative dates, and markdown bodies in GitHub's order", async () => {
    const list = [
      makeComment({ id: 11, body: "First from Alice", created_at: hoursAgo(3) }),
      makeComment({
        id: 12,
        body: "Then Bob",
        created_at: hoursAgo(1),
        user: { login: "bob" },
      }),
    ];
    stubProxy(
      () => Promise.resolve(jsonResponse(list)),
      () => Promise.resolve(jsonResponse({}, 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("First from Alice")).toBeInTheDocument());
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
    expect(screen.getByText("1h ago")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("First from Alice");
    expect(items[1]).toHaveTextContent("Then Bob");
  });

  it("shows an empty state when the issue has no comments", async () => {
    stubProxy(
      () => Promise.resolve(jsonResponse([])),
      () => Promise.resolve(jsonResponse({}, 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());
  });

  it("shows a loading state until the comments arrive", async () => {
    let resolveGet: (response: Response) => void = () => {};
    stubProxy(
      () => new Promise<Response>((resolve) => (resolveGet = resolve)),
      () => Promise.resolve(jsonResponse({}, 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/loading comments/i));

    await act(async () => {
      resolveGet(jsonResponse([]));
    });

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
  });

  it("shows an error in place when the comments request fails", async () => {
    stubProxy(
      () => Promise.resolve(jsonResponse({ message: "Not Found" }, 404)),
      () => Promise.resolve(jsonResponse({}, 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText(/could not load comments/i)).toBeInTheDocument());
  });

  it("blocks submit while the draft is empty or the post is in flight", async () => {
    let resolvePost: (response: Response) => void = () => {};
    const fetchMock = stubProxy(
      () => Promise.resolve(jsonResponse([])),
      () => new Promise<Response>((resolve) => (resolvePost = resolve)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());

    const submit = screen.getByRole("button", { name: "Comment" });
    const draft = screen.getByLabelText("New comment");
    const postCalls = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

    expect(submit).toBeDisabled();
    fireEvent.change(draft, { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(postCalls()).toHaveLength(0);

    fireEvent.change(draft, { target: { value: "Looks good" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(postCalls()).toHaveLength(1);

    await act(async () => {
      resolvePost(jsonResponse(makeComment({ id: 42, body: "Looks good" }), 201));
    });
    await waitFor(() => expect(submit).toBeDisabled());
  });

  it("posts the comment to the issue through the proxy with a JSON body", async () => {
    const fetchMock = stubProxy(
      () => Promise.resolve(jsonResponse([])),
      () => Promise.resolve(jsonResponse(makeComment({ id: 42, body: "Looks good" }), 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());
    submitComment("Looks good");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/github/repos/meperdonas/meperboard/issues/7/comments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: "Looks good" }),
        },
      ),
    );
  });

  it("shows the writes-disabled message on 405 and keeps the draft", async () => {
    stubProxy(
      () => Promise.resolve(jsonResponse([])),
      () => Promise.resolve(jsonResponse({ error: "Method not allowed" }, 405)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());
    submitComment("Looks good");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/read-only/i));
    expect(screen.getByLabelText("New comment")).toHaveValue("Looks good");
  });

  it("clears the draft and shows the posted comment after success", async () => {
    let listCalls = 0;
    const posted = makeComment({ id: 42, body: "Fixed in 1.2", created_at: hoursAgo(0) });
    stubProxy(
      () => {
        listCalls += 1;
        return Promise.resolve(jsonResponse(listCalls === 1 ? [] : [posted]));
      },
      () => Promise.resolve(jsonResponse(posted, 201)),
    );

    renderComments();

    await waitFor(() => expect(screen.getByText("No comments yet.")).toBeInTheDocument());
    submitComment("Fixed in 1.2");

    await waitFor(() => expect(screen.getByLabelText("New comment")).toHaveValue(""));
    await waitFor(() => expect(screen.getByText("Fixed in 1.2")).toBeInTheDocument());
    expect(listCalls).toBeGreaterThanOrEqual(2);
  });
});
