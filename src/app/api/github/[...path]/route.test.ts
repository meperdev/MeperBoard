import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_COOKIE,
  buildSessionJwe,
  readSessionJwe,
  type SessionPayload,
} from "@/lib/auth/session";

import * as route from "./route";

const ALLOWED_ORIGIN = "http://localhost:3000";
const SECRET = "0123456789abcdef0123456789abcdef";
const CLIENT_ID = "Iv1.client-auth";
const CLIENT_SECRET = "client-secret-001";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

const upstreamUrl = "https://api.github.com/repos/a/b/issues";

function githubRequest(
  url: string,
  headers: Record<string, string> = { origin: ALLOWED_ORIGIN },
): Request {
  return new Request(url, { headers });
}

/** Build a JSON write request (POST/PATCH) with the standard test headers. */
function githubWrite(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
  headers: Record<string, string> = { origin: ALLOWED_ORIGIN },
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function stubAuthEnv(overrides: Record<string, string | undefined> = {}) {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("GITHUB_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GITHUB_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("ALLOWED_ORIGIN", ALLOWED_ORIGIN);
  vi.stubEnv("AUTH_MODE", "oauth");
  vi.stubEnv("GITHUB_TOKEN", "env-pat-should-never-leak");
  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value ?? "");
  }
}

/**
 * Build a session cookie whose payload is `ghu_user`/`ghr_user` by default.
 * Override `exp`/`iat` to drive the refresh window and absolute-cap paths.
 */
async function sessionCookie(
  overrides: Partial<Pick<SessionPayload, "exp" | "iat">> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    token: "ghu_user",
    refresh_token: "ghr_user",
    login: "meperdonas",
    avatar_url: "https://avatars.example/u.png",
    iat: now,
    exp: now + 8 * 3600,
    ...overrides,
  };
  return `${SESSION_COOKIE}=${await buildSessionJwe(payload, SECRET)}`;
}

/** Mock global fetch, dispatching on URL. Unknown URLs default to `[]` 200. */
function stubFetch(handlers: Record<string, () => Promise<Response>>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    const handler = handlers[url];
    if (handler) return handler();
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Assert the encoded `__session` value decrypts to the expected access token.
async function expectSessionCookieTo(token: string, response: Response): Promise<void> {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  const jwe = setCookie!.slice(setCookie!.indexOf("=") + 1).split(";")[0];
  const payload = await readSessionJwe(`${SESSION_COOKIE}=${jwe}`, SECRET);
  expect(payload).not.toBeNull();
  expect(payload!.token).toBe(token);
}

// Escape a URL for use as a handlers key (the proxy URL is exact).
function upstreamCall(fetchMock: ReturnType<typeof vi.fn>, url: string): [string, RequestInit] {
  return fetchMock.mock.calls.find(([u]) => u === url) as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("github proxy route", () => {
  it("exports a GET handler", () => {
    expect(typeof route.GET).toBe("function");
  });

  it("exports the gated write handlers but never PUT/DELETE", () => {
    const handlers = route as unknown as Record<string, unknown>;
    expect(typeof handlers.GET).toBe("function");
    expect(typeof handlers.POST).toBe("function");
    expect(typeof handlers.PATCH).toBe("function");
    expect(handlers.PUT).toBeUndefined();
    expect(handlers.DELETE).toBeUndefined();
  });

  it("runs on the nodejs runtime (Next 16 deprecates edge)", () => {
    expect((route as unknown as Record<string, string>).runtime).toBe("nodejs");
  });

  it("rejects a request without a matching Origin/Referer with 403 and no upstream call", async () => {
    stubAuthEnv();
    const fetchMock = stubFetch({});
    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: "https://evil.example.com" }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a path outside the allowlist with 404 and no upstream call", async () => {
    stubAuthEnv();
    const fetchMock = stubFetch({});
    const response = await route.GET(
      githubRequest("http://localhost/api/github/user/orgs"),
      { params: Promise.resolve({ path: ["user", "orgs"] }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 and no upstream call when there is no session and AUTH_MODE is not pat", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const fetchMock = stubFetch({});
    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues"),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("injects the user token from the __session cookie as Bearer (never GITHUB_TOKEN)", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const fetchMock = stubFetch({
      [upstreamUrl]: () => Promise.resolve(new Response(JSON.stringify([{ number: 1 }]), { status: 200 })),
    });
    const cookie = await sessionCookie();

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(200);
    const [, init] = upstreamCall(fetchMock, upstreamUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghu_user");
    // No proactive refresh: the session exp is far out, so only the upstream fetch happened.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the live repo-list path user/repos with the user Bearer", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const reposUrl = "https://api.github.com/user/repos";
    const fetchMock = stubFetch({
      [reposUrl]: () =>
        Promise.resolve(
          new Response(JSON.stringify([{ full_name: "acme/widgets", name: "widgets" }]), { status: 200 }),
        ),
    });
    const cookie = await sessionCookie();

    const response = await route.GET(
      githubRequest("http://localhost/api/github/user/repos", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["user", "repos"] }) },
    );

    expect(response.status).toBe(200);
    const [, init] = upstreamCall(fetchMock, reposUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghu_user");
  });

  it("uses GITHUB_TOKEN when AUTH_MODE=pat and there is no session cookie", async () => {
    stubAuthEnv({ AUTH_MODE: "pat" });
    const fetchMock = stubFetch({
      [upstreamUrl]: () => Promise.resolve(new Response("[]", { status: 200 })),
    });

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues"),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(200);
    const [, init] = upstreamCall(fetchMock, upstreamUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer env-pat-should-never-leak");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when AUTH_MODE=pat but GITHUB_TOKEN is unset", async () => {
    stubAuthEnv({ AUTH_MODE: "pat", GITHUB_TOKEN: undefined });
    const fetchMock = stubFetch({});
    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues"),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proactively refreshes before upstream when exp is within 30min and re-emits __session", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = stubFetch({
      [GITHUB_TOKEN_URL]: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "ghu_refreshed",
              refresh_token: "ghr_refreshed",
              expires_in: 28800,
              token_type: "bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      [upstreamUrl]: () => Promise.resolve(new Response("[]", { status: 200 })),
    });
    const cookie = await sessionCookie({ exp: now + 10 * 60, iat: now - (8 * 3600 - 10 * 60) });

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(200);
    // Refresh happened exactly once, then the upstream call happened once.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upstreamCall(fetchMock, GITHUB_TOKEN_URL)).toBeTruthy();
    const [, init] = upstreamCall(fetchMock, upstreamUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghu_refreshed");
    await expectSessionCookieTo("ghu_refreshed", response);
  });

  it("reactively refreshes once and retries the same request when upstream returns 401", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = stubFetch({
      [GITHUB_TOKEN_URL]: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "ghu_retry",
              refresh_token: "ghr_retry",
              expires_in: 28800,
              token_type: "bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      [upstreamUrl]: () =>
        Promise.resolve(new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })),
    });
    // Far-out exp => no proactive refresh; the retry is the only refresh.
    const cookie = await sessionCookie({ exp: now + 8 * 3600, iat: now });

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    // Exactly one refresh + two upstream calls (original 401 + retry).
    expect(upstreamCall(fetchMock, GITHUB_TOKEN_URL)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retriedCalls = fetchMock.mock.calls.filter(([u]) => u === upstreamUrl);
    expect(retriedCalls).toHaveLength(2);
    const retriedHeaders = new Headers(retriedCalls[1][1].headers as HeadersInit);
    expect(retriedHeaders.get("authorization")).toBe("Bearer ghu_retry");
    // 401 surfaced retry is a 200 (we mock it as the final result below is 401 in handlers, but the
    // retry call carries the new token; the response body is whatever the last upstream returned).
    expect(response.headers.get("set-cookie")).toBeTruthy();
    await expectSessionCookieTo("ghu_retry", response);
  });

  it("clears the session cookie and returns 401 when a proactive refresh fails", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = stubFetch({
      [GITHUB_TOKEN_URL]: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: "bad_verification_code", error_description: "expired" }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
    });
    const cookie = await sessionCookie({ exp: now + 10 * 60, iat: now - (8 * 3600 - 10 * 60) });

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(401);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
    // No upstream call was made after the failed refresh.
    expect(upstreamCall(fetchMock, upstreamUrl)).toBeUndefined();
  });

  it("clears the session cookie and returns 401 when the cookie is older than the absolute cap", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = stubFetch({});
    // iat 31 days ago but exp still in the future so the JWE stays decryptable.
    const cookie = await sessionCookie({ iat: now - 31 * 24 * 3600, exp: now + 3600 });

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("forwards the request query string to the upstream URL", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const fetchMock = stubFetch({});
    const cookie = await sessionCookie();

    await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues?state=all&per_page=100", {
        origin: ALLOWED_ORIGIN,
        cookie,
      }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    const [url] = upstreamCall(fetchMock, `${upstreamUrl}?state=all&per_page=100`);
    expect(url).toBe("https://api.github.com/repos/a/b/issues?state=all&per_page=100");
  });

  it("forwards the upstream Link header to the client", async () => {
    stubAuthEnv({ AUTH_MODE: "oauth" });
    const link = `<https://api.github.com/repos/a/b/issues?page=2>; rel="next"`;
    const fetchMock = stubFetch({
      [upstreamUrl]: () =>
        Promise.resolve(new Response(JSON.stringify([{ number: 1 }]), { status: 200, headers: { link } })),
    });
    const cookie = await sessionCookie();

    const response = await route.GET(
      githubRequest("http://localhost/api/github/repos/a/b/issues", { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.headers.get("link")).toBe(link);
  });
});

describe("github proxy route — write mode", () => {
  const issuesUrl = "https://api.github.com/repos/a/b/issues";

  it("keeps read-only by default: POST is 405 with allow GET and no upstream call", async () => {
    stubAuthEnv();
    const fetchMock = stubFetch({});
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", { title: "t" }, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an issue when WRITE_MODE=enabled, forwarding method, body and bearer", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled" });
    const fetchMock = stubFetch({
      [issuesUrl]: () => Promise.resolve(new Response(JSON.stringify({ number: 42 }), { status: 201 })),
    });
    const cookie = await sessionCookie();
    const payload = { title: "Nueva", body: "cuerpo" };

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", payload, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(201);
    const [, init] = upstreamCall(fetchMock, issuesUrl);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(payload));
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghu_user");
  });

  it("comments on an issue through the comments path", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled" });
    const commentsUrl = "https://api.github.com/repos/a/b/issues/7/comments";
    const fetchMock = stubFetch({
      [commentsUrl]: () => Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 })),
    });
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues/7/comments", "POST", { body: "hola" }, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues", "7", "comments"] }) },
    );

    expect(response.status).toBe(201);
    const [, init] = upstreamCall(fetchMock, commentsUrl);
    expect(init.method).toBe("POST");
  });

  it("updates an issue (close/reopen, labels) via PATCH on the single issue", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled" });
    const issueUrl = "https://api.github.com/repos/a/b/issues/7";
    const fetchMock = stubFetch({
      [issueUrl]: () => Promise.resolve(new Response(JSON.stringify({ state: "closed" }), { status: 200 })),
    });
    const cookie = await sessionCookie();

    const response = await route.PATCH(
      githubWrite("http://localhost/api/github/repos/a/b/issues/7", "PATCH", { state: "closed" }, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues", "7"] }) },
    );

    expect(response.status).toBe(200);
    const [, init] = upstreamCall(fetchMock, issueUrl);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ state: "closed" }));
  });

  it("rejects a non-allowlisted write path with 404 and no upstream call", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled" });
    const fetchMock = stubFetch({});
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/pulls", "POST", {}, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "pulls"] }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the Origin check on writes", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled" });
    const fetchMock = stubFetch({});
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", {}, { origin: "https://evil.example.com", cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a write without a session when AUTH_MODE is not pat", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled", AUTH_MODE: "oauth" });
    const fetchMock = stubFetch({});

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", {}),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks writes from a login missing from WRITE_ALLOWED_USERS", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled", WRITE_ALLOWED_USERS: "someoneelse" });
    const fetchMock = stubFetch({});
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", {}, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows writes from a login present in WRITE_ALLOWED_USERS", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled", WRITE_ALLOWED_USERS: "MeperDonas, other" });
    const fetchMock = stubFetch({
      [issuesUrl]: () => Promise.resolve(new Response("{}", { status: 201 })),
    });
    const cookie = await sessionCookie();

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", { title: "t" }, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows PAT-mode self-host writes with the env token when enabled", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled", AUTH_MODE: "pat" });
    const fetchMock = stubFetch({
      [issuesUrl]: () => Promise.resolve(new Response("{}", { status: 201 })),
    });

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", { title: "t" }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(201);
    const [, init] = upstreamCall(fetchMock, issuesUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer env-pat-should-never-leak");
  });

  it("resends the same body when a write is retried after a reactive refresh", async () => {
    stubAuthEnv({ WRITE_MODE: "enabled", AUTH_MODE: "oauth" });
    const now = Math.floor(Date.now() / 1000);
    let upstreamCalls = 0;
    const fetchMock = stubFetch({
      [GITHUB_TOKEN_URL]: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "ghu_retry_w",
              refresh_token: "ghr_retry_w",
              expires_in: 28800,
              token_type: "bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      [issuesUrl]: () => {
        upstreamCalls += 1;
        return Promise.resolve(new Response("{}", { status: upstreamCalls === 1 ? 401 : 201 }));
      },
    });
    const cookie = await sessionCookie({ exp: now + 8 * 3600, iat: now });
    const payload = { title: "retry me" };

    const response = await route.POST(
      githubWrite("http://localhost/api/github/repos/a/b/issues", "POST", payload, { origin: ALLOWED_ORIGIN, cookie }),
      { params: Promise.resolve({ path: ["repos", "a", "b", "issues"] }) },
    );

    expect(response.status).toBe(201);
    const writeCalls = fetchMock.mock.calls.filter(([u]) => u === issuesUrl);
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0][1].body).toBe(JSON.stringify(payload));
    expect(writeCalls[1][1].body).toBe(JSON.stringify(payload));
    await expectSessionCookieTo("ghu_retry_w", response);
  });
});
