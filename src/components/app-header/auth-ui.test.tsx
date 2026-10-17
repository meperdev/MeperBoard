import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repoRepo } from "../../data/repositories";
import { createTestQueryClient, queryWrapper, resetDb } from "../../state/test-utils";
import { AppHeader } from "./app-header";
import { AuthButton } from "./auth-button";

// The header renders inside a Next.js App Router context; stub the router hooks
// and Link so the shell can render headlessly in jsdom.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

describe("AuthButton", () => {
  let client: ReturnType<typeof createTestQueryClient>;
  let originalLocation: Location;

  beforeEach(() => {
    client = createTestQueryClient();
    originalLocation = window.location;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("shows 'Connect GitHub' while logged out", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    expect(await screen.findByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });

  it("shows the avatar and login when authenticated", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse(account) });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    const trigger = await screen.findByRole("button", { name: /account for meperdonas/i });
    expect(trigger).toBeInTheDocument();
    const avatar = screen.getByRole("img", { name: /meperdonas/i });
    expect(avatar).toHaveAttribute("src", account.avatar_url);
  });

  it("opens the connect modal from 'Connect GitHub' and exposes the PAT docs link", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    fireEvent.click(await screen.findByRole("button", { name: /connect github/i }));

    expect(await screen.findByRole("dialog", { name: /connect github/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /authorize with github/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /self-host/i })).toBeInTheDocument();
  });

  it("navigates to the login route when the modal authorizes", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign, href: originalLocation.href },
    });
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    fireEvent.click(await screen.findByRole("button", { name: /connect github/i }));
    fireEvent.click(await screen.findByRole("button", { name: /authorize with github/i }));

    expect(assign).toHaveBeenCalledWith("/api/auth/login");
  });

  it("logs out from the account menu and returns to disconnected", async () => {
    mockFetch({
      "/api/auth/me": () => jsonResponse(account),
      "/api/auth/logout": () => jsonResponse({ ok: true }),
    });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    fireEvent.click(await screen.findByRole("button", { name: /account for meperdonas/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /disconnect/i }));

    expect(await screen.findByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });

  it("shows the persisted active repo in the account menu", async () => {
    await resetDb();
    await repoRepo.setActive("acme", "widgets");
    mockFetch({ "/api/auth/me": () => jsonResponse(account) });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    fireEvent.click(await screen.findByRole("button", { name: /account for meperdonas/i }));

    expect(await screen.findByText("acme/widgets")).toBeInTheDocument();
  });

  it("shows the rate-limit remaining in the account menu when available", async () => {
    await resetDb();
    mockFetch({
      "/api/auth/me": () =>
        jsonResponse({ ...account, rate_limit: { remaining: 4321, resetAt: 1725000000 } }),
    });

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    fireEvent.click(await screen.findByRole("button", { name: /account for meperdonas/i }));

    expect(await screen.findByText(/4[.,]?321/)).toBeInTheDocument();
  });

  it("shows a loading state while the session check resolves", async () => {
    let resolveMe!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });
    const fn = mockFetch({});
    fn.mockImplementationOnce(async () => pending);

    render(<AuthButton />, { wrapper: queryWrapper(client) });

    expect(screen.getByRole("button", { name: /checking account/i })).toBeInTheDocument();

    resolveMe(jsonResponse({}, 401));
    expect(await screen.findByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });
});

describe("AppHeader", () => {
  let client: ReturnType<typeof createTestQueryClient>;

  beforeEach(() => {
    client = createTestQueryClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the auth trigger alongside the primary navigation", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AppHeader />, { wrapper: queryWrapper(client) });

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });

  it("brands the home link with the MeperBoard mark instead of a generic glyph", async () => {
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AppHeader />, { wrapper: queryWrapper(client) });

    const homeLink = screen.getAllByRole("link", { name: "MeperBoard" })[0];
    expect(homeLink).toHaveAttribute("href", "/");
    expect(homeLink.querySelector('img[src*="brand/icon-192"], img[src*="icon-192"]')).not.toBeNull();
  });

  it("opens the repo switcher from the header repo button", async () => {
    await resetDb();
    await repoRepo.setActive("acme", "widgets");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    mockFetch({ "/api/auth/me": () => jsonResponse({}, 401) });

    render(<AppHeader />, { wrapper: queryWrapper(client) });

    fireEvent.click(screen.getByRole("button", { name: /active repository/i }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "meperboard:open-repo-switcher" }),
    );
  });
});
