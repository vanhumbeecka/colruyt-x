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

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/watchlist");
    expect(res.status).toBe(401);
  });

  it("returns ok when deleting a product not on the list (idempotent)", async () => {
    const res = await request(app)
      .delete("/api/watchlist/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
