import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/inspector/jobs?filter=all|open|today|completed
 * ---------------------------------------------------------------------------
 * The signed-in inspection company's accepted jobs plus dashboard stat counts
 * and earnings totals. ("assigned" is the legacy admin-assigned status and is
 * treated the same as marketplace "accepted".)
 */
const ACTIVE_STATUSES = ["accepted", "assigned", "in_progress"];
const DONE_STATUSES = ["report_submitted", "completed"];

export async function GET(req: NextRequest) {
  const inspectorId = getInspectorId(req);
  if (!inspectorId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const filter = req.nextUrl.searchParams.get("filter") || "all";

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const base = { assignedInspectorId: inspectorId };

  const [openCount, todayCount, completedCount, weekCount, availableCount, earnedAgg, pendingAgg] = await Promise.all([
    prisma.inspectionJob.count({
      where: { ...base, status: { in: ACTIVE_STATUSES } },
    }),
    prisma.inspectionJob.count({
      where: { ...base, scheduledAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.inspectionJob.count({ where: { ...base, status: { in: DONE_STATUSES } } }),
    prisma.inspectionJob.count({
      where: { ...base, status: { in: DONE_STATUSES }, completedAt: { gte: weekAgo } },
    }),
    prisma.inspectionJob.count({ where: { status: "available" } }),
    prisma.inspectionJob.aggregate({
      _sum: { partnerPayout: true },
      where: { ...base, status: "completed" },
    }),
    prisma.inspectionJob.aggregate({
      _sum: { partnerPayout: true },
      where: { ...base, status: { in: [...ACTIVE_STATUSES, "report_submitted"] } },
    }),
  ]);

  const where = { ...base };
  if (filter === "open") Object.assign(where, { status: { in: ACTIVE_STATUSES } });
  else if (filter === "completed") Object.assign(where, { status: { in: DONE_STATUSES } });
  else if (filter === "today")
    Object.assign(where, { scheduledAt: { gte: startOfDay, lt: endOfDay } });

  const rows = await prisma.inspectionJob.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const jobs = rows.map((j) => ({
    id: j.id,
    jobCode: j.jobCode,
    status: j.status,
    vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
    customerName: j.customerName,
    customerMobile: j.customerMobile,
    location: [j.city || j.address, j.emirate].filter(Boolean).join(", "),
    scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
    scheduledSlot: j.scheduledSlot,
    payout: j.partnerPayout,
    currency: j.currency,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
  }));

  return NextResponse.json({
    stats: {
      open: openCount,
      today: todayCount,
      completed: completedCount,
      thisWeek: weekCount,
      available: availableCount,
      earned: earnedAgg._sum.partnerPayout ?? 0,
      pendingEarnings: pendingAgg._sum.partnerPayout ?? 0,
    },
    jobs,
  });
}
