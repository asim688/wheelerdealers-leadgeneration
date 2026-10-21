import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const STATUSES = [
  "payment_pending",
  "available",
  "accepted",
  "assigned", // legacy admin-assigned (treated like accepted)
  "in_progress",
  "report_submitted",
  "completed",
  "cancelled",
  "open", // legacy pre-marketplace
];

/**
 * GET /api/admin/inspections
 * ---------------------------------------------------------------------------
 * Paginated, filterable list of inspection jobs for the admin Jobs Management
 * screen, plus per-status counts and the inspector roster for assignment.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const inspectorId = sp.get("inspectorId") || "";
  const q = (sp.get("q") || "").trim();
  const dateFrom = sp.get("dateFrom") || "";
  const dateTo = sp.get("dateTo") || "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));

  const where: Prisma.InspectionJobWhereInput = {};
  if (STATUSES.includes(status)) where.status = status;
  if (inspectorId === "unassigned") where.assignedInspectorId = null;
  else if (inspectorId) where.assignedInspectorId = inspectorId;
  if (q) {
    where.OR = [
      { jobCode: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerMobile: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }
  if (dateFrom || dateTo) {
    where.scheduledAt = {};
    if (dateFrom) (where.scheduledAt as Prisma.DateTimeFilter).gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) (where.scheduledAt as Prisma.DateTimeFilter).lte = new Date(`${dateTo}T23:59:59`);
  }

  const [total, rows, grouped, inspectors] = await Promise.all([
    prisma.inspectionJob.count({ where }),
    prisma.inspectionJob.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { inspector: { select: { id: true, name: true } } },
    }),
    prisma.inspectionJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inspector.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Marketplace economics across the whole dataset (not just the page):
  // revenue = customer fees, payouts = partner earnings, commission = margin.
  const [revenueAgg, payoutAgg] = await Promise.all([
    prisma.inspectionJob.aggregate({
      _sum: { fee: true },
      where: { status: "completed" },
    }),
    prisma.inspectionJob.aggregate({
      _sum: { partnerPayout: true },
      where: { status: "completed" },
    }),
  ]);
  const revenue = revenueAgg._sum.fee ?? 0;
  const payouts = payoutAgg._sum.partnerPayout ?? 0;

  const statusCounts: Record<string, number> = { all: 0 };
  for (const s of STATUSES) statusCounts[s] = 0;
  for (const g of grouped) {
    statusCounts[g.status] = g._count._all;
    statusCounts.all += g._count._all;
  }

  const jobs = rows.map((j) => ({
    id: j.id,
    jobCode: j.jobCode,
    status: j.status,
    customerName: j.customerName,
    customerMobile: j.customerMobile,
    customerEmail: j.customerEmail,
    vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
    location: [j.city || j.address, j.emirate].filter(Boolean).join(", "),
    inspector: j.inspector ? { id: j.inspector.id, name: j.inspector.name } : null,
    scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
    scheduledSlot: j.scheduledSlot,
    fee: j.fee,
    currency: j.currency,
    paymentStatus: j.paymentStatus,
    paymentProvider: j.paymentProvider,
    paymentRef: j.paymentRef,
    paidAt: j.paidAt ? j.paidAt.toISOString() : null,
    partnerPayout: j.partnerPayout,
    commission: j.fee != null && j.partnerPayout != null ? j.fee - j.partnerPayout : null,
    reportToken: j.status === "completed" ? j.reportToken : null,
    expiresAt: j.expiresAt ? j.expiresAt.toISOString() : null,
    createdAt: j.createdAt.toISOString(),
  }));

  return NextResponse.json({
    jobs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts,
    revenue,
    payouts,
    commission: revenue - payouts,
    currency: process.env.NEXT_PUBLIC_CURRENCY || "AED",
    inspectors,
  });
}
