import type { NextRequest } from "next/server";

/**
 * ----------------------------------------------------------------------------
 * Lightweight in-memory rate limiter (fixed window).
 * ----------------------------------------------------------------------------
 * Protects expensive endpoints (AI calls) and auth endpoints (brute force) from
 * abuse. Good enough for a single instance / small scale.
 *
 * NOTE: This is per-process memory. If you deploy multiple instances or go
 * serverless, switch to a shared store (e.g. Upstash Redis / @upstash/ratelimit)
 * so limits are enforced globally.
 * ----------------------------------------------------------------------------
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically evict expired buckets so the map doesn't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds until the window resets
}

/**
 * Records a hit for `key` and returns whether it is within `limit` per
 * `windowMs`. Use a distinct prefix per endpoint, e.g. `sell:1.2.3.4`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return { ok: true, remaining: limit - existing.count, retryAfter: 0 };
}

/** Convenience: rate-limit a request by IP for a named bucket. */
export function rateLimitRequest(
  req: NextRequest,
  name: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return rateLimit(`${name}:${clientIp(req)}`, limit, windowMs);
}
