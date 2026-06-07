import { Router } from "express";
import type { Client } from "@libsql/client";
import { getLatestFileName, downloadProducts, importProducts } from "../import-products.js";
import { detectDeals } from "../deals.js";
import { loadWatchedProducts, loadDealStates, saveDealStates } from "../deals-store.js";
import type { Notifier } from "../notifier.js";

export default function cronRouter(db: Client, notifier: Notifier) {
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
      // Step 1: import. Aborts the run on failure so detection never sees a stale snapshot.
      const fileName = await getLatestFileName();
      console.log(`[cron/import-products] Found file: ${fileName}`);
      const products = await downloadProducts(fileName);
      console.log(`[cron/import-products] Downloaded ${products.length} products`);
      await importProducts(products);

      // Step 2: detect deals for watched products.
      const watched = await loadWatchedProducts(db);
      const priorStates = await loadDealStates(db);
      const events = detectDeals(watched, priorStates);
      console.log(`[cron/import-products] ${events.length} deal event(s)`);

      // Step 3: notify. On failure we throw before saving state so events retry next run.
      if (events.length > 0) {
        await notifier.notify(events);
      }
      await saveDealStates(db, watched, new Date().toISOString());

      console.log(
        `[cron/import-products] Done — ${products.length} products, ${events.length} events`,
      );
      res.json({ ok: true, count: products.length, events: events.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cron/import-products] Failed: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
