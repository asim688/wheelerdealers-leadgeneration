import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";

export const runtime = "nodejs";

const STATUSES = ["placed", "confirmed", "out_for_delivery", "completed", "cancelled"];

/** PATCH /api/admin/care/orders/[id] { status?, note? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  const data: Record<string, unknown> = {};
  if (b.status) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    data.status = b.status;
  }
  if (b.note !== undefined) data.adminNote = b.note.trim().slice(0, 1000) || null;
  const done = await prisma.careOrder.updateMany({ where: { id }, data });
  if (!done.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
