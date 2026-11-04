import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findReviewableJob, getReviewer } from "@/lib/review";
import { buildReportPayload, REPORT_JOB_INCLUDE } from "@/lib/reportPayload";

export const runtime = "nodejs";

/**
 * GET /api/review/jobs/[id]/report — the customer report exactly as it will be
 * delivered, available to the reviewer before it is verified (preview).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  if (!(await findReviewableJob(reviewer, id))) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  const job = await prisma.inspectionJob.findUnique({ where: { id }, include: REPORT_JOB_INCLUDE });
  if (!job || !job.report) return NextResponse.json({ error: "No report submitted yet." }, { status: 404 });
  return NextResponse.json({ ...buildReportPayload(job), preview: job.status !== "completed", status: job.status });
}
