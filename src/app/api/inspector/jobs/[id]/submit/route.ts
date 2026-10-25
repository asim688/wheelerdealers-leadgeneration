import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { getBaseUrl, sendEmail } from "@/lib/inspection";
import { isRecordable } from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

/**
 * POST /api/inspector/jobs/[id]/submit
 * ---------------------------------------------------------------------------
 * The inspection company submits its inspection: stores the Section 01
 * vehicle details and Section 12 inspector comments on the InspectionReport
 * and moves the job to "report_submitted". Admin review then finalises the
 * job (status "completed"), which is when the Wheeler Dealers report link is
 * delivered to the customer.
 *
 * The Wheeler Dealers documents facts — nothing here scores, grades, or
 * recommends the vehicle; the customer makes the decision.
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
    diagnosticScan?: string;
    limitations?: string;
    odometerKm?: number | string;
    odometerStatus?: string;
    exteriorColor?: string;
    regionalSpecs?: string;
    engineConfig?: string;
    keysCount?: number | string;
    spareTyre?: string;
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

  const recordable = job.items.filter((i) => isRecordable(i.itemKey));
  const recorded = recordable.filter((i) => i.condition).length;
  const unrecorded = recordable.filter((i) => !i.condition).map((i) => `${i.section}: ${i.label}`);

  // Section 12 wording defaults — facts only, never a verdict. A blank
  // "additional observations" stays empty (the report prints a neutral note).
  const summary = str(body.summary, 4000);
  const limitations =
    str(body.limitations, 4000) ??
    (unrecorded.length
      ? `Not recorded during this inspection: ${unrecorded.slice(0, 40).join("; ")}${unrecorded.length > 40 ? "; …" : ""}.`
      : null);

  const data = {
    summary,
    diagnosticScan: str(body.diagnosticScan, 4000),
    limitations,
    odometerKm: int(body.odometerKm),
    odometerStatus: str(body.odometerStatus, 200),
    exteriorColor: str(body.exteriorColor),
    regionalSpecs: str(body.regionalSpecs),
    engineConfig: str(body.engineConfig),
    keysCount: int(body.keysCount),
    spareTyre: str(body.spareTyre),
    // Legacy scoring columns are intentionally left empty for new reports.
    recommendations: null,
    overallScore: null,
    verdict: null,
  };

  // A stable, unguessable token for the public customer report link.
  const reportToken = job.reportToken ?? crypto.randomBytes(16).toString("hex");

  await prisma.$transaction([
    prisma.inspectionReport.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, ...data },
      update: { ...data, generatedAt: new Date() },
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
<p>${recorded} of ${recordable.length} parameters recorded.</p>
<p>Finalise it in the admin dashboard to deliver the report to the customer.</p>`,
  );

  const reportUrl = `${getBaseUrl()}/inspection/report/${reportToken}`;
  return NextResponse.json({ ok: true, recorded, total: recordable.length, summary, reportUrl });
}
