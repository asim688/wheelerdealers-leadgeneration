import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, isAdmin } from "@/lib/auth";
import { normaliseUaeMobile } from "@/lib/contactValidation";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/managers/[id] — { active?, name?, phone?, password?, companyIds? }.
 * `companyIds` replaces the manager's assigned companies (a company has one
 * manager, so assigning moves it from any previous manager).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.accountManager.findUnique({ where: { id }, select: { id: true, phone: true } });
  if (!existing) return NextResponse.json({ error: "Account manager not found." }, { status: 404 });

  let body: { active?: unknown; name?: unknown; phone?: unknown; password?: unknown; companyIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body.phone === "string") {
    const phone = normaliseUaeMobile(body.phone);
    if (!phone) return NextResponse.json({ error: "Enter a valid UAE mobile number." }, { status: 400 });
    if (phone !== existing.phone) {
      data.phone = phone;
      data.phoneVerifiedAt = null; // re-verified at next sign-in
    }
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    data.passwordHash = hashPassword(body.password);
  }

  const ops = [];
  if (Object.keys(data).length) ops.push(prisma.accountManager.update({ where: { id }, data }));
  if (Array.isArray(body.companyIds)) {
    const ids = body.companyIds.filter((x): x is string => typeof x === "string").slice(0, 200);
    ops.push(
      prisma.inspectionCompany.updateMany({ where: { accountManagerId: id, id: { notIn: ids } }, data: { accountManagerId: null } }),
      prisma.inspectionCompany.updateMany({ where: { id: { in: ids } }, data: { accountManagerId: id } }),
    );
  }
  if (!ops.length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true });
}
