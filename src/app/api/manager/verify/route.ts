import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createManagerToken,
  getManagerSession,
  MANAGER_COOKIE,
  readVerificationProofs,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";
import { normaliseEmail, normaliseUaeMobile, verificationKey } from "@/lib/contactValidation";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST /api/manager/verify — body { email, phone, proofs }. First sign-in email + mobile verification. */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "manager-verify", 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  const session = getManagerSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { email?: string; phone?: string; proofs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = normaliseEmail(body.email);
  const phone = normaliseUaeMobile(body.phone);
  if (!email || !phone) {
    return NextResponse.json({ error: "Enter a valid email and a UAE mobile number." }, { status: 400 });
  }
  const proven = readVerificationProofs(body.proofs);
  const missing: string[] = [];
  if (!proven.has(verificationKey("email", email))) missing.push("email");
  if (!proven.has(verificationKey("sms", phone))) missing.push("mobile");
  if (missing.length) {
    return NextResponse.json({ error: `Please verify your ${missing.join(" and ")} first.` }, { status: 400 });
  }

  const m = await prisma.accountManager.findUnique({ where: { id: session.id }, select: { id: true, email: true, active: true } });
  if (!m || !m.active) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (email !== m.email && (await prisma.accountManager.findUnique({ where: { email }, select: { id: true } }))) {
    return NextResponse.json({ error: "That email is already used by another account manager." }, { status: 409 });
  }
  const now = new Date();
  const updated = await prisma.accountManager.update({
    where: { id: m.id },
    data: { email, phone, emailVerifiedAt: now, phoneVerifiedAt: now },
    select: { id: true, name: true, email: true, phone: true },
  });
  const res = NextResponse.json({ ok: true, manager: updated, needsVerification: false });
  res.cookies.set(MANAGER_COOKIE, createManagerToken(updated.id), sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
