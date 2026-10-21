import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getAdminPassword,
  getAdminEmail,
  createAdminToken,
  ADMIN_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Constant-time string comparison (avoids leaking length/timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  // Limit admin login attempts to deter brute-force.
  const rl = rateLimitRequest(req, "admin-login", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { email?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Accept `email` (preferred); fall back to `username` for backward-compat.
  const email = (body.email ?? body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  // Email is optional for backward-compat: if omitted, only the password is
  // checked. When provided it must match the configured admin email.
  const emailOk = email === "" || safeEqual(email, getAdminEmail());
  const passOk = safeEqual(password, getAdminPassword());

  if (!emailOk || !passOk) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    ADMIN_COOKIE,
    createAdminToken(),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
