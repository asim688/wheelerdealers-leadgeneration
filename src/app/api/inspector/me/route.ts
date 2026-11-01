import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createInspectorToken,
  createPendingInspectorToken,
  getInspectorSession,
  INSPECTOR_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/inspector/me — the signed-in inspector's profile, or 401.
 * Also reports whether email/mobile verification is still required, and
 * re-issues the session cookie when that status changed (verified on another
 * device, or the company changed the inspector's mobile).
 */
export async function GET(req: NextRequest) {
  const session = getInspectorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const inspector = await prisma.inspector.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, phone: true, active: true, emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  if (!inspector || !inspector.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const verified = !!(inspector.emailVerifiedAt && inspector.phoneVerifiedAt);
  const res = NextResponse.json({
    inspector: { id: inspector.id, name: inspector.name, email: inspector.email, phone: inspector.phone, active: inspector.active },
    needsVerification: !verified,
    verification: { email: !!inspector.emailVerifiedAt, phone: !!inspector.phoneVerifiedAt },
  });
  if (verified === session.pending) {
    res.cookies.set(
      INSPECTOR_COOKIE,
      verified ? createInspectorToken(inspector.id) : createPendingInspectorToken(inspector.id),
      sessionCookieOptions(SESSION_MAX_AGE),
    );
  }
  return res;
}
