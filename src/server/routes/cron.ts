import { Router } from "express";
import { getLatestFileName, downloadProducts, importProducts } from "../import-products.js";

const router = Router();

router.get("/import-products", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!cronSecret || token !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const fileName = await getLatestFileName();
    const products = await downloadProducts(fileName);
    await importProducts(products);
    res.json({ ok: true, count: products.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
