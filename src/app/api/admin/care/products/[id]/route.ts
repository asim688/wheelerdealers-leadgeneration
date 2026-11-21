import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { productInput } from "@/lib/careProducts";

export const runtime = "nodejs";

/** PATCH /api/admin/care/products/[id] — edit any field, or { active } / { inStock } toggles. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const parsed = productInput(await req.json().catch(() => null), false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const done = await prisma.careProduct.updateMany({ where: { id }, data: parsed.data });
  if (!done.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/care/products/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  await prisma.careProduct.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
