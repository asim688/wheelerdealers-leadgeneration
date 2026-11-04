import { NextRequest, NextResponse } from "next/server";
import { findReviewableJob, getReviewer, returnReport } from "@/lib/review";

export const runtime = "nodejs";

/** POST /api/review/jobs/[id]/return — body { note }. Sends the report back to the inspector. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  if (!(await findReviewableJob(reviewer, id))) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  let body: { note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await returnReport(reviewer, id, body.note ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
