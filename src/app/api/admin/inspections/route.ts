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
 * screen, plus per-status counts and the company list for the filter.
 * Each job carries the company it belongs to: the company that accepted it,
 * or — for jobs assigned to an inspector directly — that inspector's company.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const companyId = sp.get("companyId") || "";
  const managerId = sp.get("managerId") || "";
  const q = (sp.get("q") || "").trim();
  const dateFrom = sp.get("dateFrom") || "";
  const dateTo = sp.get("dateTo") || "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));

  const where: Prisma.InspectionJobWhereInput = {};
  const and: Prisma.InspectionJobWhereInput[] = [];
  // `status` may be a comma-separated list (e.g. the company page's "Assigned" view).
  const wanted = status.split(",").map((x) => x.trim()).filter((x) => STATUSES.includes(x));
  if (wanted.length === 1) where.status = wanted[0];
  else if (wanted.length > 1) where.status = { in: wanted };
  if (companyId === "unassigned") {
    and.push({ acceptedByCompanyId: null, OR: [{ assignedInspectorId: null }, { inspector: { companyId: null } }] });
  } else if (companyId) {
    and.push({ OR: [{ acceptedByCompanyId: companyId }, { acceptedByCompanyId: null, inspector: { companyId } }] });
  }
  if (managerId) {
    and.push({
      OR: [
        { acceptedByCompany: { accountManagerId: managerId } },
        { acceptedByCompanyId: null, inspector: { company: { accountManagerId: managerId } } },
      ],
    });
  }
  if (and.length) where.AND = and;
  if (q) {
    where.OR = [
      { jobCode: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerMobile: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { vin: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  if (dateFrom || dateTo) {
    where.scheduledAt = {};
    if (dateFrom) (where.scheduledAt as Prisma.DateTimeFilter).gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) (where.scheduledAt as Prisma.DateTimeFilter).lte = new Date(`${dateTo}T23:59:59`);
  }

  const [total, rows, grouped, companies, managers] = await Promise.all([
    prisma.inspectionJob.count({ where }),
    prisma.inspectionJob.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        inspector: {
          select: {
            id: true,
            name: true,
            phone: true,
            company: { select: { id: true, name: true, accountManager: { select: { id: true, name: true } } } },
          },
        },
        acceptedByCompany: { select: { id: true, name: true, accountManager: { select: { id: true, name: true } } } },
        report: { select: { verifiedAt: true, verifiedByName: true, returnedAt: true, returnNote: true, sentAt: true } },
      },
    }),
    prisma.inspectionJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inspectionCompany.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.accountManager.findMany({
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
    company: (() => {
      const c = j.acceptedByCompany ?? j.inspector?.company ?? null;
      return c ? { id: c.id, name: c.name } : null;
    })(),
    accountManager: (j.acceptedByCompany ?? j.inspector?.company)?.accountManager ?? null,
    inspectorPhone: j.inspector?.phone ?? null,
    vin: j.vin,
    address: [j.address, j.city, j.emirate].filter(Boolean).join(", "),
    acceptedAt: j.acceptedAt ? j.acceptedAt.toISOString() : null,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    reportSubmittedAt: j.reportSubmittedAt ? j.reportSubmittedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    review: j.report
      ? {
          verifiedAt: j.report.verifiedAt ? j.report.verifiedAt.toISOString() : null,
          verifiedByName: j.report.verifiedByName,
          returnedAt: j.report.returnedAt ? j.report.returnedAt.toISOString() : null,
          returnNote: j.report.returnNote,
          sentAt: j.report.sentAt ? j.report.sentAt.toISOString() : null,
        }
      : null,
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
    companies,
    managers,
  });
}
