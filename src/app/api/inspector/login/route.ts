import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createInspectorToken,
  INSPECTOR_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST /api/inspector/login — email + password → inspector session cookie. */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "inspector-login", 10, 60_000);
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

  const inspector = await prisma.inspector.findUnique({ where: { email } });
  if (!inspector || !inspector.active || !verifyPassword(password, inspector.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (inspector.approvalStatus === "pending") {
    return NextResponse.json(
      { error: "Your application is still under review. We'll email you once approved." },
      { status: 403 },
    );
  }
  if (inspector.approvalStatus === "suspended") {
    return NextResponse.json(
      { error: "Your account is suspended. Contact The Wheeler Dealers team." },
      { status: 403 },
    );
  }

  const res = NextResponse.json({
    inspector: { id: inspector.id, name: inspector.name, email: inspector.email },
  });
  res.cookies.set(
    INSPECTOR_COOKIE,
    createInspectorToken(inspector.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
