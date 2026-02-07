import { Router } from "express";
import { getLatestFileName, downloadProducts, importProducts } from "../import-products.js";

const router = Router();

router.get("/import-products", async (req, res) => {
  console.log("[cron/import-products] Started");

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!cronSecret || token !== cronSecret) {
    console.error("[cron/import-products] Unauthorized: invalid or missing CRON_SECRET");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    console.log("[cron/import-products] Fetching latest file name from GCS...");
    const fileName = await getLatestFileName();
    console.log(`[cron/import-products] Found file: ${fileName}`);

    console.log("[cron/import-products] Downloading products...");
    const products = await downloadProducts(fileName);
    console.log(`[cron/import-products] Downloaded ${products.length} products`);

    console.log("[cron/import-products] Importing into database...");
    await importProducts(products);

    console.log(`[cron/import-products] Done — imported ${products.length} products`);
    res.json({ ok: true, count: products.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[cron/import-products] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
