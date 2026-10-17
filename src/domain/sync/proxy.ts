/**
 * Read-only GitHub proxy logic.
 *
 * The Next.js route handler under `src/app/api/github/[...path]/route.ts` is a
 * thin shell over these pure functions. Keeping the logic here (rather than in
 * the route file) makes the method allow-list, URL building, origin/path
 * allow-list, token resolution, and rate-limit forwarding directly
 * unit-testable without spinning up `next`.
 *
 * READ-ONLY BY DEFAULT: GET is the only method forwarded unless
 * `WRITE_MODE=enabled` opts into writes, and even then only the strict issue
 * write allowlist (POST create/comment, PATCH issue) is reachable.
 * PUT/DELETE never pass, and pull requests stay read-only.
 *
 * EDGE-SAFE: no Node-only builtins are imported here. The token comes straight
 * from the server env (`GITHUB_TOKEN`) — the `gh auth token` subprocess path was
 * removed (shell/subprocess threat boundary). A per-user token from the JWE
 * session is the Slice 3 work; for Slice 1 the shared env token still works.
 */

export const GITHUB_API_BASE = "https://api.github.com";

/**
 * Build an upstream GitHub API URL from the catch-all route segments, appending
 * the original request's query string (e.g. `state=all&per_page=100`) so
 * pagination and `state=all` survive the proxy hop.
 */
export function buildGithubApiUrl(path: string[], query?: string): string {
  const base = `${GITHUB_API_BASE}/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  return query ? `${base}?${query}` : base;
}

/** Methods the proxy can forward at all (write mode gates POST/PATCH). */
export function isAllowedMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "POST" || upper === "PATCH";
}

/** Write mode is opt-in: only the literal `WRITE_MODE=enabled` opens writes. */
export function isWriteModeEnabled(env: Record<string, string | undefined>): boolean {
  return env.WRITE_MODE === "enabled";
}

/**
 * Optional per-user write gate (`WRITE_ALLOWED_USERS=login1,login2`).
 * An absent/empty list allows any authenticated user; a non-empty list
 * restricts writes to those logins, case-insensitive. Without a session login
 * (PAT self-host) the list cannot apply and the operator's token writes.
 */
export function isUserAllowedToWrite(
  login: string | undefined,
  allowedUsers: string | undefined,
): boolean {
  const list = (allowedUsers ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (!login) return true;
  return list.includes(login.toLowerCase());
}

/**
 * Write allowlist (only reachable with `WRITE_MODE=enabled`). Issues are the
 * only writable resource, only via the explicit `repos/{owner}/{repo}` form:
 * - `POST repos/{o}/{r}/issues`              → create an issue
 * - `POST repos/{o}/{r}/issues/{n}/comments` → comment on an issue
 * - `PATCH repos/{o}/{r}/issues/{n}`         → close/reopen, labels, edit
 * Everything else — pull requests, the `repositories/{id}` form used by
 * pagination, PUT/DELETE — is rejected.
 */
export function isAllowedWritePath(path: string[], method: string): boolean {
  if (path[0] !== "repos" || path[3] !== "issues") return false;
  const upper = method.toUpperCase();
  if (upper === "POST") {
    if (path.length === 4) return true;
    return path.length === 6 && isNumericSegment(path[4]) && path[5] === "comments";
  }
  if (upper === "PATCH") {
    return path.length === 5 && isNumericSegment(path[4]);
  }
  return false;
}

function isNumericSegment(segment: string | undefined): boolean {
  return typeof segment === "string" && /^\d+$/.test(segment);
}

/**
 * Origin/Referer allowlist check. The relay is only reachable from the app's
 * own origin, so an absent or mismatched `Origin`/`Referer` is rejected.
 *
 * - `allowed` is a comma-separated list of origins (prod origin, plus the dev
 *   localhost origin when running outside production).
 * - A Referer under an allowed origin is treated as valid (the Referer carries
 *   a path, so only its origin is compared).
 */
export function isAllowedOrigin(
  origin: string | undefined,
  referer: string | undefined,
  allowed: string,
): boolean {
  const allowedOrigins = allowed
    .split(",")
    .map((originValue) => originValue.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) return false;

  const candidate = origin || referer;
  if (!candidate) return false;

  let candidateOrigin: string;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    candidateOrigin = candidate;
  }

  return allowedOrigins.includes(candidateOrigin);
}

/**
 * Path allowlist. The relay is a thin read-only GitHub proxy that only exposes
 * the sync paths the app needs: `repos/{owner}/{repo}/issues` and
 * `repos/{owner}/{repo}/pulls` (plus their single-item variants),
 * `repos/{owner}/{repo}/labels` (the label editor's live catalog), and the two
 * paths the RepoSwitcher needs: `user/repos` (live repo list) and `user`
 * (profile). Nothing else is allowed — the relay is not re-opened to arbitrary
 * paths.
 *
 * GitHub's own pagination `Link` headers point follow-up pages at the
 * repository-id form (`https://api.github.com/repositories/{id}/issues?…`),
 * even when the original request used `repos/{owner}/{repo}/…`. The connector
 * follows that `Link` verbatim, so the relay must accept the repository-id
 * form for the same read-only `issues`/`pulls`/`labels` resources.
 */
export function isAllowedPath(path: string[]): boolean {
  // RepoSwitcher endpoints: `user` and `user/repos` (exactly, no deeper).
  if (path.length === 1 && path[0] === "user") return true;
  if (path.length === 2 && path[0] === "user" && path[1] === "repos") return true;

  if (path.length < 3 || (path[0] !== "repos" && path[0] !== "repositories")) return false;
  const resource = path[0] === "repositories" ? path[2] : path[3];
  if (resource !== "issues" && resource !== "pulls" && resource !== "labels") return false;
  return true;
}

/**
 * Resolve the GitHub token. For Slice 1 this is the server-side `GITHUB_TOKEN`
 * env var (the shared relay token). The per-user JWE token replaces this in
 * Slice 3. Never hardcodes a token; anonymous (null) is allowed but
 * rate-limited.
 */
export function resolveToken(env: Record<string, string | undefined>): string | null {
  return env.GITHUB_TOKEN ?? null;
}

export interface ProxyResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface ProxyDeps {
  path: string[];
  /** Raw query string (no leading `?`), forwarded verbatim to upstream. */
  query?: string;
  method: string;
  token: string | null;
  /** Raw JSON body forwarded verbatim for write requests (POST/PATCH). */
  body?: string;
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
  /** Opens POST/PATCH forwarding; `WRITE_MODE=enabled` on the route sets it. */
  allowWrites?: boolean;
}

/** Headers forwarded from the upstream response to the client. */
const FORWARD_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
  "link",
] as const;

/**
 * Proxy a single request to the GitHub API, read-only.
 *
 * - Non-GET methods are rejected with 405 before any upstream call.
 * - A bearer token is attached only when one is resolved.
 * - Rate-limit headers are forwarded so the client's rate limiter can act.
 * - A 403/429 upstream response is surfaced as 429 "sync paused".
 */
export async function proxyGithubRequest(deps: ProxyDeps): Promise<ProxyResult> {
  const method = deps.method.toUpperCase();
  const allowHeader = deps.allowWrites ? "GET, POST, PATCH" : "GET";
  const write = method !== "GET";
  if (!isAllowedMethod(method) || (write && !deps.allowWrites)) {
    return { status: 405, body: { error: "Method not allowed" }, headers: { allow: allowHeader } };
  }

  const url = buildGithubApiUrl(deps.path, deps.query);
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "MeperBoard",
  };
  if (deps.token) headers.authorization = `Bearer ${deps.token}`;
  if (write) headers["content-type"] = "application/json";

  const upstream = await deps.fetcher(url, {
    method,
    headers,
    body: write ? deps.body : undefined,
  });
  const forwarded = collectHeaders(upstream.headers);

  // Rate limiting: 429 always surfaces as sync-paused. A 403 only means rate
  // limiting on reads; on writes it is a permission answer and passes through.
  if (upstream.status === 429 || (upstream.status === 403 && !write)) {
    return {
      status: 429,
      body: { error: "sync paused", rate_limited: true },
      headers: forwarded,
    };
  }

  return { status: upstream.status, body: await readJsonBody(upstream), headers: forwarded };
}

function collectHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARD_HEADERS) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
