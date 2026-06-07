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
