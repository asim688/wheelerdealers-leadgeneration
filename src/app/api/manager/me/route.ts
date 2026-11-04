import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createManagerToken,
  createPendingManagerToken,
  getManagerSession,
  MANAGER_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/manager/me — profile, verification state and assigned companies. */
export async function GET(req: NextRequest) {
  const session = getManagerSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const m = await prisma.accountManager.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      companies: { orderBy: { name: "asc" }, select: { id: true, name: true, approvalStatus: true, active: true } },
    },
  });
  if (!m || !m.active) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const verified = !!(m.emailVerifiedAt && m.phoneVerifiedAt);
  const res = NextResponse.json({
    manager: { id: m.id, name: m.name, email: m.email, phone: m.phone },
    needsVerification: !verified,
    companies: m.companies,
  });
  if (verified === session.pending) {
    res.cookies.set(
      MANAGER_COOKIE,
      verified ? createManagerToken(m.id) : createPendingManagerToken(m.id),
      sessionCookieOptions(SESSION_MAX_AGE),
    );
  }
  return res;
}
