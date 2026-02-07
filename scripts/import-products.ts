import "dotenv/config";
import { initDb } from "../src/server/db.js";
import {
  getLatestFileName,
  downloadProducts,
  importProducts,
} from "../src/server/import-products.js";
import db from "../src/server/db.js";

async function main() {
  await initDb();

  console.log("Finding latest product file...");
  const fileName = await getLatestFileName();
  console.log(`Latest file: ${fileName}`);

  const products = await downloadProducts(fileName);
  console.log(`Downloaded ${products.length} products`);

  await importProducts(products);

  const result = await db.execute("SELECT COUNT(*) as count FROM products");
  const count = result.rows[0].count as number;
  console.log(`Database now contains ${count} products`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
