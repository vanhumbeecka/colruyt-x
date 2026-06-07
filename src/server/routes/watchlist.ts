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
