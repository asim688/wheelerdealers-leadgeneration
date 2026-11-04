import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createManagerToken,
  createPendingManagerToken,
  MANAGER_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
  verifyPassword,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST /api/manager/login — Account Manager email + password. Unverified managers get a restricted session. */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "manager-login", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
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
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const m = await prisma.accountManager.findUnique({ where: { email } });
  if (!m || !m.active || !verifyPassword(password, m.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const verified = !!(m.emailVerifiedAt && m.phoneVerifiedAt);
  const res = NextResponse.json({
    manager: { id: m.id, name: m.name, email: m.email, phone: m.phone },
    needsVerification: !verified,
  });
  res.cookies.set(
    MANAGER_COOKIE,
    verified ? createManagerToken(m.id) : createPendingManagerToken(m.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
