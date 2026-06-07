# Sale Notifications — Design

**Date:** 2026-06-07
**Status:** Approved (design), pending implementation plan

## Goal

Repurpose Colruyt-X from a grocery-list manager into a **sale-notification** service:
notify the two users via **Telegram** when a product on their **shared watchlist**
enters or improves a **volume deal** ("buy N, pay X each" — the typical Colruyt
per-item reduction).

## Background: what the source data provides

The daily public GCS feed (`colruyt-products` bucket, ~15,200 products) carries two
sale-relevant signals:

1. **Volume deals (used).** `price.quantityPrice` + `price.quantityPriceQuantity`
   encode "buy `quantityPriceQuantity`, pay `quantityPrice` each." Example:
   *appel jonagold* — basic €1.89, buy **3.0** → €1.74 each. ~2,150 products carry
   this. Per-item discount is computable exactly: `(price − quantityPrice) / price`.
2. **Folder promos (not used).** `inPromo` + a `promotion[]` array give a promotion ID
   and publication date window only — **no discount mechanic**. Out of scope.

Note: at design time the feed was stale (newest snapshot `2026-04-10`), implying the
import cron had stopped. Restoring reliable daily import is part of this work.

## Scope

**In scope**
- Shared watchlist of products.
- Detect when a watched product enters a volume deal, or an existing deal's per-item
  price improves.
- Telegram notification with product name, deal terms, and discount %.
- Daily detection driven by the existing cron.

**Out of scope (clean future additions)**
- Folder-promo mechanics / any second data source.
- Threshold-based discovery alerts (notify on *any* product ≥ X% off).
- Per-user separate watchlists.
- Price-history charts / snapshot retention.
- "Deal ending soon" reminders.

## Approach

**Minimal repurpose.** Keep the stack (Express 5 + React 19 + Turso/libSQL + Vercel),
the `products` table, auth, the daily cron, and the React UI. Convert the single
grocery list into a watchlist; add volume-deal detection and a channel-agnostic
notifier with a Telegram implementation.

Rejected alternatives:
- *Snapshot history table* — enables future price charts but adds storage/code not
  needed now (YAGNI).
- *Separate detection service* — cleaner decoupling but unnecessary infra for two users;
  the single cron suffices.

## Data flow

```
Daily cron (Vercel, CRON_SECRET-protected)
  1. importProducts   fetch latest GCS snapshot → upsert `products`
  2. detectDeals      for each watched product: compute current volume deal,
                      compare to `deal_state` → emit DealEvent[] on onset/improvement
  3. notify           format events → Telegram → advance `deal_state.notified_at`
```

Step 1 failure aborts before step 2 (avoids false signals from a missing snapshot).

## Components

### `detectDeals(watched, priorState) → DealEvent[]` (pure)
Heart of the system; pure and exhaustively unit-testable.

- A product is **on a volume deal** when `quantity_price > 0 && quantity_price < price`
  and `quantity_price_quantity` is present.
- Discount% = `(price − quantity_price) / price`.
- Emits a `DealEvent` when:
  - `no-deal → deal` (onset), or
  - existing deal's `unit_price` (quantity_price) **decreases** (improvement).
- Emits **nothing** when: deal terms unchanged, deal disappears, or product never had a
  deal. (Deal-ended notifications are out of scope.)

`DealEvent`: `{ productId, name, basicPrice, quantity, unitPrice, discountPct, kind: 'onset' | 'improved' }`

### `Notifier` interface + `TelegramNotifier`
- `notify(events: DealEvent[]): Promise<void>`.
- Telegram impl reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS` (comma-separated)
  from env; sends one formatted message per event (or a batched message) including the
  product image where available.
- Interface allows adding email/ntfy/etc. later as a localized change.

### Watchlist module
- Replaces the single grocery list. Operations: `add(productId)`, `remove(productId)`,
  `list()`. Shared between both users (matches today's single-list model).

### Cron route
- Orchestrates the three steps; remains `CRON_SECRET`-protected.

## Schema changes (additive)

- `products`: **add `quantity_price_quantity REAL`** (currently dropped on import).
  `price` and `quantity_price` already exist. Import maps the new column from
  `price.quantityPriceQuantity`.
- **New `deal_state`** — idempotency memory so a standing deal is not re-sent daily:
  `product_id TEXT PK, on_deal INTEGER, quantity REAL, unit_price REAL, notified_at TEXT`.
- **`watchlist_items`** — `product_id TEXT PK, added_at TEXT`. Replaces
  `grocery_lists`; the grocery-specific columns (`items` JSON, `notes`) are dropped.

## UI (kept, trimmed)

- **Login** — unchanged.
- **Products** — search + "add to watchlist"; show a deal badge when `quantity_price`
  applies.
- **Watchlist** — replaces Home; lists watched items with current deal status. Remove
  grocery semantics (checked items, clear-checked, reset).

## Error handling & idempotency

- `deal_state` guarantees one notification per deal onset; daily reruns are no-ops
  unless the per-item price improves.
- Telegram/network failure: log and **do not** advance `notified_at`, so the event
  retries on the next run.
- Import failure aborts the run before detection.

## Testing (TDD)

- **Unit:** full transition matrix for `detectDeals` — none→deal, deal→better,
  deal→same (no-op), deal→gone (no-op), missing quantity. Pure, no mocks.
- **Notifier:** verified against a fake in unit tests; a real Telegram send confirmed
  once via an opt-in e2e (no mocked Telegram in e2e).
- Existing import tests retained/adjusted for the new column.

## Migration notes

- Drop/repurpose `grocery_lists`; remove grocery-list routes/UI (`list.ts`, Home grocery
  semantics) in favor of watchlist equivalents.
- Add the `quantity_price_quantity` column to `products` (and to the import upsert).
- Restore the daily import cron schedule (verify `vercel.json` cron + `CRON_SECRET`).
