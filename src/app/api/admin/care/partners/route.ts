import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { partnerEmirates, partnerServices } from "@/lib/care";

export const runtime = "nodejs";

/**
 * GET /api/admin/care/partners — partner accounts registered as "Care" (towing & roadside).
 * They are created through partner sign-up (or Admin → User Management) and approved in
 * Manage Companies like any partner; this list adds their Care services and activity.
 */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rows = await prisma.inspectionCompany.findMany({
    where: { partnerType: "care" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { careBids: true, careAssigned: true } } },
  });
  return NextResponse.json({
    partners: rows.map((p) => ({
      id: p.id,
      name: p.name,
      contactName: p.pocName,
      email: p.email,
      phone: p.pocMobile || p.phone,
      services: partnerServices(p),
      emirates: partnerEmirates(p),
      active: p.active,
      approvalStatus: p.approvalStatus,
      bids: p._count.careBids,
      jobs: p._count.careAssigned,
      createdAt: p.createdAt,
    })),
  });
}
