import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, hashPassword } from "@/lib/auth";

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

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const password = body.password ?? "";

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
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
      phone: phone || null,
      passwordHash: hashPassword(password),
      companyId: company.id,
      approvalStatus: "approved", // approval lives at the company level
    },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });

  return NextResponse.json({ ok: true, inspector });
}
