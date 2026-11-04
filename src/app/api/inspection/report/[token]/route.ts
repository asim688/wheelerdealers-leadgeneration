import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportPayload, REPORT_JOB_INCLUDE } from "@/lib/reportPayload";

export const runtime = "nodejs";

/**
 * GET /api/inspection/report/[token]
 * ---------------------------------------------------------------------------
 * Public, unguessable customer report link. Returns the completed (and
 * Wheeler Dealers-verified) inspection as a factual record — vehicle
 * identification, every parameter's observation grouped by numbered section,
 * inspector comments and photo groups. Nothing here grades, scores or
 * recommends the vehicle: the customer decides.
 * 404 unless the job exists and is completed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const job = await prisma.inspectionJob.findUnique({
    where: { reportToken: token },
    include: REPORT_JOB_INCLUDE,
  });

  if (!job || job.status !== "completed") {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json(buildReportPayload(job));
}
