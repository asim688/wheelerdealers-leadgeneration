import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createInspectorToken,
  createPendingInspectorToken,
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

  // Until the inspector has verified their own email + mobile, the session is
  // restricted to the verification step (job APIs reject it).
  const verified = !!(inspector.emailVerifiedAt && inspector.phoneVerifiedAt);
  const res = NextResponse.json({
    inspector: { id: inspector.id, name: inspector.name, email: inspector.email, phone: inspector.phone },
    needsVerification: !verified,
  });
  res.cookies.set(
    INSPECTOR_COOKIE,
    verified ? createInspectorToken(inspector.id) : createPendingInspectorToken(inspector.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
