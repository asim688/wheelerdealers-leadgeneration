import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Limit login attempts to deter brute-force.
  const rl = rateLimitRequest(req, "dealer-login", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const dealer = await prisma.dealer.findUnique({ where: { email } });

  // Use a generic error to avoid revealing whether the email exists.
  if (!dealer || !verifyPassword(password, dealer.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

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
