import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await db.execute("SELECT * FROM grocery_lists ORDER BY updated_at DESC");
  res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM grocery_lists WHERE id = ?", args: [req.params.id] });
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Grocery list not found" });
    return;
  }
  res.json(result.rows[0]);
});

router.post("/", async (req, res) => {
  const { name, items, notes } = req.body;
  if (!name || !items) {
    res.status(400).json({ error: "name and items are required" });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const itemsJson = typeof items === "string" ? items : JSON.stringify(items);

  await db.execute({
    sql: "INSERT INTO grocery_lists (id, name, created_at, updated_at, items, notes) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, name, now, now, itemsJson, notes || null],
  });

  const result = await db.execute({ sql: "SELECT * FROM grocery_lists WHERE id = ?", args: [id] });
  res.status(201).json(result.rows[0]);
});

router.put("/:id", async (req, res) => {
  const existing = await db.execute({ sql: "SELECT * FROM grocery_lists WHERE id = ?", args: [req.params.id] });
  if (existing.rows.length === 0) {
    res.status(404).json({ error: "Grocery list not found" });
    return;
  }

  const row = existing.rows[0];
  const { name, items, notes } = req.body;
  const now = new Date().toISOString();
  const itemsJson = items ? (typeof items === "string" ? items : JSON.stringify(items)) : row.items;

  await db.execute({
    sql: "UPDATE grocery_lists SET name = ?, updated_at = ?, items = ?, notes = ? WHERE id = ?",
    args: [
      name || row.name,
      now,
      itemsJson,
      notes !== undefined ? notes : row.notes,
      req.params.id,
    ],
  });

  const result = await db.execute({ sql: "SELECT * FROM grocery_lists WHERE id = ?", args: [req.params.id] });
  res.json(result.rows[0]);
});

router.delete("/:id", async (req, res) => {
  const result = await db.execute({ sql: "DELETE FROM grocery_lists WHERE id = ?", args: [req.params.id] });
  if (result.rowsAffected === 0) {
    res.status(404).json({ error: "Grocery list not found" });
    return;
  }
  res.status(204).send();
});

export default router;
