import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import authRouter from "./auth.js";
import { createToken, verifyToken, getTokenFromRequest } from "../auth.js";

const TEST_PIN = "1234";

function createApp() {
  process.env.APP_PIN = TEST_PIN;
  const app = express();
  app.use(express.json());
  app.use(cookieParser(TEST_PIN));
  app.use("/api/auth", authRouter);

  // A protected route to test the auth middleware
  app.use("/api", (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token || !verifyToken(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });
  app.get("/api/protected", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("auth", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  describe("POST /api/auth/login", () => {
    it("returns token on correct PIN", async () => {
      const res = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("rejects wrong PIN", async () => {
      const res = await request(app).post("/api/auth/login").send({ pin: "wrong" });
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("GET /api/auth/check", () => {
    it("returns authenticated=true with valid cookie", async () => {
      const loginRes = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });
      const cookies = loginRes.headers["set-cookie"];

      const res = await request(app).get("/api/auth/check").set("Cookie", cookies);
      expect(res.body.authenticated).toBe(true);
    });

    it("returns authenticated=true with valid Bearer token", async () => {
      const loginRes = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });

      const res = await request(app)
        .get("/api/auth/check")
        .set("Authorization", `Bearer ${loginRes.body.token}`);
      expect(res.body.authenticated).toBe(true);
    });

    it("returns authenticated=false with no credentials", async () => {
      const res = await request(app).get("/api/auth/check");
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears cookie", async () => {
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const setCookie = res.headers["set-cookie"]?.[0] ?? "";
      expect(setCookie).toContain("session=;");
    });
  });

  describe("protected routes", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/protected");
      expect(res.status).toBe(401);
    });

    it("accepts Bearer token", async () => {
      const loginRes = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });

      const res = await request(app)
        .get("/api/protected")
        .set("Authorization", `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("accepts cookie auth", async () => {
      const loginRes = await request(app).post("/api/auth/login").send({ pin: TEST_PIN });
      const cookies = loginRes.headers["set-cookie"];

      const res = await request(app).get("/api/protected").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("token functions", () => {
    it("createToken produces a verifiable token", () => {
      process.env.APP_PIN = TEST_PIN;
      const token = createToken();
      expect(verifyToken(token)).toBe(true);
    });

    it("verifyToken rejects tampered tokens", () => {
      process.env.APP_PIN = TEST_PIN;
      const token = createToken();
      expect(verifyToken(token + "x")).toBe(false);
    });

    it("verifyToken rejects garbage", () => {
      expect(verifyToken("not-a-token")).toBe(false);
    });
  });
});
