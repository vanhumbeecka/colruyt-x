import { createHmac, randomUUID } from "node:crypto";
import type { Request } from "express";

function getSecret(): string {
  const pin = process.env.APP_PIN;
  if (!pin) throw new Error("APP_PIN environment variable is required");
  return pin;
}

export function createToken(): string {
  const id = randomUUID();
  const hmac = createHmac("sha256", getSecret()).update(id).digest("hex");
  return `${id}:${hmac}`;
}

export function verifyToken(token: string): boolean {
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) return false;
  const id = token.slice(0, colonIndex);
  const mac = token.slice(colonIndex + 1);
  const expected = createHmac("sha256", getSecret()).update(id).digest("hex");
  return mac === expected;
}

export function getTokenFromRequest(req: Request): string | null {
  const cookieToken = req.signedCookies?.session;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}
