import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { getBaseUrl, sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

const SCORE: Record<string, number> = { Good: 1, Fair: 0.6, Poor: 0.3, Fail: 0 };

/**
 * POST /api/inspector/jobs/[id]/submit
 * ---------------------------------------------------------------------------
 * The inspection company submits its inspection: derives an overall score +
 * summary from the item conditions, writes the InspectionReport and moves the
 * job to "report_submitted". Admin review then finalises the job (status
 * "completed"), which is when the standardized Wheeler Dealers report link is
 * delivered to the customer. Accepts optional { summary, recommendations }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const inspectorId = getInspectorId(req);
  if (!inspectorId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const job = await prisma.inspectionJob.findFirst({
    where: { id, assignedInspectorId: inspectorId },
    include: { items: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!job.items.length) {
    return NextResponse.json(
      { error: "Start the inspection before submitting." },
      { status: 400 },
    );
  }

  let body: {
    summary?: string;
    recommendations?: string;
    odometerKm?: number | string;
    odometerStatus?: string;
    exteriorColor?: string;
    regionalSpecs?: string;
    keysCount?: number | string;
    spareTyre?: string;
    verdict?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }

  const str = (v: unknown, max = 60) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const int = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const details = {
    odometerKm: int(body.odometerKm),
    odometerStatus: str(body.odometerStatus),
    exteriorColor: str(body.exteriorColor),
    regionalSpecs: str(body.regionalSpecs),
    keysCount: int(body.keysCount),
    spareTyre: str(body.spareTyre),
    verdict: str(body.verdict),
  };

  // Overall score (0-10) from rated items, ignoring N/A and unrated.
  const rated = job.items.filter((i) => i.condition && i.condition in SCORE);
  const overallScore =
    rated.length > 0
      ? Math.round(
          (rated.reduce((s, i) => s + SCORE[i.condition as string], 0) / rated.length) * 100,
        ) / 10
      : null;

  const counts = { Good: 0, Fair: 0, Poor: 0, Fail: 0 } as Record<string, number>;
  for (const i of rated) counts[i.condition as string]++;
  const flagged = job.items
    .filter((i) => i.condition === "Poor" || i.condition === "Fail")
    .map((i) => `${i.section}: ${i.label}${i.comments ? ` — ${i.comments}` : ""}`);

  const autoSummary =
    `Inspected ${rated.length} points — ${counts.Good} good, ${counts.Fair} fair, ` +
    `${counts.Poor} poor, ${counts.Fail} failed.` +
    (overallScore != null ? ` Overall score ${overallScore}/10.` : "");
  const summary = (body.summary?.trim() || autoSummary).slice(0, 2000);
  const recommendations =
    (body.recommendations?.trim() || flagged.slice(0, 30).join("\n")).slice(0, 4000) || null;

  // A stable, unguessable token for the public customer report link.
  const reportToken = job.reportToken ?? crypto.randomBytes(16).toString("hex");

  await prisma.$transaction([
    prisma.inspectionReport.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, summary, recommendations, overallScore, ...details },
      update: { summary, recommendations, overallScore, ...details, generatedAt: new Date() },
    }),
    prisma.inspectionJob.update({
      where: { id: job.id },
      data: { status: "report_submitted", reportSubmittedAt: new Date(), reportToken },
    }),
  ]);

  // Notify admin that an inspection was submitted and awaits finalisation.
  const adminEmail = process.env.ADMIN_EMAIL || "admin@thewheelerdealers.com";
  await sendEmail(
    adminEmail,
    `Inspection submitted — ${job.jobCode}`,
    `<p>Inspection ${job.jobCode} has been submitted and is awaiting review.</p>
<p>Overall score: ${overallScore != null ? `${overallScore}/10` : "n/a"}.</p>
<p>Finalise it in the admin dashboard to deliver the report to the customer.</p>`,
  );

  const reportUrl = `${getBaseUrl()}/inspection/report/${reportToken}`;
  return NextResponse.json({ ok: true, overallScore, summary, reportUrl });
}
