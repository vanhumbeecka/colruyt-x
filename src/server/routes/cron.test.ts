import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import cronRouter from "./cron.js";

const TEST_CRON_SECRET = "test-cron-secret-that-is-long-enough";

vi.mock("../import-products.js", () => ({
  getLatestFileName: vi.fn().mockResolvedValue("colruyt-products/2026-01-15"),
  downloadProducts: vi.fn().mockResolvedValue([
    { productId: "1", name: "Milk" },
    { productId: "2", name: "Bread" },
  ]),
  importProducts: vi.fn().mockResolvedValue(undefined),
}));

function createApp() {
  process.env.CRON_SECRET = TEST_CRON_SECRET;
  const app = express();
  app.use("/api/cron", cronRouter);
  return app;
}

describe("cron routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  describe("GET /api/cron/import-products", () => {
    it("rejects requests without authorization", async () => {
      const res = await request(app).get("/api/cron/import-products");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("rejects requests with wrong secret", async () => {
      const res = await request(app)
        .get("/api/cron/import-products")
        .set("Authorization", "Bearer wrong-secret");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("accepts requests with correct CRON_SECRET", async () => {
      const res = await request(app)
        .get("/api/cron/import-products")
        .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it("returns 500 on import failure", async () => {
      const { getLatestFileName } = await import("../import-products.js");
      vi.mocked(getLatestFileName).mockRejectedValueOnce(new Error("GCS down"));

      const res = await request(app)
        .get("/api/cron/import-products")
        .set("Authorization", `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe("GCS down");
    });
  });
});
