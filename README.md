# Colruyt-X

Sale-notification service for two people, built on Colruyt product data. Maintain a shared **watchlist** of products and get a **Telegram** message when a watched product enters or improves a volume deal ("buy N, pay X each"). Full-stack TypeScript: React SPA + Express API backed by [Turso](https://turso.tech/) (libSQL).

## Screenshots

<p align="center">
  <img src="./docs/images/Screenshot%202026-06-09%20at%2009.12.14.png" width="25%" alt="image 1" />
  <img src="./docs/images/Screenshot%202026-06-09%20at%2009.15.14.png" width="25%" alt="image 2" />
  <img src="./docs/images/Screenshot%202026-06-10%20at%2010.06.28.png" width="25%" alt="image 3" />
</p>

## How it works

A daily Vercel cron hits `/api/cron/import-products` and runs three steps:

1. **Import** — fetch the latest Colruyt product snapshot from the public GCS feed and upsert into Turso.
2. **Detect** — for each watched product, compute its current volume deal and compare against the stored `deal_state`, emitting an event on deal onset or per-item price improvement.
3. **Notify** — format each event and send it to the configured Telegram chats.

Import failure aborts the run before detection (no false signals from a stale snapshot). Telegram/network failure throws before deal state is saved, so events retry on the next run.

## Stack

- **Client:** React 19, React Router 7, Tailwind CSS 4, Vite
- **Server:** Express 5, libSQL (Turso)
- **Auth:** PIN login with HMAC-signed stateless tokens (HttpOnly cookie or Bearer token)
- **Notifications:** Telegram Bot API
- **Tooling:** oxlint, oxfmt, vitest, lint-staged
- **Deployment:** Vercel (SPA static files + serverless API function + cron)

## Getting started

```bash
# Create a .env with the variables listed below
npm install
npm run import:products # populate the database with Colruyt product data
npm run dev             # starts client (Vite) + server (tsx watch) concurrently
```

## Self-hosting

The app is built to deploy on [Vercel](https://vercel.com/) (SPA static files + a serverless API function + a daily cron). To run your own instance:

1. **Database** — create a [Turso](https://turso.tech/) database and grab its URL and auth token.
2. **Telegram** — create a bot via [@BotFather](https://t.me/BotFather) for `TELEGRAM_BOT_TOKEN`, and collect the chat IDs to notify into `TELEGRAM_CHAT_IDS`.
3. **Deploy** — import the repo into Vercel, set the [environment variables](#environment-variables) in the project dashboard, and deploy (or run `make deploy` locally with the Vercel CLI linked).
4. **Seed data** — run `npm run import:products` once to populate the catalog. The daily cron (`/api/cron/import-products`, configured in `vercel.json`) keeps it fresh and sends notifications.

See the [architecture overview](https://vanhumbeecka.github.io/colruyt-x/) for a deeper walkthrough of the components and data flow.

## Commands

```bash
npm run dev              # Start client + server concurrently
npm run dev:client       # Vite dev server only (port 5173)
npm run dev:server       # Express API server only (port 3000)
npm run build            # TypeScript check + Vite build
npm test                 # Run tests (vitest)
npm run lint             # Lint + autofix (oxlint --fix)
npm run fmt              # Format (oxfmt)
npm start                # Production server (API + built client)
npm run import:products  # Fetch latest product data from GCS and upsert into Turso
make deploy              # Test + lint + format + build + deploy to Vercel
```

## Environment variables

| Variable             | Description                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `APP_PIN`            | PIN for login (also cookie-parser secret and HMAC key for tokens) |
| `TURSO_DATABASE_URL` | Turso database URL (`libsql://...`)                              |
| `TURSO_AUTH_TOKEN`   | Turso auth token                                                 |
| `CRON_SECRET`        | Bearer secret the Vercel cron presents to `/api/cron/import-products` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token used to send sale notifications              |
| `TELEGRAM_CHAT_IDS`  | Comma-separated Telegram chat IDs to notify                     |
