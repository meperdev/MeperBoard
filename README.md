<div align="center">

# 🗂️ MeperBoard

**A local-first kanban & backlog board for your GitHub issues and pull requests.**

Read-only GitHub sync, offline-first storage, keyboard-first UX — with the polish of a modern dev tool.

<p>
  <a href="https://meperboard.vercel.app"><strong>Live demo ↗</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#getting-started">Getting started</a>
  ·
  <a href="#how-it-works">How it works</a>
  ·
  <a href="#architecture">Architecture</a>
  ·
  <a href="#contributing">Contributing</a>
  ·
  <span>🌐 <a href="./README.es.md">Español</a></span>
</p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-blue?logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-blue?logo=typescript">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss">
  <img alt="Vitest" src="https://img.shields.io/badge/tests-537%20passing-22c55e?logo=vitest">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-a78bfa?logo=opensourceinitiative">
</p>

</div>

---

## ✨ Features

### Board, the way your brain works
- **Kanban board** with drag-and-drop cards ([dnd-kit](https://dndkit.com/)) and smooth [Framer Motion](https://motion.dev/) flight animations.
- **Smart column mapping** — issues and PRs land in the right column automatically based on their GitHub state, with your manual moves preserved even after re-sync.
- **Slice & feature grouping** — board slices that match an epic title are grouped into a parent/child hierarchy (`Expenses module - slice 3` → `Expenses`).

### Backlog, without the noise
- **Filter and sort** by label, type, and field with deterministic ordering.
- **Paginated backlog** (25/50/100 per page) with a visible pager — no endless scroll.

### Local-first & private
- **Offline-first storage** in [IndexedDB](https://dexie.org/) via Dexie. Your data is yours, on your machine.
- **Local cards** that GitHub sync never touches — create, edit, and delete cards that stay put while syncing.
- **Read-only by default** — MeperBoard mirrors GitHub one-way and only sends `GET` requests unless a deployment opts into writes (`WRITE_MODE=enabled`). Writes stay on a strict issue allowlist: create, comment, close/reopen, labels.

### GitHub, connected
- **Sign in with GitHub** via a GitHub App — no tokens to paste. Read-only permissions cover syncing; opt-in writes need the App's **Issues: Read and write** permission.
- **Per-user token** stored in an HTTP-only encrypted cookie, never exposed to client JavaScript.
- **Live repository switcher** — browse and switch between your repositories from a command palette.
- **Transparent rate-limit handling** with automatic back-off and a live rate-limit indicator.

### Keyboard-first, like you mean it
- **⌘K command palette** — navigate, change theme, switch repo, sync, and more, all from the keyboard.
- Full keyboard accessibility on the board (move cards with arrows) and the palette.
- A Linear-inspired dark-first design system with switchable accent palettes.

---

## 🚀 Getting started

### Prerequisites
- Node.js 20+
- A GitHub account (for the OAuth flow) — optional if you only want the anonymous read-only experience.

### Install

```bash
git clone https://github.com/meperdev/MeperBoard.git
cd MeperBoard
npm install
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Without `AUTH_SECRET` set, the app runs in **development mode** with an insecure fallback secret. To use GitHub authentication, see [Configuration](#configuration).

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run test` | Run the test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check with `tsc --noEmit` |

---

## ⚙️ Configuration

MeperBoard uses a few environment variables for GitHub authentication. None are required to run the board locally; GitHub auth simply won't be available until you set them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | ✅ (production) | Secret used to derive the AES key that encrypts session cookies. **Must be ≥ 32 characters.** |
| `GITHUB_CLIENT_ID` | ✅ (auth) | Client ID of your [GitHub App](https://docs.github.com/en/apps/creating-github-apps). |
| `GITHUB_CLIENT_SECRET` | ✅ (auth) | Client secret of your GitHub App. |
| `ALLOWED_ORIGIN` | recommended | Comma-separated list of allowed origins for the proxy. Defaults to `https://meperboard.vercel.app`. |
| `AUTH_MODE` | optional | `oauth` (default) or `pat` — use `pat` to authenticate with a classic personal access token for self-hosting. |
| `GITHUB_TOKEN` | `pat` mode | Personal access token used in `AUTH_MODE=pat`. |

### Set up a GitHub App (for OAuth)

1. Create a [GitHub App](https://github.com/settings/apps/new) for your domain.
2. Set the **callback URL** to `https://<your-domain>/api/auth/callback`.
3. Grant **Read-only** access to **Issues** and **Pull requests** (Metadata is required and read-only by default). Writes are opt-in: grant **Issues: Read and write** and set `WRITE_MODE=enabled` only if you want them.
4. **Enable "Expire user authorization tokens"** — MeperBoard relies on token refresh.
5. Copy the **Client ID** and generate a **Client secret**.

> MeperBoard is read-only by default: without `WRITE_MODE=enabled` it never sends a write request. Opting in is a deployment decision — see [Security](#security).

---

## 🔒 Security

- **Read-only by default.** The GitHub proxy accepts `GET` requests only and enforces an allow-list of repository paths. Writes are impossible unless the deployment sets `WRITE_MODE=enabled`, and even then they pass only through the strict issue allowlist (create, comment, close/reopen, labels) — same-origin, with the caller's own token.
- **Tokens never reach the browser.** User access tokens are encrypted (`jose` JWE, `A256GCM`) into an `httpOnly + Secure + SameSite=Lax` cookie. Client JavaScript can never read them.
- **Encrypted session state.** OAuth `state` is stored in a single-use, encrypted cookie to prevent CSRF.
- **Strict Content-Security-Policy** with a per-request nonce, plus sanitized Markdown rendering ([DOMPurify](https://github.com/cure53/DOMPurify)) for issue/PR bodies.
- **Open-relay protection.** The proxy validates the request `Origin`/`Referer` against `ALLOWED_ORIGIN` and blocks unauthorized callers.

See the [self-hosting guide](/docs/SELF_HOST.md) for the PAT alternative.

---

## 🧠 How it works

MeperBoard is a **local-first mirror**: it pulls your GitHub issues and PRs into an IndexedDB database on your device, then renders them from that local copy. Syncing is always read-only and always on your terms. Writes, when a deployment enables them, are explicit actions you trigger (create, comment, close/reopen, labels) — never a side effect of a sync.

```mermaid
flowchart LR
  A[GitHub API] -->|GET /issues /pulls| P[Read-only-by-default proxy]
  P -->|one-way mirror| DB[(IndexedDB / Dexie)]
  DB --> B[Board]
  DB --> L[Backlog]
  DB --> D[Issue detail]
  L --> P
```

You supply your own identity (GitHub App OAuth) and your own browser — MeperBoard is a thin, well-typed layer over your own data.

---

## 🏛️ Architecture

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**.
- **Dexie / IndexedDB** for the offline-first store (`repos`, `github_items`, `local_items`, `columns`, `epics`, `column_overrides`).
- **TanStack Query** for server-state and optimistic cache.
- **One-way sync connector** with a pluggable column-strategy layer.
- **Read-only-by-default GitHub proxy** (`/api/github/[...path]`) — GET-only unless `WRITE_MODE=enabled`, origin-checked, token-injecting.

```
src/
├── app/            # Next.js routes (pages + API routes)
├── components/     # React components (board, backlog, header, ui)
├── data/           # Dexie repositories & types
├── domain/         # Sync connector, proxy logic, column strategies, rate limiter
├── lib/            # Auth (session, oauth), utilities
└── state/          # TanStack Query hooks & projections
```

---

## 🧪 Tests

The test suite runs on [Vitest](https://vitest.dev/) with [Testing Library](https://testing-library.com/) and `fake-indexeddb`.

```bash
npm run test
```

- **Unit** — pure domain logic (proxy, connector, rate limiter, column strategies, session crypto).
- **Integration / Component** — rendered components + hooks against a mocked IndexedDB.

> 537 tests across 62 files.

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repo and create a feature branch.
2. Follow the existing conventions: TypeScript strict, conventional commits, TDD (write the failing test first).
3. Keep the read-only default intact — any new write must stay behind the `WRITE_MODE` opt-in gate and the strict issue allowlist (see [`odd/tasks/github-write-path.md`](./odd/tasks/github-write-path.md)).
4. Run `npm run typecheck` and `npm run test` before opening a PR.

> This project is built with a strict TDD workflow. New behavior lands with its test.

---

## 📄 License

Released under the [MIT License](./LICENSE).

Copyright © 2026 [Santiago Villabona (meperdev)](https://github.com/meperdev).

---

<div align="center">

Made with ❤️ for people who love their backlog.

</div>
