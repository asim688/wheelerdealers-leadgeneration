import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getReviewer, reviewerScope } from "@/lib/review";

export const runtime = "nodejs";

/** Review queues shown to an Account Manager. */
const QUEUES: Record<string, Prisma.InspectionJobWhereInput> = {
  awaiting: { status: "report_submitted" },
  returned: { status: "in_progress", report: { returnedAt: { not: null } } },
  verified: { status: "completed" },
  active: { status: { in: ["accepted", "assigned", "in_progress"] }, NOT: { report: { returnedAt: { not: null } } } },
};

/**
 * GET /api/manager/jobs?queue=awaiting|returned|verified|active|all&q=
 * Jobs of the inspection companies assigned to the signed-in Account Manager
 * (the super admin sees all), plus a count per queue.
 */
export async function GET(req: NextRequest) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = reviewerScope(reviewer);
  const queue = req.nextUrl.searchParams.get("queue") || "awaiting";
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const and: Prisma.InspectionJobWhereInput[] = [scope];
  if (QUEUES[queue]) and.push(QUEUES[queue]);
  if (q) {
    and.push({
      OR: [
        { jobCode: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { make: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
        { vin: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const [rows, ...counts] = await Promise.all([
    prisma.inspectionJob.findMany({
      where: { AND: and },
      orderBy: [{ reportSubmittedAt: "desc" }, { scheduledAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        inspector: { select: { name: true, company: { select: { name: true } } } },
        acceptedByCompany: { select: { name: true } },
        report: { select: { verifiedAt: true, verifiedByName: true, returnedAt: true, returnNote: true } },
      },
    }),
    ...Object.values(QUEUES).map((w) => prisma.inspectionJob.count({ where: { AND: [scope, w] } })),
    prisma.inspectionJob.count({ where: scope }),
  ]);
  const keys = Object.keys(QUEUES);
  const countMap: Record<string, number> = Object.fromEntries(keys.map((k, i) => [k, counts[i]]));
  countMap.all = counts[keys.length];

  return NextResponse.json({
    counts: countMap,
    jobs: rows.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      status: j.status,
      vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
      location: [j.city, j.emirate].filter(Boolean).join(", "),
      customerName: j.customerName,
      company: j.acceptedByCompany?.name ?? j.inspector?.company?.name ?? null,
      inspector: j.inspector?.name ?? null,
      scheduledAt: j.scheduledAt?.toISOString() ?? null,
      scheduledSlot: j.scheduledSlot,
      reportSubmittedAt: j.reportSubmittedAt?.toISOString() ?? null,
      verifiedAt: j.report?.verifiedAt?.toISOString() ?? null,
      verifiedByName: j.report?.verifiedByName ?? null,
      returnedAt: j.report?.returnedAt?.toISOString() ?? null,
      returnNote: j.report?.returnNote ?? null,
      reportToken: j.status === "completed" ? j.reportToken : null,
    })),
  });
}
