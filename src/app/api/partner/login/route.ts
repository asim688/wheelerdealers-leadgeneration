import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createCompanyToken,
  createInspectorToken,
  createPendingInspectorToken,
  createManagerToken,
  createPendingManagerToken,
  COMPANY_COOKIE,
  INSPECTOR_COOKIE,
  MANAGER_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/partner/login — one "Manage Inspections" sign-in for every
 * inspection-side account. The email + password decide which portal opens:
 * inspection company → /company, inspector → /inspector, account manager → /manager.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "partner-login", 10, 60_000);
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
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const [company, inspector, manager] = await Promise.all([
    prisma.inspectionCompany.findUnique({ where: { email } }),
    prisma.inspector.findUnique({ where: { email } }),
    prisma.accountManager.findUnique({ where: { email } }),
  ]);

  if (company && company.active && verifyPassword(password, company.passwordHash)) {
    if (company.approvalStatus === "pending") {
      return NextResponse.json(
        { error: "Your application is still under review. We'll contact you once approved." },
        { status: 403 },
      );
    }
    if (company.approvalStatus === "suspended") {
      return NextResponse.json({ error: "Your account is suspended. Contact The Wheeler Dealers team." }, { status: 403 });
    }
    const res = NextResponse.json({ role: "company", redirect: "/company" });
    res.cookies.set(COMPANY_COOKIE, createCompanyToken(company.id), sessionCookieOptions(SESSION_MAX_AGE));
    return res;
  }

  if (manager && manager.active && verifyPassword(password, manager.passwordHash)) {
    const verified = !!(manager.emailVerifiedAt && manager.phoneVerifiedAt);
    const res = NextResponse.json({ role: "manager", redirect: "/manager" });
    res.cookies.set(
      MANAGER_COOKIE,
      verified ? createManagerToken(manager.id) : createPendingManagerToken(manager.id),
      sessionCookieOptions(SESSION_MAX_AGE),
    );
    return res;
  }

  if (inspector && inspector.active && verifyPassword(password, inspector.passwordHash)) {
    if (inspector.approvalStatus === "pending") {
      return NextResponse.json(
        { error: "Your application is still under review. We'll email you once approved." },
        { status: 403 },
      );
    }
    if (inspector.approvalStatus === "suspended") {
      return NextResponse.json({ error: "Your account is suspended. Contact The Wheeler Dealers team." }, { status: 403 });
    }
    const verified = !!(inspector.emailVerifiedAt && inspector.phoneVerifiedAt);
    const res = NextResponse.json({ role: "inspector", redirect: "/inspector" });
    res.cookies.set(
      INSPECTOR_COOKIE,
      verified ? createInspectorToken(inspector.id) : createPendingInspectorToken(inspector.id),
      sessionCookieOptions(SESSION_MAX_AGE),
    );
    return res;
  }

  return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
}
