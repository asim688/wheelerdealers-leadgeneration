import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { parseCarePartnerInput } from "@/lib/care";

export const runtime = "nodejs";

/** PATCH /api/admin/care/partners/[id] { careServices[], careEmirates[] } — change what a Care partner covers. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseCarePartnerInput({ ...b, partnerType: "care" });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const done = await prisma.inspectionCompany.updateMany({
    where: { id, partnerType: "care" },
    data: { careServices: parsed.data.careServices, careEmirates: parsed.data.careEmirates },
  });
  if (!done.count) return NextResponse.json({ error: "Care partner not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
