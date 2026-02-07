import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createClient } from "@libsql/client";
import authRouter from "./auth.js";
import listRouter from "./list.js";
import { verifyToken, getTokenFromRequest } from "../auth.js";

const TEST_PIN = "1234";

async function createApp() {
  process.env.APP_PIN = TEST_PIN;

  const db = createClient({ url: ":memory:" });
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS grocery_lists (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      items      TEXT NOT NULL,
      notes      TEXT
    );
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
  app.use("/api/list", listRouter(db));
  return { app, db };
}

async function loginAndGetToken(app: express.Express): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });
  return res.body.token;
}

describe("list routes", () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    const created = await createApp();
    app = created.app;
    token = await loginAndGetToken(app);
  });

  describe("GET /api/list", () => {
    it("auto-creates list on first GET", async () => {
      const res = await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("default");
      expect(JSON.parse(res.body.items)).toEqual([]);
    });

    it("returns existing list on subsequent GET", async () => {
      // First GET creates it
      await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);

      // Add an item via PUT
      await request(app)
        .put("/api/list")
        .set("Authorization", `Bearer ${token}`)
        .send({ items: [{ name: "Milk", amount: "1", unit: "L", checked: false }] });

      // Second GET returns the updated list
      const res = await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const items = JSON.parse(res.body.items);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("Milk");
    });
  });

  describe("PUT /api/list", () => {
    it("updates items", async () => {
      // Auto-create first
      await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);

      const items = [
        { name: "Bread", amount: "1", unit: "", checked: false },
        { name: "Cheese", amount: "200", unit: "g", checked: true },
      ];
      const res = await request(app)
        .put("/api/list")
        .set("Authorization", `Bearer ${token}`)
        .send({ items });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body.items)).toEqual(items);
    });

    it("updates notes", async () => {
      await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .put("/api/list")
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Don't forget coupons" });
      expect(res.status).toBe(200);
      expect(res.body.notes).toBe("Don't forget coupons");
    });
  });

  describe("POST /api/list/clear-checked", () => {
    it("removes checked items", async () => {
      await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);

      const items = [
        { name: "Bread", amount: "1", unit: "", checked: false },
        { name: "Cheese", amount: "200", unit: "g", checked: true },
        { name: "Milk", amount: "1", unit: "L", checked: true },
      ];
      await request(app).put("/api/list").set("Authorization", `Bearer ${token}`).send({ items });

      const res = await request(app)
        .post("/api/list/clear-checked")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const remaining = JSON.parse(res.body.items);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe("Bread");
    });
  });

  describe("POST /api/list/reset", () => {
    it("clears all items and notes", async () => {
      await request(app).get("/api/list").set("Authorization", `Bearer ${token}`);

      await request(app)
        .put("/api/list")
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [{ name: "Bread", amount: "1", unit: "", checked: false }],
          notes: "Some notes",
        });

      const res = await request(app)
        .post("/api/list/reset")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body.items)).toEqual([]);
      expect(res.body.notes).toBeNull();
    });
  });
});
