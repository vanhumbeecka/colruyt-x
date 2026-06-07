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
    await db.execute("INSERT INTO products VALUES ('p1','Appel','Appel',1.89,1.74,3,'f.jpg')");
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
    await db.execute("INSERT INTO products VALUES ('p1','Appel','Appel',1.89,1.74,3,'f.jpg')");
    await db.execute("INSERT INTO watchlist_items VALUES ('p1','2026-06-07')");
    await db.execute("INSERT INTO deal_state VALUES ('p1',1,3,1.80,'2026-06-06T06:00:00.000Z')");

    const watched = await loadWatchedProducts(db);
    await saveDealStates(db, watched, "2026-06-07T06:00:00.000Z");

    const states = await loadDealStates(db);
    expect(states.get("p1")!.unitPrice).toBe(1.74);
  });

  it("is a no-op when there are no watched products", async () => {
    await saveDealStates(db, [], "2026-06-07T06:00:00.000Z");
    const states = await loadDealStates(db);
    expect(states.size).toBe(0);
  });
});
