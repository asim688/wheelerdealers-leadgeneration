import { NextRequest, NextResponse } from "next/server";
import { approveReport, findReviewableJob, getReviewer } from "@/lib/review";

export const runtime = "nodejs";

/** POST /api/review/jobs/[id]/approve — verify the report (red stamp) and send it to the customer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  if (!(await findReviewableJob(reviewer, id))) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const result = await approveReport(reviewer, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
