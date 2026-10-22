import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient, queryWrapper } from "../../state/test-utils";
import { CommandPalette, TOGGLE_LOCAL_CARDS_EVENT } from "./command-palette";
import { OPEN_REPO_SWITCHER_EVENT } from "./repo-switcher";

const account = {
  login: "meperdonas",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchHandler = (init?: RequestInit) => Response;

function mockFetch(handlers: Record<string, FetchHandler>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const handler = handlers[url];
    if (!handler) return jsonResponse({ error: "not found" }, 404);
    return handler(init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function openPalette() {
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(screen.getByRole("combobox")).toBeInTheDocument();
}

describe("CommandPalette", () => {
  let client: ReturnType<typeof createTestQueryClient>;
  let originalLocation: Location;

  beforeEach(() => {
    client = createTestQueryClient();
    originalLocation = window.location;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("opens on the Cmd/Ctrl+K shortcut and renders the command groups", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    const { container } = render(<CommandPalette />, { wrapper: queryWrapper(client) });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Cards")).toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it("opens from the header search pill", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });

    fireEvent.click(screen.getByRole("button", { name: /open command palette/i }));

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("filters commands as the query changes", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dark" } });

    expect(screen.getByRole("option", { name: /switch to dark/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /go to board/i })).not.toBeInTheDocument();
  });

  it("navigates to the board when Go to Board is activated with Enter", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, href: originalLocation.href },
    });
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(assign).toHaveBeenCalledWith("/");
  });

  it("switches to the dark theme from the Theme group", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dark" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(window.localStorage.getItem("meperboard-theme")).toBe("dark");
  });

  it("switches the accent palette from the Theme group", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "terracotta" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(window.localStorage.getItem("meperboard-accent")).toBe("terracotta");
    expect(document.documentElement.dataset.accent).toBe("terracotta");
  });

  it("starts the GitHub login flow when Connect GitHub is activated while logged out", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, href: originalLocation.href },
    });
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "connect" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(assign).toHaveBeenCalledWith("/api/auth/login");
  });

  it("disconnects through the Auth group when authenticated", async () => {
    mockFetch({
      "/api/auth/me": () => jsonResponse(account),
      "/api/auth/logout": () => jsonResponse({ ok: true }),
    });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    // Wait for the /me check to resolve before the Auth group shows Disconnect.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /disconnect/i })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "disconnect" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }),
    );
  });

  it("opens the repo switcher from the Switch repository command", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    const option = screen.getByRole("option", { name: /switch repository/i });
    expect(option).not.toHaveAttribute("aria-disabled", "true");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "switch repo" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_REPO_SWITCHER_EVENT }),
    );
  });

  it("runs the Sync now quick action through the proxy fetcher", async () => {
    mockFetch({
      "/api/auth/me": () => jsonResponse({}, 401),
      "/api/github/repos/meperdev/MeperPOS/issues?state=all&per_page=100": () =>
        jsonResponse([]),
    });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sync" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/github/repos/meperdev/MeperPOS/issues?state=all&per_page=100",
      ),
    );
  });

  it("closes on Escape", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("dispatches the local-cards toggle event from the Quick Actions group", () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "toggle local" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: TOGGLE_LOCAL_CARDS_EVENT }),
    );
  });

  it("navigates options with ArrowDown/ArrowUp and executes active option on Enter", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, href: originalLocation.href },
    });
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });
    render(<CommandPalette />, { wrapper: queryWrapper(client) });
    openPalette();

    const input = screen.getByRole("combobox");
    // Initially option 0 is Go to Board. Pressing ArrowDown moves to Go to Backlog (option 1).
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(assign).toHaveBeenCalledWith("/backlog");
  });
});
