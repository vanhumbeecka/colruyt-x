# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

Colruyt-X is a sale-notification service for two people, built on Colruyt product data. Users maintain a shared watchlist of products and receive a Telegram message when a watched product enters or improves a volume deal ("buy N, pay X each"). Full-stack TypeScript: React SPA client + Express API server backed by Turso (libSQL), driven by a daily Vercel cron.

## Commands

```bash
npm run dev              # Start both client (Vite) and server (tsx watch) concurrently
npm run dev:client       # Vite dev server only (port 5173)
npm run dev:server       # Express API server only (port 3000)
npm run build            # TypeScript check + Vite build → dist/
npm test                 # Run server tests (vitest)
npm run lint             # Lint + autofix (oxlint --fix)
npm run fmt              # Format (oxfmt)
npm start                # Production server (serves API + built client)
npm run import:products  # Fetch latest product data from GCS and upsert into Turso
make deploy              # Test + lint + format + build + deploy to Vercel
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
- `CRON_SECRET` — Bearer secret the Vercel cron presents to `/api/cron/import-products`
- `TELEGRAM_BOT_TOKEN` — Telegram bot token used to send sale notifications
- `TELEGRAM_CHAT_IDS` — comma-separated Telegram chat IDs to notify

## Architecture

**Two separate TypeScript configs:**

- `tsconfig.app.json` — client code (`src/client/`), targets DOM
- `tsconfig.node.json` — server + scripts + Vercel entry + vitest config (`src/server/`, `scripts/`, `api/`, `vite.config.ts`, `vitest.config.ts`), targets Node

**Server** (`src/server/`):

- Express 5 on port 3000 (configurable via `PORT` env var)
- Auth: PIN login → signed HttpOnly cookie (browser) or Bearer token (AI agent). HMAC-signed stateless tokens.
- Routes: `routes/auth.ts` (login/logout/check), `routes/products.ts` (search/categories/get), `routes/watchlist.ts` (watchlist CRUD), `routes/cron.ts` (CRON_SECRET-protected import → detect → notify orchestration)
- `auth.ts` — token creation and verification (HMAC-SHA256)
- `deals.ts` — pure deal logic: `computeDeal` (is a product on a volume deal?) and `detectDeals` (emit `DealEvent[]` on onset/improvement vs. prior state)
- `deals-store.ts` — loads watched products + prior `deal_state` and persists updated state after a cron run
- `notifier.ts` — `Notifier` interface + `TelegramNotifier` (sends one Telegram message per event, with product image when available)
- `import-products.ts` — fetches the latest GCS snapshot and upserts into `products` (shared by the cron route and the `import:products` script)
- `db.ts` — exports the libSQL client and an async `initDb()` that creates tables and indexes lazily on first request
- `index.ts` — exports the Express app (no listen, no static serving); cron router is mounted before the auth gate, all other `/api` routes sit behind it
- `start.ts` — local entry point that adds static serving, SPA catch-all, and `app.listen()`

**Client** (`src/client/`):

- React 19 + React Router 7 (BrowserRouter) + Tailwind CSS 4
- Vite root is `src/client/` (not project root) — `index.html` lives at `src/client/index.html`
- `api.ts` — typed API client with cookie-based auth (`credentials: 'include'`); also mirrors the server's `computeDeal` as `getDeal`/`formatDeal` for showing deal badges
- Vite proxies `/api` to `localhost:3000` in dev
- Pages: Login (PIN entry), Watchlist (`/`, the shared watchlist with current deal status), Products (`/products`, search + add to watchlist)

**Data model:**

- `products` — Colruyt catalog, imported from a public GCS bucket via `scripts/import-products.ts`. Includes `price`, `quantity_price`, and `quantity_price_quantity` (the volume-deal fields)
- `watchlist_items` — shared watchlist (`product_id` PK, `added_at`); replaces the old single grocery list
- `deal_state` — idempotency memory so a standing deal is not re-notified daily (`product_id` PK, `on_deal`, `quantity`, `unit_price`, `notified_at`)
- `initDb()` drops the legacy `grocery_lists` table and back-fills `quantity_price_quantity` on older product tables

## API

All `/api` routes except `/api/auth/*` and `/api/cron/*` require authentication (cookie or Bearer token). The cron route is gated separately by `CRON_SECRET`.

**Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/check`
**Watchlist:** `GET /api/watchlist`, `POST /api/watchlist` (`{ productId }`), `DELETE /api/watchlist/:productId`
**Products:** `GET /api/products`, `GET /api/products/categories`, `GET /api/products/:id`
**Cron:** `GET /api/cron/import-products` (Bearer `CRON_SECRET`; import → detect deals → notify)

## Deployment (Vercel)

Deployed at https://colruyt-x.vercel.app/. Vercel serves the Vite-built SPA as static files and routes `/api/*` to a serverless function (`api/index.ts`) that re-exports the Express app.

- `vercel.json` — build command, output directory, rewrites, the `api/index.ts` function config (`maxDuration: 300`), and the daily cron (`/api/cron/import-products` at `0 6 * * *`)
- `api/index.ts` — serverless entry point
- Environment variables (`APP_PIN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`) are set in the Vercel dashboard.
