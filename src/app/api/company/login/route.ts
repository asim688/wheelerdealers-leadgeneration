import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createCompanyToken,
  COMPANY_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST /api/company/login — email + password → company session cookie. */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "company-login", 10, 60_000);
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

  const company = await prisma.inspectionCompany.findUnique({ where: { email } });
  if (!company || !company.active || !verifyPassword(password, company.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (company.approvalStatus === "pending") {
    return NextResponse.json(
      { error: "Your application is still under review. We'll contact you once approved." },
      { status: 403 },
    );
  }
  if (company.approvalStatus === "suspended") {
    return NextResponse.json(
      { error: "Your account is suspended. Contact The Wheeler Dealers team." },
      { status: 403 },
    );
  }

  const res = NextResponse.json({
    company: { id: company.id, name: company.name, email: company.email },
  });
  res.cookies.set(
    COMPANY_COOKIE,
    createCompanyToken(company.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
