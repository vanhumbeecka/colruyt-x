# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

Colruyt-X is a grocery list manager for two people, built on Colruyt product data. Full-stack TypeScript: React SPA client + Express API server backed by Turso (libSQL).

## Commands

```bash
npm run dev              # Start both client (Vite) and server (tsx watch) concurrently
npm run dev:client       # Vite dev server only (port 5173)
npm run dev:server       # Express API server only (port 3000)
npm run build            # TypeScript check + Vite build → dist/
npm test                 # Run server tests (vitest)
npm run lint             # Lint (oxlint)
npm run fmt              # Format (oxfmt)
npm run fmt:check        # Check formatting without writing
npm start                # Production server (serves API + built client)
npm run import:products  # Fetch latest product data from GCS and upsert into Turso
make deploy              # Test + lint + format check + build + deploy to Vercel
```

## Code quality

- **Linting:** oxlint (`.oxlintrc.json`) — correctness errors, suspicious/perf warnings. Plugins: typescript, react, unicorn.
- **Formatting:** oxfmt (Prettier-compatible defaults)
- **lint-staged:** runs `oxlint --fix` + `oxfmt` on staged `.ts`/`.tsx` files, `oxfmt` on `.json`/`.md`/`.css`

## Environment

Requires a `.env` file with:

- `APP_PIN` — PIN for login (used as cookie-parser secret and HMAC key for tokens)
- `TURSO_DATABASE_URL` — Turso database URL (`libsql://...`)
- `TURSO_AUTH_TOKEN` — Turso auth token

## Architecture

**Two separate TypeScript configs:**

- `tsconfig.app.json` — client code (`src/client/`), targets DOM
- `tsconfig.node.json` — server + scripts + Vercel entry + vitest config (`src/server/`, `scripts/`, `api/`, `vite.config.ts`, `vitest.config.ts`), targets Node

**Server** (`src/server/`):

- Express 5 on port 3000 (configurable via `PORT` env var)
- Auth: PIN login → signed HttpOnly cookie (browser) or Bearer token (AI agent). HMAC-signed stateless tokens.
- Routes: `routes/auth.ts` (login/logout/check), `routes/products.ts` (search/list/get), `routes/list.ts` (single grocery list CRUD)
- `auth.ts` — token creation and verification (HMAC-SHA256)
- `db.ts` — exports the libSQL client and an async `initDb()` that creates tables and indexes lazily on first request
- `index.ts` — exports the Express app (no listen, no static serving)
- `start.ts` — local entry point that adds static serving, SPA catch-all, and `app.listen()`

**Client** (`src/client/`):

- React 19 + React Router 7 (BrowserRouter) + Tailwind CSS 4
- Vite root is `src/client/` (not project root) — `index.html` lives at `src/client/index.html`
- `api.ts` — typed API client with cookie-based auth (`credentials: 'include'`)
- Vite proxies `/api` to `localhost:3000` in dev
- Pages: Login (PIN entry), Home (the grocery list), Products (search + add to list)

**Data model:**

- Single grocery list with id `'default'`, auto-created on first access
- `grocery_lists.items` is stored as a JSON string column, parsed/serialized on read/write
- Products are imported from a public GCS bucket via `scripts/import-products.ts`

## API

All `/api` routes except `/api/auth/*` require authentication (cookie or Bearer token).

**Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/check`
**List:** `GET /api/list`, `PUT /api/list`, `POST /api/list/clear-checked`, `POST /api/list/reset`
**Products:** `GET /api/products`, `GET /api/products/categories`, `GET /api/products/:id`

## Deployment (Vercel)

Deployed at https://colruyt-x.vercel.app/. Vercel serves the Vite-built SPA as static files and routes `/api/*` to a serverless function (`api/index.ts`) that re-exports the Express app.

- `vercel.json` — build command, output directory, and rewrites
- `api/index.ts` — serverless entry point
- Environment variables (`APP_PIN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) are set in the Vercel dashboard.
