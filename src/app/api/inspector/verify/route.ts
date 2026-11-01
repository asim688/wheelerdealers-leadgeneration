import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createInspectorToken,
  getInspectorSession,
  INSPECTOR_COOKIE,
  readVerificationProofs,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";
import { normaliseEmail, normaliseUaeMobile, verificationKey } from "@/lib/contactValidation";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/inspector/verify — body { email, phone, proofs }.
 * First-sign-in step: the inspector proves they own the email + UAE mobile
 * (they may correct either one). On success both are marked verified and the
 * restricted session is upgraded to a full one.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "inspector-verify", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  }
  const session = getInspectorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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

  const inspector = await prisma.inspector.findUnique({ where: { id: session.id }, select: { id: true, email: true, active: true } });
  if (!inspector || !inspector.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (email !== inspector.email) {
    const taken = await prisma.inspector.findUnique({ where: { email }, select: { id: true } });
    if (taken) {
      return NextResponse.json({ error: "That email is already used by another inspector account." }, { status: 409 });
    }
  }

  const now = new Date();
  const updated = await prisma.inspector.update({
    where: { id: inspector.id },
    data: { email, phone, emailVerifiedAt: now, phoneVerifiedAt: now },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });

  const res = NextResponse.json({ ok: true, inspector: updated, needsVerification: false });
  res.cookies.set(INSPECTOR_COOKIE, createInspectorToken(updated.id), sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
