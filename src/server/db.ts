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
      category_id      TEXT,
      category_name    TEXT,
      country_of_origin TEXT,
      is_bio           INTEGER DEFAULT 0,
      is_promo         INTEGER DEFAULT 0,
      is_available     INTEGER DEFAULT 1,
      last_updated     TEXT
    );

    CREATE TABLE IF NOT EXISTS grocery_lists (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      items      TEXT NOT NULL,
      notes      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_long_name ON products(long_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_name);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
  `);
}

export default db;
