import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { CARE_SERVICES, displayStatus } from "@/lib/care";

export const runtime = "nodejs";

/** GET /api/admin/care/requests?kind=roadside|towing&status=… — Care queue for WD (newest first) + counts. */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") === "towing" ? "towing" : "roadside";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const [rows, grouped] = await Promise.all([
    prisma.careRequest.findMany({
      where: { kind, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { assignedPartner: { select: { name: true } }, _count: { select: { bids: { where: { status: { in: ["active", "accepted"] } } } } } },
    }),
    prisma.careRequest.groupBy({ by: ["status"], where: { kind }, _count: true }),
  ]);
  return NextResponse.json({
    counts: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
    requests: rows.map((r) => ({
      id: r.id,
      code: r.code,
      service: r.service,
      serviceLabel: CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? r.service,
      status: r.status,
      displayStatus: displayStatus(r.status, r._count.bids),
      customerName: r.customerName,
      customerMobile: r.customerMobile,
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle",
      pickupAddress: r.pickupAddress,
      pickupEmirate: r.pickupEmirate,
      destAddress: r.destAddress,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      bids: r._count.bids,
      partner: r.assignedPartner?.name ?? null,
      priceFils: r.priceFils,
      etaMinutes: r.etaMinutes,
      paymentStatus: r.paymentStatus,
      paidFils: r.paidFils,
      refundStatus: r.refundStatus,
      refundFils: r.refundFils,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
