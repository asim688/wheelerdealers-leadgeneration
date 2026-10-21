import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /api/admin/inspectors — roster with active jobs count (admin only). */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const inspectors = await prisma.inspector.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      approvalStatus: true,
      contactPerson: true,
      tradeLicense: true,
      areas: true,
      services: true,
      createdAt: true,
      _count: { select: { jobs: true } },
    },
  });
  return NextResponse.json({
    inspectors: inspectors.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      phone: i.phone,
      active: i.active,
      approvalStatus: i.approvalStatus,
      contactPerson: i.contactPerson,
      tradeLicense: i.tradeLicense,
      areas: i.areas,
      services: i.services,
      jobCount: i._count.jobs,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

/** POST /api/admin/inspectors — create an inspector (admin only). */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: { name?: string; email?: string; password?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const phone = (body.phone ?? "").trim() || null;

  if (!name || !EMAIL_RE.test(email) || password.length < 6) {
    return NextResponse.json(
      { error: "Name, a valid email and a password (6+ chars) are required." },
      { status: 400 },
    );
  }

  const exists = await prisma.inspector.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    return NextResponse.json({ error: "An inspector with that email already exists." }, { status: 409 });
  }

  const inspector = await prisma.inspector.create({
    data: { name, email, phone, passwordHash: hashPassword(password), active: true, approvalStatus: "approved" },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });
  return NextResponse.json({ ok: true, inspector });
}
