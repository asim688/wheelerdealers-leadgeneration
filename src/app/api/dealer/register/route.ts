import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Limit registration attempts per IP.
  const rl = rateLimitRequest(req, "dealer-register", 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!name || !EMAIL_RE.test(email) || password.length < 8) {
    return NextResponse.json(
      { error: "Provide a name, a valid email, and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  const existing = await prisma.dealer.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const dealer = await prisma.dealer.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });

  const res = NextResponse.json({
    dealer: {
      id: dealer.id,
      name: dealer.name,
      email: dealer.email,
      approved: dealer.approved,
    },
  });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(dealer.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
