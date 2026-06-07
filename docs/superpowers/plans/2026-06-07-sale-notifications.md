# Sale Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose Colruyt-X from a grocery-list manager into a sale-notification service that alerts two users via Telegram when a watched product enters or improves a volume deal.

**Architecture:** Keep the stack (Express 5 + React 19 + Turso/libSQL + Vercel). Replace the single grocery list with a shared watchlist. Add a pure `detectDeals` function, a channel-agnostic `Notifier` (Telegram impl), and a `deal_state` idempotency table. The existing daily cron orchestrates import → detect → notify.

**Tech Stack:** TypeScript, Express 5, libSQL (`@libsql/client`), Vitest + supertest, React 19, native `fetch` (no new deps).

---

## Deviations from the design spec (corrections to spec assumptions)

The spec was written before re-reading the code. Three spec statements are inaccurate; this plan follows the code:

1. **`quantity_price` is NOT dropped on import.** It already exists in the `products` schema (`db.ts:23`) and is mapped (`import-products.ts:99`). The column actually missing is **`quantity_price_quantity`** (the *N* in "buy N"). Only that column is added.
2. **The cron route already exists** (`src/server/routes/cron.ts`) and already does step 1 (import). This plan converts it to a factory and adds steps 2–3 (detect + notify).
3. **The Vercel cron is already scheduled** (`vercel.json`, `0 6 * * *`). No edit needed — only verification. The stale feed at design time was operational (env/deploy), not a code defect.

**One additive type change:** `DealEvent` gains an `imageUrl: string | null` field (not in the spec's field list) so the notifier can satisfy its own stated requirement to "include the product image where available."

---

## File structure

**New files**
- `src/server/deals.ts` — pure deal logic: `WatchedProduct`, `DealState`, `DealEvent`, `ProductDeal` types; `computeDeal()`; `detectDeals()`.
- `src/server/deals.test.ts` — exhaustive transition-matrix unit tests for `detectDeals`.
- `src/server/deals-store.ts` — DB access: `loadWatchedProducts()`, `loadDealStates()`, `saveDealStates()`.
- `src/server/deals-store.test.ts` — in-memory DB round-trip tests.
- `src/server/notifier.ts` — `Notifier` interface, `formatEvent()`, `TelegramNotifier`.
- `src/server/notifier.test.ts` — `formatEvent` + `TelegramNotifier` (stubbed `fetch`) tests.
- `src/server/routes/watchlist.ts` — `watchlistRouter(db)`: list/add/remove.
- `src/server/routes/watchlist.test.ts` — watchlist route tests (in-memory DB).
- `src/client/pages/Watchlist.tsx` — replaces `Home.tsx`.

**Modified files**
- `src/server/db.ts` — add `quantity_price_quantity` column (+ migration), `watchlist_items` and `deal_state` tables, drop `grocery_lists`.
- `src/server/import-products.ts` — map `quantityPriceQuantity`; extract `productToArgs()`.
- `src/server/import-products.test.ts` — test the new mapping.
- `src/server/routes/cron.ts` — factory `cronRouter(db, notifier)`; orchestrate detect + notify.
- `src/server/routes/cron.test.ts` — in-memory DB + fake notifier; assert detection.
- `src/server/index.ts` — wire watchlist router + cron factory + TelegramNotifier.
- `src/client/api.ts` — Product fields, `WatchlistItem`, `getDeal()`, watchlist endpoints; drop grocery types/endpoints.
- `src/client/components/ProductCard.tsx` — deal badge.
- `src/client/pages/Products.tsx` — "add to watchlist".
- `src/client/App.tsx` — route `/` → Watchlist.

**Deleted files**
- `src/server/routes/list.ts`
- `src/server/routes/list.test.ts`
- `src/client/pages/Home.tsx`

> **Note on client tests:** `vitest.config.ts` only includes `src/server/**/*.test.ts`; the project has zero client tests and no client test runner. Per YAGNI and the spec's testing scope (which covers only `detectDeals`, the notifier, and import), client changes are verified with `npm run build` (tsc) + manual check, not new client test infra.

---

### Task 1: Schema — add column + watchlist/deal_state tables

**Files:**
- Modify: `src/server/db.ts:8-47`

- [ ] **Step 1: Replace `initDb()` to add the new column, tables, migration, and drop `grocery_lists`**

Replace the entire `initDb` function (lines 8-47) with:

```ts
export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS products (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      long_name        TEXT,
      short_name       TEXT,
      brand            TEXT,
      content          TEXT,
      thumbnail_url    TEXT,
      square_image_url TEXT,
      full_image_url   TEXT,
      price            REAL,
      unit_price       REAL,
      measurement_unit TEXT,
      quantity_price   REAL,
      quantity_price_quantity REAL,
      category_id      TEXT,
      category_name    TEXT,
      country_of_origin TEXT,
      is_bio           INTEGER DEFAULT 0,
      is_promo         INTEGER DEFAULT 0,
      is_available     INTEGER DEFAULT 1,
      last_updated     TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      product_id TEXT PRIMARY KEY,
      added_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deal_state (
      product_id  TEXT PRIMARY KEY,
      on_deal     INTEGER NOT NULL DEFAULT 0,
      quantity    REAL,
      unit_price  REAL,
      notified_at TEXT
    );

    DROP TABLE IF EXISTS grocery_lists;

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_long_name ON products(long_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_name);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
  `);

  // Existing prod DBs created before quantity_price_quantity: CREATE IF NOT EXISTS is a
  // no-op, so add the column if the live table is missing it.
  const cols = await db.execute("PRAGMA table_info(products)");
  const hasQpq = cols.rows.some((r) => r.name === "quantity_price_quantity");
  if (!hasQpq) {
    await db.execute("ALTER TABLE products ADD COLUMN quantity_price_quantity REAL");
  }
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/server/db.ts
git commit -m "feat: add quantity_price_quantity column, watchlist_items, deal_state tables"
```

---

### Task 2: Import — map `quantity_price_quantity`

**Files:**
- Modify: `src/server/import-products.ts:1-2,7-12,54-79,81-111`
- Test: `src/server/import-products.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the top of `src/server/import-products.test.ts` after the existing imports:

```ts
import { productToArgs } from "./import-products.js";
```

Add this `describe` block at the end of the file (before the final closing brace if the file is wrapped, otherwise at top level):

```ts
describe("productToArgs", () => {
  it("maps quantityPriceQuantity into the args", () => {
    const now = "2026-06-07T00:00:00.000Z";
    const args = productToArgs(
      {
        productId: "p1",
        name: "Appel Jonagold",
        LongName: "Appel Jonagold 1kg",
        ShortName: "Appel",
        brand: "Boni",
        content: "1kg",
        thumbNail: "t.jpg",
        squareImage: "s.jpg",
        fullImage: "f.jpg",
        price: {
          basicPrice: 1.89,
          measurementUnit: "K",
          measurementUnitPrice: 1.89,
          quantityPrice: 1.74,
          quantityPriceQuantity: 3,
        },
        topCategoryId: "c1",
        topCategoryName: "Fruit",
        CountryOfOrigin: "BE",
        IsBio: false,
        inPromo: false,
        isAvailable: true,
      },
      now,
    );
    // column order: ... price(9), unit_price(10), measurement_unit(11),
    // quantity_price(12), quantity_price_quantity(13) ...
    expect(args[12]).toBe(1.74);
    expect(args[13]).toBe(3);
  });

  it("maps null quantityPriceQuantity when absent", () => {
    const args = productToArgs(
      {
        productId: "p2",
        name: "Bread",
        LongName: "Bread",
        ShortName: "Bread",
        brand: "",
        content: "",
        thumbNail: "",
        squareImage: "",
        fullImage: "",
        price: {
          basicPrice: 2,
          measurementUnit: "ST",
          measurementUnitPrice: 2,
          quantityPrice: 0,
        } as never,
        topCategoryId: "",
        topCategoryName: "",
        CountryOfOrigin: "",
        IsBio: false,
        inPromo: false,
        isAvailable: true,
      },
      "2026-06-07T00:00:00.000Z",
    );
    expect(args[13]).toBeNull();
  });
});
```

Ensure `describe`, `it`, `expect` are imported in this test file (the existing import line is `import { describe, it, expect, vi, beforeEach } from "vitest";` — leave as is).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/import-products.test.ts`
Expected: FAIL — `productToArgs` is not exported / not a function.

- [ ] **Step 3: Add `quantityPriceQuantity` to the `ColruytPrice` interface**

In `src/server/import-products.ts`, replace the `ColruytPrice` interface (lines 7-12) with:

```ts
interface ColruytPrice {
  basicPrice: number;
  measurementUnit: string;
  measurementUnitPrice: number;
  quantityPrice: number;
  quantityPriceQuantity?: number;
}
```

- [ ] **Step 4: Add the column to the UPSERT SQL**

Replace `UPSERT_SQL` (lines 54-79) with:

```ts
const UPSERT_SQL = `
  INSERT INTO products (
    id, name, long_name, short_name, brand, content,
    thumbnail_url, square_image_url, full_image_url,
    price, unit_price, measurement_unit, quantity_price, quantity_price_quantity,
    category_id, category_name, country_of_origin,
    is_bio, is_promo, is_available, last_updated
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, long_name=excluded.long_name,
    short_name=excluded.short_name, brand=excluded.brand,
    content=excluded.content, thumbnail_url=excluded.thumbnail_url,
    square_image_url=excluded.square_image_url, full_image_url=excluded.full_image_url,
    price=excluded.price, unit_price=excluded.unit_price,
    measurement_unit=excluded.measurement_unit, quantity_price=excluded.quantity_price,
    quantity_price_quantity=excluded.quantity_price_quantity,
    category_id=excluded.category_id, category_name=excluded.category_name,
    country_of_origin=excluded.country_of_origin,
    is_bio=excluded.is_bio, is_promo=excluded.is_promo,
    is_available=excluded.is_available, last_updated=excluded.last_updated
`;
```

- [ ] **Step 5: Extract `productToArgs` and use it in `importProducts`**

Update the import on line 1 to include `InValue`:

```ts
import type { InStatement, InValue } from "@libsql/client";
```

Replace `importProducts` (lines 81-111) with:

```ts
export function productToArgs(p: ColruytProduct, now: string): InValue[] {
  return [
    p.productId,
    p.name,
    p.LongName || null,
    p.ShortName || null,
    p.brand || null,
    p.content || null,
    p.thumbNail || null,
    p.squareImage || null,
    p.fullImage || null,
    p.price?.basicPrice ?? null,
    p.price?.measurementUnitPrice ?? null,
    p.price?.measurementUnit || null,
    p.price?.quantityPrice ?? null,
    p.price?.quantityPriceQuantity ?? null,
    p.topCategoryId || null,
    p.topCategoryName || null,
    p.CountryOfOrigin || null,
    p.IsBio ? 1 : 0,
    p.inPromo ? 1 : 0,
    p.isAvailable ? 1 : 0,
    now,
  ];
}

export async function importProducts(products: ColruytProduct[]) {
  const now = new Date().toISOString();

  const statements: InStatement[] = products.map((p) => ({
    sql: UPSERT_SQL,
    args: productToArgs(p, now),
  }));

  await db.batch(statements, "write");
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/server/import-products.test.ts`
Expected: PASS (all tests, including the two new `productToArgs` cases).

- [ ] **Step 7: Commit**

```bash
git add src/server/import-products.ts src/server/import-products.test.ts
git commit -m "feat: import quantity_price_quantity from GCS feed"
```

---

### Task 3: `detectDeals` pure logic

**Files:**
- Create: `src/server/deals.ts`
- Test: `src/server/deals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/deals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectDeals, type WatchedProduct, type DealState } from "./deals.js";

function product(over: Partial<WatchedProduct> = {}): WatchedProduct {
  return {
    productId: "p1",
    name: "Appel Jonagold",
    price: 1.89,
    quantityPrice: 1.74,
    quantityPriceQuantity: 3,
    imageUrl: "f.jpg",
    ...over,
  };
}

function state(over: Partial<DealState> = {}): DealState {
  return { productId: "p1", onDeal: true, quantity: 3, unitPrice: 1.74, ...over };
}

describe("detectDeals", () => {
  it("emits onset when a product enters a deal (no prior state)", () => {
    const events = detectDeals([product()], new Map());
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("onset");
    expect(events[0].productId).toBe("p1");
    expect(events[0].basicPrice).toBe(1.89);
    expect(events[0].quantity).toBe(3);
    expect(events[0].unitPrice).toBe(1.74);
    expect(events[0].discountPct).toBeCloseTo(0.0794, 3);
    expect(events[0].imageUrl).toBe("f.jpg");
  });

  it("emits onset when prior state was not on a deal", () => {
    const prior = new Map([["p1", state({ onDeal: false, quantity: null, unitPrice: null })]]);
    const events = detectDeals([product()], prior);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("onset");
  });

  it("emits improved when the per-item price decreases", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.8 })]]);
    const events = detectDeals([product({ quantityPrice: 1.74 })], prior);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("improved");
    expect(events[0].unitPrice).toBe(1.74);
  });

  it("emits nothing when deal terms are unchanged", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.74 })]]);
    expect(detectDeals([product({ quantityPrice: 1.74 })], prior)).toHaveLength(0);
  });

  it("emits nothing when the per-item price gets worse", () => {
    const prior = new Map([["p1", state({ unitPrice: 1.6 })]]);
    expect(detectDeals([product({ quantityPrice: 1.74 })], prior)).toHaveLength(0);
  });

  it("emits nothing when an existing deal disappears", () => {
    const prior = new Map([["p1", state()]]);
    const gone = product({ quantityPrice: null, quantityPriceQuantity: null });
    expect(detectDeals([gone], prior)).toHaveLength(0);
  });

  it("emits nothing when quantity is missing", () => {
    const noQty = product({ quantityPriceQuantity: null });
    expect(detectDeals([noQty], new Map())).toHaveLength(0);
  });

  it("emits nothing when the product never had a deal (no quantityPrice)", () => {
    const noDeal = product({ quantityPrice: null, quantityPriceQuantity: null });
    expect(detectDeals([noDeal], new Map())).toHaveLength(0);
  });

  it("emits nothing when quantityPrice is not below price", () => {
    const noDeal = product({ quantityPrice: 1.89 });
    expect(detectDeals([noDeal], new Map())).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/deals.test.ts`
Expected: FAIL — cannot find module `./deals.js`.

- [ ] **Step 3: Write the implementation**

Create `src/server/deals.ts`:

```ts
export interface WatchedProduct {
  productId: string;
  name: string;
  price: number | null;
  quantityPrice: number | null;
  quantityPriceQuantity: number | null;
  imageUrl: string | null;
}

export interface DealState {
  productId: string;
  onDeal: boolean;
  quantity: number | null;
  unitPrice: number | null;
}

export type DealKind = "onset" | "improved";

export interface DealEvent {
  productId: string;
  name: string;
  basicPrice: number;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  imageUrl: string | null;
  kind: DealKind;
}

export interface ProductDeal {
  onDeal: boolean;
  quantity: number | null;
  unitPrice: number | null;
}

// A product is on a volume deal when quantityPrice is a positive per-item price
// below the basic price and a quantity ("buy N") is present.
export function computeDeal(p: WatchedProduct): ProductDeal {
  const onDeal =
    p.price != null &&
    p.quantityPrice != null &&
    p.quantityPrice > 0 &&
    p.quantityPrice < p.price &&
    p.quantityPriceQuantity != null &&
    p.quantityPriceQuantity > 0;
  return {
    onDeal,
    quantity: onDeal ? p.quantityPriceQuantity : null,
    unitPrice: onDeal ? p.quantityPrice : null,
  };
}

export function detectDeals(
  watched: WatchedProduct[],
  priorState: Map<string, DealState>,
): DealEvent[] {
  const events: DealEvent[] = [];
  for (const p of watched) {
    const deal = computeDeal(p);
    if (!deal.onDeal) continue;

    const prior = priorState.get(p.productId);
    const onset = !prior || !prior.onDeal;
    const improved =
      !onset && prior.unitPrice != null && deal.unitPrice! < prior.unitPrice;

    if (!onset && !improved) continue;

    events.push({
      productId: p.productId,
      name: p.name,
      basicPrice: p.price!,
      quantity: deal.quantity!,
      unitPrice: deal.unitPrice!,
      discountPct: (p.price! - p.quantityPrice!) / p.price!,
      imageUrl: p.imageUrl,
      kind: onset ? "onset" : "improved",
    });
  }
  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/deals.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/deals.ts src/server/deals.test.ts
git commit -m "feat: detectDeals pure volume-deal detection"
```

---

### Task 4: Notifier interface + TelegramNotifier

**Files:**
- Create: `src/server/notifier.ts`
- Test: `src/server/notifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/notifier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatEvent, TelegramNotifier } from "./notifier.js";
import type { DealEvent } from "./deals.js";

function event(over: Partial<DealEvent> = {}): DealEvent {
  return {
    productId: "p1",
    name: "Appel Jonagold",
    basicPrice: 1.89,
    quantity: 3,
    unitPrice: 1.74,
    discountPct: 0.0794,
    imageUrl: null,
    kind: "onset",
    ...over,
  };
}

describe("formatEvent", () => {
  it("formats an onset event with terms and discount", () => {
    const text = formatEvent(event());
    expect(text).toContain("Appel Jonagold");
    expect(text).toContain("Buy 3");
    expect(text).toContain("1.74");
    expect(text).toContain("1.89");
    expect(text).toContain("8%");
  });

  it("labels improved deals differently from onsets", () => {
    expect(formatEvent(event({ kind: "onset" }))).not.toEqual(
      formatEvent(event({ kind: "improved" })),
    );
  });
});

describe("TelegramNotifier", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "TOKEN";
    process.env.TELEGRAM_CHAT_IDS = "111,222";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("does nothing for an empty event list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await new TelegramNotifier().notify([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when the bot token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(new TelegramNotifier().notify([event()])).rejects.toThrow(
      "TELEGRAM_BOT_TOKEN",
    );
  });

  it("sends one sendMessage per chat id when there is no image", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await new TelegramNotifier().notify([event()]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: "111",
    });
  });

  it("uses sendPhoto when an image is present", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await new TelegramNotifier().notify([event({ imageUrl: "f.jpg" })]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.telegram.org/botTOKEN/sendPhoto");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: "111",
      photo: "f.jpg",
    });
  });

  it("throws when Telegram responds with a non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 400 }),
    );
    await expect(new TelegramNotifier().notify([event()])).rejects.toThrow(
      "Telegram send failed: 400",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/notifier.test.ts`
Expected: FAIL — cannot find module `./notifier.js`.

- [ ] **Step 3: Write the implementation**

Create `src/server/notifier.ts`:

```ts
import type { DealEvent } from "./deals.js";

export interface Notifier {
  notify(events: DealEvent[]): Promise<void>;
}

export function formatEvent(e: DealEvent): string {
  const pct = Math.round(e.discountPct * 100);
  const verb = e.kind === "onset" ? "New deal" : "Better deal";
  return (
    `🏷️ ${verb}: ${e.name}\n` +
    `Buy ${e.quantity}, pay €${e.unitPrice.toFixed(2)} each (was €${e.basicPrice.toFixed(2)})\n` +
    `${pct}% off`
  );
}

export class TelegramNotifier implements Notifier {
  async notify(events: DealEvent[]): Promise<void> {
    if (events.length === 0) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = (process.env.TELEGRAM_CHAT_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    if (chatIds.length === 0)
      throw new Error("TELEGRAM_CHAT_IDS environment variable is required");

    for (const event of events) {
      const text = formatEvent(event);
      for (const chatId of chatIds) {
        await this.send(token, chatId, text, event.imageUrl);
      }
    }
  }

  private async send(
    token: string,
    chatId: string,
    text: string,
    imageUrl: string | null,
  ): Promise<void> {
    const base = `https://api.telegram.org/bot${token}`;
    const url = imageUrl ? `${base}/sendPhoto` : `${base}/sendMessage`;
    const body = imageUrl
      ? { chat_id: chatId, photo: imageUrl, caption: text }
      : { chat_id: chatId, text };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Telegram send failed: ${res.status}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/notifier.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/notifier.ts src/server/notifier.test.ts
git commit -m "feat: Notifier interface and TelegramNotifier"
```

---

### Task 5: Deal-state store (load/save DB helpers)

**Files:**
- Create: `src/server/deals-store.ts`
- Test: `src/server/deals-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/deals-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { loadWatchedProducts, loadDealStates, saveDealStates } from "./deals-store.js";

async function makeDb(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await db.executeMultiple(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY, name TEXT, long_name TEXT, price REAL,
      quantity_price REAL, quantity_price_quantity REAL, full_image_url TEXT
    );
    CREATE TABLE watchlist_items (product_id TEXT PRIMARY KEY, added_at TEXT);
    CREATE TABLE deal_state (
      product_id TEXT PRIMARY KEY, on_deal INTEGER, quantity REAL,
      unit_price REAL, notified_at TEXT
    );
  `);
  return db;
}

describe("deals-store", () => {
  let db: Client;
  beforeEach(async () => {
    db = await makeDb();
  });

  it("loads only watched products, preferring long_name", async () => {
    await db.execute(
      "INSERT INTO products VALUES ('p1','Appel','Appel Jonagold 1kg',1.89,1.74,3,'f.jpg')",
    );
    await db.execute("INSERT INTO products VALUES ('p2','Bread',NULL,2,NULL,NULL,NULL)");
    await db.execute("INSERT INTO watchlist_items VALUES ('p1','2026-06-07')");

    const watched = await loadWatchedProducts(db);
    expect(watched).toHaveLength(1);
    expect(watched[0]).toEqual({
      productId: "p1",
      name: "Appel Jonagold 1kg",
      price: 1.89,
      quantityPrice: 1.74,
      quantityPriceQuantity: 3,
      imageUrl: "f.jpg",
    });
  });

  it("round-trips deal states through save and load", async () => {
    await db.execute(
      "INSERT INTO products VALUES ('p1','Appel','Appel',1.89,1.74,3,'f.jpg')",
    );
    await db.execute("INSERT INTO products VALUES ('p2','Bread','Bread',2,NULL,NULL,NULL)");
    await db.execute("INSERT INTO watchlist_items VALUES ('p1','2026-06-07')");
    await db.execute("INSERT INTO watchlist_items VALUES ('p2','2026-06-07')");

    const watched = await loadWatchedProducts(db);
    await saveDealStates(db, watched, "2026-06-07T06:00:00.000Z");

    const states = await loadDealStates(db);
    expect(states.get("p1")).toEqual({
      productId: "p1",
      onDeal: true,
      quantity: 3,
      unitPrice: 1.74,
    });
    expect(states.get("p2")).toEqual({
      productId: "p2",
      onDeal: false,
      quantity: null,
      unitPrice: null,
    });
  });

  it("overwrites a prior deal state on re-save", async () => {
    await db.execute(
      "INSERT INTO products VALUES ('p1','Appel','Appel',1.89,1.74,3,'f.jpg')",
    );
    await db.execute("INSERT INTO watchlist_items VALUES ('p1','2026-06-07')");
    await db.execute(
      "INSERT INTO deal_state VALUES ('p1',1,3,1.80,'2026-06-06T06:00:00.000Z')",
    );

    const watched = await loadWatchedProducts(db);
    await saveDealStates(db, watched, "2026-06-07T06:00:00.000Z");

    const states = await loadDealStates(db);
    expect(states.get("p1")!.unitPrice).toBe(1.74);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/deals-store.test.ts`
Expected: FAIL — cannot find module `./deals-store.js`.

- [ ] **Step 3: Write the implementation**

Create `src/server/deals-store.ts`:

```ts
import type { Client } from "@libsql/client";
import { computeDeal, type WatchedProduct, type DealState } from "./deals.js";

export async function loadWatchedProducts(db: Client): Promise<WatchedProduct[]> {
  const result = await db.execute(`
    SELECT p.id, p.name, p.long_name, p.price,
           p.quantity_price, p.quantity_price_quantity, p.full_image_url
    FROM watchlist_items w
    JOIN products p ON p.id = w.product_id
  `);
  return result.rows.map((r) => ({
    productId: r.id as string,
    name: (r.long_name as string) || (r.name as string),
    price: r.price as number | null,
    quantityPrice: r.quantity_price as number | null,
    quantityPriceQuantity: r.quantity_price_quantity as number | null,
    imageUrl: r.full_image_url as string | null,
  }));
}

export async function loadDealStates(db: Client): Promise<Map<string, DealState>> {
  const result = await db.execute("SELECT * FROM deal_state");
  const map = new Map<string, DealState>();
  for (const r of result.rows) {
    map.set(r.product_id as string, {
      productId: r.product_id as string,
      onDeal: (r.on_deal as number) === 1,
      quantity: r.quantity as number | null,
      unitPrice: r.unit_price as number | null,
    });
  }
  return map;
}

export async function saveDealStates(
  db: Client,
  watched: WatchedProduct[],
  now: string,
): Promise<void> {
  if (watched.length === 0) return;
  const statements = watched.map((p) => {
    const deal = computeDeal(p);
    return {
      sql: `
        INSERT INTO deal_state (product_id, on_deal, quantity, unit_price, notified_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(product_id) DO UPDATE SET
          on_deal=excluded.on_deal, quantity=excluded.quantity,
          unit_price=excluded.unit_price, notified_at=excluded.notified_at
      `,
      args: [
        p.productId,
        deal.onDeal ? 1 : 0,
        deal.quantity,
        deal.unitPrice,
        deal.onDeal ? now : null,
      ],
    };
  });
  await db.batch(statements, "write");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/deals-store.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/deals-store.ts src/server/deals-store.test.ts
git commit -m "feat: deal-state store load/save helpers"
```

---

### Task 6: Watchlist route (replaces grocery list)

**Files:**
- Create: `src/server/routes/watchlist.ts`
- Test: `src/server/routes/watchlist.test.ts`
- Delete: `src/server/routes/list.ts`, `src/server/routes/list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/routes/watchlist.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createClient, type Client } from "@libsql/client";
import authRouter from "./auth.js";
import watchlistRouter from "./watchlist.js";
import { getTokenFromRequest, verifyToken } from "../auth.js";

const TEST_PIN = "1234";

async function createApp() {
  process.env.APP_PIN = TEST_PIN;
  const db: Client = createClient({ url: ":memory:" });
  await db.executeMultiple(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY, name TEXT, long_name TEXT, brand TEXT, content TEXT,
      thumbnail_url TEXT, full_image_url TEXT, price REAL, unit_price REAL,
      measurement_unit TEXT, quantity_price REAL, quantity_price_quantity REAL,
      category_name TEXT, is_promo INTEGER, is_bio INTEGER
    );
    CREATE TABLE watchlist_items (product_id TEXT PRIMARY KEY, added_at TEXT);
    INSERT INTO products (id, name, long_name, price, quantity_price, quantity_price_quantity, is_promo, is_bio)
      VALUES ('p1','Appel','Appel Jonagold',1.89,1.74,3,0,0);
  `);

  const app = express();
  app.use(express.json());
  app.use(cookieParser(TEST_PIN));
  app.use("/api/auth", authRouter);
  app.use("/api", (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token || !verifyToken(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });
  app.use("/api/watchlist", watchlistRouter(db));
  return { app, db };
}

async function login(app: express.Express): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });
  return res.body.token;
}

describe("watchlist routes", () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    const created = await createApp();
    app = created.app;
    token = await login(app);
  });

  it("starts empty", async () => {
    const res = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("adds a product and returns it joined with product + deal fields", async () => {
    await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: "p1" });

    const res = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].product_id).toBe("p1");
    expect(res.body[0].long_name).toBe("Appel Jonagold");
    expect(res.body[0].quantity_price).toBe(1.74);
    expect(res.body[0].quantity_price_quantity).toBe(3);
  });

  it("rejects add without a productId", async () => {
    const res = await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("is idempotent when adding the same product twice", async () => {
    const add = () =>
      request(app)
        .post("/api/watchlist")
        .set("Authorization", `Bearer ${token}`)
        .send({ productId: "p1" });
    await add();
    await add();
    const res = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(res.body).toHaveLength(1);
  });

  it("removes a product", async () => {
    await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: "p1" });

    const del = await request(app)
      .delete("/api/watchlist/p1")
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);

    const res = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/routes/watchlist.test.ts`
Expected: FAIL — cannot find module `./watchlist.js`.

- [ ] **Step 3: Write the implementation**

Create `src/server/routes/watchlist.ts`:

```ts
import { Router } from "express";
import type { Client } from "@libsql/client";

export default function watchlistRouter(db: Client) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const result = await db.execute(`
      SELECT w.product_id, w.added_at,
             p.name, p.long_name, p.brand, p.content,
             p.thumbnail_url, p.full_image_url,
             p.price, p.unit_price, p.measurement_unit,
             p.quantity_price, p.quantity_price_quantity,
             p.category_name, p.is_promo, p.is_bio
      FROM watchlist_items w
      JOIN products p ON p.id = w.product_id
      ORDER BY w.added_at DESC
    `);
    res.json(result.rows);
  });

  router.post("/", async (req, res) => {
    const { productId } = req.body;
    if (!productId) {
      res.status(400).json({ error: "productId is required" });
      return;
    }
    const now = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO watchlist_items (product_id, added_at) VALUES (?, ?) ON CONFLICT(product_id) DO NOTHING",
      args: [productId, now],
    });
    res.json({ ok: true });
  });

  router.delete("/:productId", async (req, res) => {
    await db.execute({
      sql: "DELETE FROM watchlist_items WHERE product_id = ?",
      args: [req.params.productId],
    });
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/routes/watchlist.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Delete the grocery-list route and its test**

```bash
git rm src/server/routes/list.ts src/server/routes/list.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/watchlist.ts src/server/routes/watchlist.test.ts
git commit -m "feat: watchlist route replaces grocery list route"
```

---

### Task 7: Cron route — orchestrate import → detect → notify

**Files:**
- Modify: `src/server/routes/cron.ts` (whole file)
- Test: `src/server/routes/cron.test.ts` (whole file)

- [ ] **Step 1: Rewrite the test for the factory + detection flow**

Replace the entire contents of `src/server/routes/cron.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createClient, type Client } from "@libsql/client";
import cronRouter from "./cron.js";
import type { Notifier } from "../notifier.js";
import type { DealEvent } from "../deals.js";

const TEST_CRON_SECRET = "test-cron-secret-that-is-long-enough";

vi.mock("../import-products.js", () => ({
  getLatestFileName: vi.fn().mockResolvedValue("colruyt-products/2026-06-07"),
  downloadProducts: vi.fn().mockResolvedValue([{ productId: "1", name: "Milk" }]),
  importProducts: vi.fn().mockResolvedValue(undefined),
}));

class FakeNotifier implements Notifier {
  received: DealEvent[][] = [];
  shouldThrow = false;
  async notify(events: DealEvent[]): Promise<void> {
    if (this.shouldThrow) throw new Error("telegram down");
    this.received.push(events);
  }
}

async function makeDb(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await db.executeMultiple(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY, name TEXT, long_name TEXT, price REAL,
      quantity_price REAL, quantity_price_quantity REAL, full_image_url TEXT
    );
    CREATE TABLE watchlist_items (product_id TEXT PRIMARY KEY, added_at TEXT);
    CREATE TABLE deal_state (
      product_id TEXT PRIMARY KEY, on_deal INTEGER, quantity REAL,
      unit_price REAL, notified_at TEXT
    );
    INSERT INTO products VALUES ('1','Milk','Milk 1L',1.89,1.74,3,'f.jpg');
    INSERT INTO watchlist_items VALUES ('1','2026-06-07');
  `);
  return db;
}

async function createApp(notifier: Notifier) {
  process.env.CRON_SECRET = TEST_CRON_SECRET;
  const db = await makeDb();
  const app = express();
  app.use("/api/cron", cronRouter(db, notifier));
  return { app, db };
}

describe("cron routes", () => {
  let notifier: FakeNotifier;
  let app: express.Express;
  let db: Client;

  beforeEach(async () => {
    notifier = new FakeNotifier();
    const created = await createApp(notifier);
    app = created.app;
    db = created.db;
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects requests without authorization", async () => {
    const res = await request(app).get("/api/cron/import-products");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("rejects requests with the wrong secret", async () => {
    const res = await request(app)
      .get("/api/cron/import-products")
      .set("Authorization", "Bearer wrong-secret");
    expect(res.status).toBe(401);
  });

  it("imports, detects an onset deal, notifies, and persists deal_state", async () => {
    const res = await request(app)
      .get("/api/cron/import-products")
      .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.events).toBe(1);

    expect(notifier.received).toHaveLength(1);
    expect(notifier.received[0][0].kind).toBe("onset");
    expect(notifier.received[0][0].productId).toBe("1");

    const state = await db.execute("SELECT * FROM deal_state WHERE product_id = '1'");
    expect(state.rows[0].on_deal).toBe(1);
    expect(state.rows[0].unit_price).toBe(1.74);
  });

  it("does not re-notify when the deal is unchanged on a second run", async () => {
    const run = () =>
      request(app)
        .get("/api/cron/import-products")
        .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
    await run();
    notifier.received = [];
    const res = await run();
    expect(res.body.events).toBe(0);
    expect(notifier.received).toEqual([]);
  });

  it("does not advance deal_state when notify fails", async () => {
    notifier.shouldThrow = true;
    const res = await request(app)
      .get("/api/cron/import-products")
      .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("telegram down");

    const state = await db.execute("SELECT * FROM deal_state");
    expect(state.rows).toHaveLength(0);
  });

  it("returns 500 when the import step fails", async () => {
    const { getLatestFileName } = await import("../import-products.js");
    vi.mocked(getLatestFileName).mockRejectedValueOnce(new Error("GCS down"));
    const res = await request(app)
      .get("/api/cron/import-products")
      .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("GCS down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/routes/cron.test.ts`
Expected: FAIL — `cronRouter` is not a function that accepts `(db, notifier)` / `res.body.events` undefined.

- [ ] **Step 3: Rewrite the cron route as a factory with detection + notification**

Replace the entire contents of `src/server/routes/cron.ts` with:

```ts
import { Router } from "express";
import type { Client } from "@libsql/client";
import { getLatestFileName, downloadProducts, importProducts } from "../import-products.js";
import { detectDeals } from "../deals.js";
import { loadWatchedProducts, loadDealStates, saveDealStates } from "../deals-store.js";
import type { Notifier } from "../notifier.js";

export default function cronRouter(db: Client, notifier: Notifier) {
  const router = Router();

  router.get("/import-products", async (req, res) => {
    console.log("[cron/import-products] Started");

    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!cronSecret || token !== cronSecret) {
      console.error("[cron/import-products] Unauthorized: invalid or missing CRON_SECRET");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      // Step 1: import. Aborts the run on failure so detection never sees a stale snapshot.
      const fileName = await getLatestFileName();
      console.log(`[cron/import-products] Found file: ${fileName}`);
      const products = await downloadProducts(fileName);
      console.log(`[cron/import-products] Downloaded ${products.length} products`);
      await importProducts(products);

      // Step 2: detect deals for watched products.
      const watched = await loadWatchedProducts(db);
      const priorStates = await loadDealStates(db);
      const events = detectDeals(watched, priorStates);
      console.log(`[cron/import-products] ${events.length} deal event(s)`);

      // Step 3: notify. On failure we throw before saving state so events retry next run.
      if (events.length > 0) {
        await notifier.notify(events);
      }
      await saveDealStates(db, watched, new Date().toISOString());

      console.log(`[cron/import-products] Done — ${products.length} products, ${events.length} events`);
      res.json({ ok: true, count: products.length, events: events.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cron/import-products] Failed: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/routes/cron.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/cron.ts src/server/routes/cron.test.ts
git commit -m "feat: cron orchestrates import, detect, and notify"
```

---

### Task 8: Wire server (`index.ts`)

**Files:**
- Modify: `src/server/index.ts:1-40`

- [ ] **Step 1: Replace imports and route mounts**

In `src/server/index.ts`, replace the list-router import (line 8) and the cron import (line 9) region. Change line 8 from:

```ts
import listRouter from "./routes/list.js";
import cronRouter from "./routes/cron.js";
```

to:

```ts
import watchlistRouter from "./routes/watchlist.js";
import cronRouter from "./routes/cron.js";
import { TelegramNotifier } from "./notifier.js";
```

- [ ] **Step 2: Update the cron mount to use the factory + notifier**

Replace line 26:

```ts
app.use("/api/cron", cronRouter);
```

with:

```ts
const notifier = new TelegramNotifier();
app.use("/api/cron", cronRouter(db, notifier));
```

- [ ] **Step 3: Replace the list mount with the watchlist mount**

Replace line 38:

```ts
app.use("/api/list", listRouter(db));
```

with:

```ts
app.use("/api/watchlist", watchlistRouter(db));
```

- [ ] **Step 4: Run the full server test suite + type-check**

Run: `npm test`
Expected: PASS (all server tests, no `list.test.ts` anymore).

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: wire watchlist router and notifier into the app"
```

---

### Task 9: Client API client — types + watchlist endpoints + deal helper

**Files:**
- Modify: `src/client/api.ts` (whole file)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/client/api.ts` with:

```ts
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Product {
  id: string;
  name: string;
  long_name: string | null;
  short_name: string | null;
  brand: string | null;
  content: string | null;
  thumbnail_url: string | null;
  square_image_url: string | null;
  price: number | null;
  unit_price: number | null;
  measurement_unit: string | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
  category_name: string | null;
  is_promo: number;
  is_bio: number;
}

export interface ProductsResponse {
  products: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WatchlistItem {
  product_id: string;
  added_at: string;
  name: string;
  long_name: string | null;
  brand: string | null;
  content: string | null;
  thumbnail_url: string | null;
  full_image_url: string | null;
  price: number | null;
  unit_price: number | null;
  measurement_unit: string | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
  category_name: string | null;
  is_promo: number;
  is_bio: number;
}

export interface Deal {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

// Mirrors the server's computeDeal: a volume deal is a positive per-item price
// below the basic price with a "buy N" quantity present.
export function getDeal(p: {
  price: number | null;
  quantity_price: number | null;
  quantity_price_quantity: number | null;
}): Deal | null {
  if (
    p.price == null ||
    p.quantity_price == null ||
    p.quantity_price_quantity == null ||
    p.quantity_price <= 0 ||
    p.quantity_price >= p.price ||
    p.quantity_price_quantity <= 0
  ) {
    return null;
  }
  return {
    quantity: p.quantity_price_quantity,
    unitPrice: p.quantity_price,
    discountPct: (p.price - p.quantity_price) / p.price,
  };
}

export const api = {
  // Auth
  login: (pin: string) =>
    apiFetch<{ ok: boolean; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),

  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  checkAuth: () => apiFetch<{ authenticated: boolean }>("/api/auth/check"),

  // Watchlist
  getWatchlist: () => apiFetch<WatchlistItem[]>("/api/watchlist"),

  addToWatchlist: (productId: string) =>
    apiFetch<{ ok: boolean }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ productId }),
    }),

  removeFromWatchlist: (productId: string) =>
    apiFetch<{ ok: boolean }>(`/api/watchlist/${productId}`, { method: "DELETE" }),

  // Products
  searchProducts: (q: string, page = 1, limit = 20, category = "") =>
    apiFetch<ProductsResponse>(
      `/api/products?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&category=${encodeURIComponent(category)}`,
    ),

  getProduct: (id: string) => apiFetch<Product>(`/api/products/${id}`),

  getCategories: () => apiFetch<string[]>("/api/products/categories"),
};
```

- [ ] **Step 2: Commit (build verified after dependent pages are updated)**

```bash
git add src/client/api.ts
git commit -m "feat: client API watchlist endpoints, Product deal fields, getDeal helper"
```

---

### Task 10: ProductCard deal badge

**Files:**
- Modify: `src/client/components/ProductCard.tsx:1,44-46`

- [ ] **Step 1: Import the deal helper**

Replace line 1:

```ts
import type { Product } from "../api.ts";
```

with:

```ts
import { getDeal, type Product } from "../api.ts";
```

- [ ] **Step 2: Add the deal badge next to the promo badge**

Replace the promo badge block (lines 44-46):

```tsx
          {product.is_promo === 1 && (
            <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Promo</span>
          )}
```

with:

```tsx
          {product.is_promo === 1 && (
            <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Promo</span>
          )}
          {(() => {
            const deal = getDeal(product);
            return deal ? (
              <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                {`Buy ${deal.quantity}: €${deal.unitPrice.toFixed(2)} (-${Math.round(deal.discountPct * 100)}%)`}
              </span>
            ) : null;
          })()}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ProductCard.tsx
git commit -m "feat: show volume-deal badge on ProductCard"
```

---

### Task 11: Watchlist page (replaces Home)

**Files:**
- Create: `src/client/pages/Watchlist.tsx`
- Delete: `src/client/pages/Home.tsx`

- [ ] **Step 1: Create the Watchlist page**

Create `src/client/pages/Watchlist.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api, getDeal, type WatchlistItem } from "../api.ts";

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await api.getWatchlist());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(productId: string) {
    await api.removeFromWatchlist(productId);
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <Link to="/products" className="text-sm text-orange-600 hover:text-orange-700">
          + Add from Products
        </Link>
      </div>

      {items.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          No products watched yet. Browse products to add some.
        </p>
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const deal = getDeal(item);
          return (
            <div
              key={item.product_id}
              className="flex items-center gap-3 bg-white rounded border p-3"
            >
              {item.thumbnail_url && (
                <img
                  src={item.thumbnail_url}
                  alt={item.name}
                  className="w-12 h-12 object-contain shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.long_name || item.name}
                </p>
                <div className="flex items-baseline gap-2">
                  {item.price != null && (
                    <span className="text-sm text-orange-600">
                      {"€"}
                      {item.price.toFixed(2)}
                    </span>
                  )}
                  {deal ? (
                    <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                      {`Buy ${deal.quantity}: €${deal.unitPrice.toFixed(2)} (-${Math.round(deal.discountPct * 100)}%)`}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No deal</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(item.product_id)}
                className="text-gray-400 hover:text-red-500 text-sm"
                title="Remove from watchlist"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old Home page**

```bash
git rm src/client/pages/Home.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/client/pages/Watchlist.tsx
git commit -m "feat: Watchlist page replaces grocery Home page"
```

---

### Task 12: Products page — add to watchlist

**Files:**
- Modify: `src/client/pages/Products.tsx:2,41-55,92`

- [ ] **Step 1: Update the imports (drop grocery types)**

Replace line 2:

```ts
import { api, type Product, type ProductsResponse, type GroceryListItem } from "../api.ts";
```

with:

```ts
import { api, type Product, type ProductsResponse } from "../api.ts";
```

- [ ] **Step 2: Replace the add handler**

Replace `handleAddToList` (lines 41-55):

```tsx
  async function handleAddToList(product: Product) {
    const list = await api.getList();
    const items: GroceryListItem[] = JSON.parse(list.items);
    items.push({
      name: product.long_name || product.name,
      amount: "1",
      unit: "",
      checked: false,
      productId: product.id,
      price: product.price ?? undefined,
    });
    await api.updateList({ items });
    setAdded(product.id);
    setTimeout(() => setAdded(null), 1500);
  }
```

with:

```tsx
  async function handleAddToWatchlist(product: Product) {
    await api.addToWatchlist(product.id);
    setAdded(product.id);
    setTimeout(() => setAdded(null), 1500);
  }
```

- [ ] **Step 3: Update the confirmation message**

Replace line 92:

```tsx
      {added && <p className="text-sm text-green-600">Added to list!</p>}
```

with:

```tsx
      {added && <p className="text-sm text-green-600">Added to watchlist!</p>}
```

- [ ] **Step 4: Point ProductCard at the new handler**

In the product grid, replace `onAddToList={handleAddToList}` (around line 104):

```tsx
              <ProductCard key={p.id} product={p} onAddToList={handleAddToList} />
```

with:

```tsx
              <ProductCard key={p.id} product={p} onAddToList={handleAddToWatchlist} />
```

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/Products.tsx
git commit -m "feat: Products page adds to watchlist"
```

---

### Task 13: App routing — `/` → Watchlist

**Files:**
- Modify: `src/client/App.tsx:5,34,50`

- [ ] **Step 1: Swap the Home import for Watchlist**

Replace line 5:

```tsx
import Home from "./pages/Home.tsx";
```

with:

```tsx
import Watchlist from "./pages/Watchlist.tsx";
```

- [ ] **Step 2: Update the brand link label (optional polish) and the route element**

Replace the `/` route (line 50):

```tsx
            <Route path="/" element={<Home />} />
```

with:

```tsx
            <Route path="/" element={<Watchlist />} />
```

- [ ] **Step 3: Verify the full client + server build passes**

Run: `npm run build`
Expected: PASS — `tsc -b` reports no errors and Vite builds to `dist/`.

- [ ] **Step 4: Commit**

```bash
git add src/client/App.tsx
git commit -m "feat: route home to Watchlist page"
```

---

### Task 14: Env docs, cron verification, and full verification

**Files:**
- Modify: `CLAUDE.md` (Environment section)

- [ ] **Step 1: Document the new env vars in CLAUDE.md**

In `CLAUDE.md`, find the Environment section listing `APP_PIN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and add below them:

```markdown
- `CRON_SECRET` — Bearer secret the Vercel cron presents to `/api/cron/import-products`
- `TELEGRAM_BOT_TOKEN` — Telegram bot token used to send sale notifications
- `TELEGRAM_CHAT_IDS` — comma-separated Telegram chat IDs to notify
```

- [ ] **Step 2: Verify the Vercel cron schedule is present (no edit expected)**

Run: `grep -A3 '"crons"' vercel.json`
Expected: shows `"path": "/api/cron/import-products"` and `"schedule": "0 6 * * *"`. If absent, add the `crons` array per `vercel.json`'s existing structure. (At plan time it is present — this is a verification step.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all server tests green (deals, deals-store, notifier, watchlist, cron, import, auth).

- [ ] **Step 4: Run lint and format check**

Run: `npm run lint && npm run fmt:check`
Expected: PASS (no lint errors; formatting clean). If `fmt:check` fails, run `npm run fmt` and re-commit.

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: (Operational) Restore the daily feed — run a real import locally**

With a populated `.env`, run: `npm run import:products`
Expected: logs a recent `colruyt-products/2026-...` filename and an imported count (~15,200). This confirms the feed/import works end-to-end; the stale snapshot at design time was operational, not a code defect.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document CRON_SECRET and Telegram env vars"
```

---

## Self-review against the spec

- **Watchlist (add/remove/list, shared):** Task 6 (route), Task 9 (client API), Tasks 11–12 (UI). ✅
- **Detect onset + improvement, emit nothing otherwise:** Task 3 `detectDeals` full transition matrix. ✅
- **`DealEvent` shape:** Task 3 (plus the documented `imageUrl` addition). ✅
- **Notifier interface + Telegram impl (env, per-event, image):** Task 4. ✅
- **Daily cron orchestration (import → detect → notify), import-failure aborts:** Task 7. ✅
- **Idempotency via `deal_state`; notify-failure does not advance state:** Tasks 5 + 7 (cron test asserts both). ✅
- **Schema: add `quantity_price_quantity`, new `deal_state`, `watchlist_items` replaces `grocery_lists`:** Task 1 (with migration for existing DBs). ✅
- **Import maps the new column:** Task 2. ✅
- **UI: Login unchanged; Products deal badge + add-to-watchlist; Watchlist replaces Home:** Tasks 10–13. ✅
- **Testing: detectDeals unit matrix (no mocks), notifier vs fake, import tests adjusted:** Tasks 3, 4, 7, 2. ✅
- **Migration: drop grocery_lists, restore cron schedule:** Tasks 1, 14. ✅

Out-of-scope items (folder promos, threshold discovery, per-user lists, price history, deal-ending reminders) are intentionally not implemented.
