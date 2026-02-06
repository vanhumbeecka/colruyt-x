# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

Colruyt-X is a grocery list manager built on Colruyt product data. It's a full-stack TypeScript app with a React SPA client and an Express API server backed by Turso (libSQL).

## Commands

```bash
npm run dev              # Start both client (Vite) and server (tsx watch) concurrently
npm run dev:client       # Vite dev server only (port 5173)
npm run dev:server       # Express API server only (port 3000)
npm run build            # TypeScript check + Vite build → dist/
npm start                # Production server (serves API + built client)
npx eslint .             # Lint
npm run import:products  # Fetch latest product data from GCS and upsert into Turso
```

No test framework is set up yet.

## Environment

Requires a `.env` file with:
- `API_KEY` — Bearer token for all `/api/*` routes (server-side)
- `VITE_API_KEY` — Same key, exposed to the client via Vite's env injection
- `TURSO_DATABASE_URL` — Turso database URL (`libsql://...`)
- `TURSO_AUTH_TOKEN` — Turso auth token

## Architecture

**Two separate TypeScript configs:**
- `tsconfig.app.json` — client code (`src/client/`), targets DOM
- `tsconfig.node.json` — server + scripts (`src/server/`, `scripts/`, `vite.config.ts`), targets Node

**Server** (`src/server/`):
- Express 5 on port 3000 (configurable via `PORT` env var)
- All `/api` routes require `Authorization: Bearer <API_KEY>` header
- Turso (libSQL) via `@libsql/client` — all DB access is async (`await`-based)
- Routes: `routes/products.ts` (search/list/get with pagination + category filter), `routes/grocery-lists.ts` (CRUD)
- `db.ts` — exports the libSQL client and an async `initDb()` that creates tables and indexes on startup
- In production, serves the built client SPA from `dist/` with a catch-all for client-side routing

**Client** (`src/client/`):
- React 19 + React Router 7 (BrowserRouter) + Tailwind CSS 4
- Vite root is `src/client/` (not project root) — `index.html` lives at `src/client/index.html`
- `api.ts` — typed API client and shared interfaces (`Product`, `GroceryList`, `GroceryListItem`)
- Vite proxies `/api` to `localhost:3000` in dev
- Pages: Home, Products (search + paginate + filter by category), GroceryLists (CRUD), GroceryListDetail (manage items)

**Data model:**
- `grocery_lists.items` is stored as a JSON string column, parsed/serialized on read/write
- Products are imported from a public GCS bucket via `scripts/import-products.ts`
