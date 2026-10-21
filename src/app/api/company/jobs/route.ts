import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export const runtime = "nodejs";

const ACTIVE_STATUSES = ["accepted", "assigned", "in_progress"];
const DONE_STATUSES = ["report_submitted", "completed"];

/**
 * GET /api/company/jobs?filter=all|open|today|completed
 * ---------------------------------------------------------------------------
 * The company's accepted jobs with assignment state + earnings stats.
 */
export async function GET(req: NextRequest) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const base = { acceptedByCompanyId: companyId };
  const where =
    filter === "open"
      ? { ...base, status: { in: ACTIVE_STATUSES } }
      : filter === "today"
        ? { ...base, status: { in: ACTIVE_STATUSES }, scheduledAt: { gte: startOfDay, lt: endOfDay } }
        : filter === "completed"
          ? { ...base, status: { in: DONE_STATUSES } }
          : base;

  const [rows, open, today, completed, earnedAgg, pendingAgg] = await Promise.all([
    prisma.inspectionJob.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { inspector: { select: { id: true, name: true } } },
    }),
    prisma.inspectionJob.count({ where: { ...base, status: { in: ACTIVE_STATUSES } } }),
    prisma.inspectionJob.count({
      where: { ...base, status: { in: ACTIVE_STATUSES }, scheduledAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.inspectionJob.count({ where: { ...base, status: { in: DONE_STATUSES } } }),
    prisma.inspectionJob.aggregate({
      where: { ...base, status: "completed" },
      _sum: { partnerPayout: true },
    }),
    prisma.inspectionJob.aggregate({
      where: { ...base, status: { in: [...ACTIVE_STATUSES, "report_submitted"] } },
      _sum: { partnerPayout: true },
    }),
  ]);

  return NextResponse.json({
    stats: {
      open,
      today,
      completed,
      earned: earnedAgg._sum.partnerPayout ?? 0,
      pendingEarnings: pendingAgg._sum.partnerPayout ?? 0,
    },
    jobs: rows.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      status: j.status,
      vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
      location: [j.city, j.emirate].filter(Boolean).join(", ") || "UAE",
      customerName: j.customerName,
      customerMobile: j.customerMobile,
      address: j.address,
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledSlot: j.scheduledSlot,
      inspector: j.inspector ? { id: j.inspector.id, name: j.inspector.name } : null,
      payout: j.partnerPayout,
      currency: j.currency,
      completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
