import { Router } from "express";
import type { Client } from "@libsql/client";

export default function listRouter(db: Client) {
  const router = Router();

  async function getOrCreateList() {
    const result = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    if (result.rows.length > 0) return result.rows[0];

    const now = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO grocery_lists (id, name, created_at, updated_at, items, notes) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["default", "Grocery List", now, now, "[]", null],
    });
    const created = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    return created.rows[0];
  }

  router.get("/", async (_req, res) => {
    const list = await getOrCreateList();
    res.json(list);
  });

  router.put("/", async (req, res) => {
    await getOrCreateList();
    const { items, notes } = req.body;
    const now = new Date().toISOString();

    const current = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    const row = current.rows[0];

    const itemsJson = items
      ? typeof items === "string"
        ? items
        : JSON.stringify(items)
      : row.items;

    await db.execute({
      sql: "UPDATE grocery_lists SET updated_at = ?, items = ?, notes = ? WHERE id = ?",
      args: [now, itemsJson, notes !== undefined ? notes : row.notes, "default"],
    });

    const result = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    res.json(result.rows[0]);
  });

  router.post("/clear-checked", async (_req, res) => {
    await getOrCreateList();
    const current = await db.execute({
      sql: "SELECT items FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    const items = JSON.parse(current.rows[0].items as string);
    const unchecked = items.filter((i: { checked: boolean }) => !i.checked);
    const now = new Date().toISOString();

    await db.execute({
      sql: "UPDATE grocery_lists SET updated_at = ?, items = ? WHERE id = ?",
      args: [now, JSON.stringify(unchecked), "default"],
    });

    const result = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    res.json(result.rows[0]);
  });

  router.post("/reset", async (_req, res) => {
    await getOrCreateList();
    const now = new Date().toISOString();

    await db.execute({
      sql: "UPDATE grocery_lists SET updated_at = ?, items = ?, notes = ? WHERE id = ?",
      args: [now, "[]", null, "default"],
    });

    const result = await db.execute({
      sql: "SELECT * FROM grocery_lists WHERE id = ?",
      args: ["default"],
    });
    res.json(result.rows[0]);
  });

  return router;
}
