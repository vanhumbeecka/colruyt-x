import type { InStatement } from "@libsql/client";
import db from "./db.js";

const GCS_BUCKET = "colruyt-products";
const GCS_PREFIX = "colruyt-products/";

interface ColruytPrice {
  basicPrice: number;
  measurementUnit: string;
  measurementUnitPrice: number;
  quantityPrice: number;
}

interface ColruytProduct {
  productId: string;
  name: string;
  LongName: string;
  ShortName: string;
  brand: string;
  content: string;
  thumbNail: string;
  squareImage: string;
  fullImage: string;
  price: ColruytPrice;
  topCategoryId: string;
  topCategoryName: string;
  CountryOfOrigin: string;
  IsBio: boolean;
  inPromo: boolean;
  isAvailable: boolean;
}

export async function getLatestFileName(): Promise<string> {
  const year = new Date().getFullYear();
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o?prefix=${GCS_PREFIX}${year}&maxResults=100`;
  const res = await fetch(listUrl);
  const data = (await res.json()) as { items?: { name: string }[] };

  if (!data.items || data.items.length === 0) {
    throw new Error("No product files found in GCS bucket");
  }

  const names = data.items.map((i) => i.name).sort();
  return names[names.length - 1];
}

export async function downloadProducts(fileName: string): Promise<ColruytProduct[]> {
  const url = `https://storage.googleapis.com/${GCS_BUCKET}/${fileName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  return res.json() as Promise<ColruytProduct[]>;
}

const UPSERT_SQL = `
  INSERT INTO products (
    id, name, long_name, short_name, brand, content,
    thumbnail_url, square_image_url, full_image_url,
    price, unit_price, measurement_unit, quantity_price,
    category_id, category_name, country_of_origin,
    is_bio, is_promo, is_available, last_updated
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, long_name=excluded.long_name,
    short_name=excluded.short_name, brand=excluded.brand,
    content=excluded.content, thumbnail_url=excluded.thumbnail_url,
    square_image_url=excluded.square_image_url, full_image_url=excluded.full_image_url,
    price=excluded.price, unit_price=excluded.unit_price,
    measurement_unit=excluded.measurement_unit, quantity_price=excluded.quantity_price,
    category_id=excluded.category_id, category_name=excluded.category_name,
    country_of_origin=excluded.country_of_origin,
    is_bio=excluded.is_bio, is_promo=excluded.is_promo,
    is_available=excluded.is_available, last_updated=excluded.last_updated
`;

export async function importProducts(products: ColruytProduct[]) {
  const now = new Date().toISOString();

  const statements: InStatement[] = products.map((p) => ({
    sql: UPSERT_SQL,
    args: [
      p.productId,
      p.name,
      p.LongName || null,
      p.ShortName || null,
      p.brand || null,
      p.content || null,
      p.thumbNail || null,
      p.squareImage || null,
      p.fullImage || null,
      p.price?.basicPrice ?? null,
      p.price?.measurementUnitPrice ?? null,
      p.price?.measurementUnit || null,
      p.price?.quantityPrice ?? null,
      p.topCategoryId || null,
      p.topCategoryName || null,
      p.CountryOfOrigin || null,
      p.IsBio ? 1 : 0,
      p.inPromo ? 1 : 0,
      p.isAvailable ? 1 : 0,
      now,
    ],
  }));

  await db.batch(statements, "write");
}
