import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, hashPassword } from "@/lib/auth";
import { normaliseEmail, normaliseUaeMobile } from "@/lib/contactValidation";
import { sendInspectorAddedEmail } from "@/lib/companyCompliance";

export const runtime = "nodejs";

async function requireApprovedCompany(req: NextRequest) {
  const companyId = getCompanyId(req);
  if (!companyId) return null;
  const company = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, active: true, approvalStatus: true },
  });
  if (!company || !company.active || company.approvalStatus !== "approved") return null;
  return company;
}

/** GET /api/company/inspectors — the company's own inspector accounts. */
export async function GET(req: NextRequest) {
  const company = await requireApprovedCompany(req);
  if (!company) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await prisma.inspector.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      createdAt: true,
      _count: { select: { jobs: true } },
    },
  });

  return NextResponse.json({
    inspectors: rows.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      phone: i.phone,
      active: i.active,
      verified: !!(i.emailVerifiedAt && i.phoneVerifiedAt),
      jobCount: i._count.jobs,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

/** POST /api/company/inspectors — company creates an inspector login (parent → child). */
export async function POST(req: NextRequest) {
  const company = await requireApprovedCompany(req);
  if (!company) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { name?: string; email?: string; phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, 120);
  const email = normaliseEmail(body.email);
  const phone = normaliseUaeMobile(body.phone);
  const password = body.password ?? "";

  if (!name || !email) {
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json(
      { error: "A UAE mobile number is required (e.g. 05X XXX XXXX) — the inspector verifies it at first sign-in." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const existing = await prisma.inspector.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An inspector with this email already exists." },
      { status: 409 },
    );
  }

  const inspector = await prisma.inspector.create({
    data: {
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      companyId: company.id,
      approvalStatus: "approved", // approval lives at the company level
      // emailVerifiedAt / phoneVerifiedAt stay empty: the inspector verifies at first sign-in.
    },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });

  await sendInspectorAddedEmail({ name: inspector.name, email: inspector.email, companyName: company.name });

  return NextResponse.json({ ok: true, inspector: { ...inspector, verified: false } });
}
