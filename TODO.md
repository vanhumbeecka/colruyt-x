# TODO

Follow-ups from the sale-notification repurpose (design: `docs/superpowers/specs/2026-06-07-sale-notifications-design.md`, plan: `docs/superpowers/plans/2026-06-07-sale-notifications.md`).

## Operational (before the feature works in production)

- [ ] Run `npm run import:products` with a populated `.env` to confirm the GCS feed and import work end-to-end (could not be run during implementation — no secrets available).
- [ ] Set `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_IDS` in the Vercel dashboard.
- [ ] Confirm a real Telegram send via the opt-in e2e path (no mocked Telegram).

## Robustness (optional, from final review — none blocking)

- [ ] Delete the `deal_state` row when a product leaves the watchlist. Edge case: re-adding a product while it is still on the same deal currently suppresses the onset notification. A `DELETE FROM deal_state` in the watchlist `DELETE` handler closes it.
- [ ] Partial Telegram failure re-notifies already-sent events on the next run (notify + save are each all-or-nothing). This is an intentional duplicate-over-missed trade-off; revisit only if duplicates become a problem.

## Docs

- [ ] Refresh the rest of `README.md` and `CLAUDE.md` — they still describe the old grocery-list app rather than the sale-notification service. (The environment-variable sections are up to date.)
