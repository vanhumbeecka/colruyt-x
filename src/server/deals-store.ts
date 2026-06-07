import type { Client } from "@libsql/client";
import { computeDeal, type WatchedProduct, type DealState } from "./deals.js";

export async function loadWatchedProducts(db: Client): Promise<WatchedProduct[]> {
  const result = await db.execute(`
    SELECT p.id, p.name, p.long_name, p.price,
           p.quantity_price, p.quantity_price_quantity, p.full_image_url
    FROM watchlist_items w
    JOIN products p ON p.id = w.product_id
  `);
  return result.rows.map((r) => ({
    productId: r.id as string,
    name: (r.long_name as string) || (r.name as string),
    price: r.price as number | null,
    quantityPrice: r.quantity_price as number | null,
    quantityPriceQuantity: r.quantity_price_quantity as number | null,
    imageUrl: r.full_image_url as string | null,
  }));
}

export async function loadDealStates(db: Client): Promise<Map<string, DealState>> {
  const result = await db.execute("SELECT * FROM deal_state");
  const map = new Map<string, DealState>();
  for (const r of result.rows) {
    map.set(r.product_id as string, {
      productId: r.product_id as string,
      onDeal: (r.on_deal as number) === 1,
      quantity: r.quantity as number | null,
      unitPrice: r.unit_price as number | null,
    });
  }
  return map;
}

export async function saveDealStates(
  db: Client,
  watched: WatchedProduct[],
  now: string,
): Promise<void> {
  if (watched.length === 0) return;
  const statements = watched.map((p) => {
    const deal = computeDeal(p);
    return {
      sql: `
        INSERT INTO deal_state (product_id, on_deal, quantity, unit_price, notified_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(product_id) DO UPDATE SET
          on_deal=excluded.on_deal, quantity=excluded.quantity,
          unit_price=excluded.unit_price, notified_at=excluded.notified_at
      `,
      args: [
        p.productId,
        deal.onDeal ? 1 : 0,
        deal.quantity,
        deal.unitPrice,
        deal.onDeal ? now : null,
      ],
    };
  });
  await db.batch(statements, "write");
}
