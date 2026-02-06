import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import productsRouter from "./routes/products.js";
import groceryListsRouter from "./routes/grocery-lists.js";

const app = express();
const API_KEY = process.env.API_KEY;

if (!API_KEY || API_KEY === "changeme") {
  console.warn("WARNING: Set a real API_KEY in .env before deploying");
}

let dbInitialized = false;
app.use(async (_req, _res, next) => {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
  next();
});

app.use(cors());
app.use(express.json());

app.use("/api", (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.use("/api/products", productsRouter);
app.use("/api/grocery-lists", groceryListsRouter);

export default app;
