import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import db, { initDb } from "./db.js";
import { verifyToken, getTokenFromRequest } from "./auth.js";
import authRouter from "./routes/auth.js";
import productsRouter from "./routes/products.js";
import watchlistRouter from "./routes/watchlist.js";
import cronRouter from "./routes/cron.js";
import { TelegramNotifier } from "./notifier.js";

const app = express();

let dbInitialized = false;
app.use(async (_req, _res, next) => {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
  next();
});

app.use(express.json());
app.use(cookieParser(process.env.APP_PIN));

app.use("/api/auth", authRouter);
const notifier = new TelegramNotifier();
app.use("/api/cron", cronRouter(db, notifier));

app.use("/api", (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.use("/api/products", productsRouter);
app.use("/api/watchlist", watchlistRouter(db));

export default app;
