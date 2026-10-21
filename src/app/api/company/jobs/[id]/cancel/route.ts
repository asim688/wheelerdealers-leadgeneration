import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { getJobOpenHours, notifyCompaniesNewJob } from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * POST /api/company/jobs/[id]/cancel
 * ---------------------------------------------------------------------------
 * The winning company backs out. Per the client's rules:
 *  - the job goes LIVE again (status → available, fresh expiry window),
 *  - the cancelling company is PERMANENTLY excluded from re-accepting it,
 *  - all other companies are re-notified that the job is live.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const job = await prisma.inspectionJob.findFirst({
    where: {
      id,
      acceptedByCompanyId: companyId,
      // Only before the inspection has produced a report.
      status: { in: ["accepted", "assigned", "in_progress"] },
    },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Job not found or cannot be cancelled at this stage." },
      { status: 404 },
    );
  }

  const excluded = new Set(
    (job.excludedCompanyIds ?? "").split(",").filter(Boolean),
  );
  excluded.add(companyId);

  const openHours = await getJobOpenHours();
  const relisted = await prisma.inspectionJob.update({
    where: { id },
    data: {
      status: "available",
      acceptedByCompanyId: null,
      acceptedAt: null,
      assignedInspectorId: null,
      assignedAt: null,
      startedAt: null,
      partnerPayout: null,
      excludedCompanyIds: [...excluded].join(","),
      expiresAt: new Date(Date.now() + openHours * 3_600_000),
    },
  });

  // Broadcast to all companies again (the canceller is filtered out of the
  // pool by the exclusion list, so the alert is harmless for them).
  await notifyCompaniesNewJob(relisted);

  return NextResponse.json({
    ok: true,
    message: "Job cancelled and relisted. Your company can no longer accept this job.",
  });
}
