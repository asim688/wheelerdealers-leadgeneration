import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/inspector/jobs/available
 * ---------------------------------------------------------------------------
 * The marketplace pool: paid inspection jobs waiting for a company to accept.
 * Only approved, active companies can see it. Customer contact details are
 * withheld until a company accepts the job.
 */
export async function GET(req: NextRequest) {
  const inspectorId = getInspectorId(req);
  if (!inspectorId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const company = await prisma.inspector.findUnique({
    where: { id: inspectorId },
    select: { active: true, approvalStatus: true },
  });
  if (!company || !company.active || company.approvalStatus !== "approved") {
    return NextResponse.json(
      { error: "Your company is not approved to receive jobs yet." },
      { status: 403 },
    );
  }

  const rows = await prisma.inspectionJob.findMany({
    where: { status: "available" },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const jobs = rows.map((j) => ({
    id: j.id,
    jobCode: j.jobCode,
    status: j.status,
    vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
    // Marketplace listing shows area only — full address after acceptance.
    location: [j.city, j.emirate].filter(Boolean).join(", ") || "UAE",
    scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
    scheduledSlot: j.scheduledSlot,
    createdAt: j.createdAt.toISOString(),
  }));

  return NextResponse.json({ jobs });
}
