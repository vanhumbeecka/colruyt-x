import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS products (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      long_name        TEXT,
      short_name       TEXT,
      brand            TEXT,
      content          TEXT,
      thumbnail_url    TEXT,
      square_image_url TEXT,
      full_image_url   TEXT,
      price            REAL,
      unit_price       REAL,
      measurement_unit TEXT,
      quantity_price   REAL,
      quantity_price_quantity REAL,
      category_id      TEXT,
      category_name    TEXT,
      country_of_origin TEXT,
      is_bio           INTEGER DEFAULT 0,
      is_promo         INTEGER DEFAULT 0,
      is_available     INTEGER DEFAULT 1,
      last_updated     TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      product_id TEXT PRIMARY KEY,
      added_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deal_state (
      product_id  TEXT PRIMARY KEY,
      on_deal     INTEGER NOT NULL DEFAULT 0,
      quantity    REAL,
      unit_price  REAL,
      notified_at TEXT
    );

    DROP TABLE IF EXISTS grocery_lists;

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_long_name ON products(long_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_name);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
  `);

  // Existing prod DBs created before quantity_price_quantity: CREATE IF NOT EXISTS is a
  // no-op, so add the column if the live table is missing it.
  const cols = await db.execute("PRAGMA table_info(products)");
  const hasQpq = cols.rows.some((r) => r.name === "quantity_price_quantity");
  if (!hasQpq) {
    await db.execute("ALTER TABLE products ADD COLUMN quantity_price_quantity REAL");
  }
}

export default db;
