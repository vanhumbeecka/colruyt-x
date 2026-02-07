import { Router } from "express";
import { createToken, verifyToken, getTokenFromRequest } from "../auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { pin } = req.body;
  if (pin !== process.env.APP_PIN) {
    res.status(401).json({ ok: false, error: "Wrong PIN" });
    return;
  }
  const token = createToken();
  res.cookie("session", token, {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  res.json({ ok: true, token });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

router.get("/check", (req, res) => {
  const token = getTokenFromRequest(req);
  res.json({ authenticated: !!token && verifyToken(token) });
});

export default router;
