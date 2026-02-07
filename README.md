# Colruyt-X

Grocery list manager for two people, built on Colruyt product data. Full-stack TypeScript: React SPA + Express API backed by [Turso](https://turso.tech/) (libSQL).

Live at **https://colruyt-x.vercel.app/**

## Stack

- **Client:** React 19, React Router 7, Tailwind CSS 4, Vite
- **Server:** Express 5, libSQL (Turso)
- **Auth:** PIN login with HMAC-signed stateless tokens (HttpOnly cookie or Bearer token)
- **Tooling:** oxlint, oxfmt, vitest, lint-staged
- **Deployment:** Vercel (SPA static files + serverless API function)

## Getting started

```bash
cp .env.example .env   # fill in APP_PIN, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
npm install
npm run import:products # populate the database with Colruyt product data
npm run dev             # starts client (Vite) + server (tsx watch) concurrently
```

## Commands

```bash
npm run dev              # Start client + server concurrently
npm run dev:client       # Vite dev server only (port 5173)
npm run dev:server       # Express API server only (port 3000)
npm run build            # TypeScript check + Vite build
npm test                 # Run tests (vitest)
npm run lint             # Lint (oxlint)
npm run fmt              # Format (oxfmt)
npm run fmt:check        # Check formatting without writing
npm start                # Production server (API + built client)
npm run import:products  # Fetch latest product data from GCS and upsert into Turso
make deploy              # Test + lint + format check + build + deploy to Vercel
```

## Environment variables

| Variable             | Description                                      |
| -------------------- | ------------------------------------------------ |
| `APP_PIN`            | PIN for login (also used as HMAC key for tokens) |
| `TURSO_DATABASE_URL` | Turso database URL (`libsql://...`)              |
| `TURSO_AUTH_TOKEN`   | Turso auth token                                 |
