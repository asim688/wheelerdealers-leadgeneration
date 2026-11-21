import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, type RateLimitResult } from "@/lib/rateLimit";

/**
 * Database-backed fixed-window counter, shared by every serverless instance
 * (the in-memory limiter in rateLimit.ts only sees its own instance).
 * Fails open on database errors so a DB hiccup never locks everyone out.
 */
export async function sharedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const resetAt = new Date(Date.now() + windowMs);
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;
    if (Math.random() < 0.02) void prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(() => undefined);
    const row = rows[0];
    if (!row || row.count <= limit) return { ok: true, remaining: row ? limit - row.count : limit, retryAfter: 0 };
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - Date.now()) / 1000)) };
  } catch (err) {
    console.error("sharedRateLimit failed (allowing request):", err);
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

const WINDOW_MS = 15 * 60_000;

/**
 * Password-login guard: at most 30 attempts per IP and 10 per account email in
 * 15 minutes, across all instances. Stops parallel password guessing.
 */
export async function loginGuard(req: NextRequest, name: string, email: string): Promise<RateLimitResult> {
  const ip = await sharedRateLimit(`login-ip:${name}:${clientIp(req)}`, 30, WINDOW_MS);
  if (!ip.ok) return ip;
  if (!email) return ip;
  return sharedRateLimit(`login-acct:${email}`, 10, WINDOW_MS);
}
