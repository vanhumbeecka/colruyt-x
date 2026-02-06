import { Router } from "express";
import type { InValue } from "@libsql/client";
import db from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  const q = (req.query.q as string) || "";
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));
  const category = (req.query.category as string) || "";
  const offset = (page - 1) * limit;

  let where = "1=1";
  const params: InValue[] = [];

  if (q) {
    where += " AND (name LIKE ? OR long_name LIKE ? OR brand LIKE ?)";
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }
  if (category) {
    where += " AND category_name = ?";
    params.push(category);
  }

  const countResult = await db.execute({ sql: `SELECT COUNT(*) as total FROM products WHERE ${where}`, args: params });
  const total = countResult.rows[0].total as number;

  const productsResult = await db.execute({
    sql: `SELECT * FROM products WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
    args: [...params, limit, offset],
  });

  res.json({
    products: productsResult.rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get("/categories", async (_req, res) => {
  const result = await db.execute("SELECT DISTINCT category_name FROM products WHERE category_name != '' ORDER BY category_name");
  res.json(result.rows.map((c) => c.category_name));
});

router.get("/:id", async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM products WHERE id = ?", args: [req.params.id] });
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(result.rows[0]);
});

export default router;
