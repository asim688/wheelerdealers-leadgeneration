import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { getInspectionPricing, sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * POST /api/inspector/jobs/[id]/accept
 * ---------------------------------------------------------------------------
 * First-accept-wins marketplace assignment. The updateMany with a status
 * guard is atomic — if two companies tap ACCEPT simultaneously only one
 * transition succeeds; the loser gets a 409.
 *
 * The partner payout is snapshotted onto the job at acceptance time so later
 * admin pricing changes never rewrite historical earnings.
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

  const company = await prisma.inspector.findUnique({
    where: { id: inspectorId },
    select: { id: true, name: true, active: true, approvalStatus: true },
  });
  if (!company || !company.active || company.approvalStatus !== "approved") {
    return NextResponse.json(
      { error: "Your company is not approved to accept jobs." },
      { status: 403 },
    );
  }

  const { partnerPayout } = await getInspectionPricing();
  const now = new Date();

  // Atomic claim: succeeds only while the job is still in the pool.
  const claimed = await prisma.inspectionJob.updateMany({
    where: { id, status: "available" },
    data: {
      status: "accepted",
      assignedInspectorId: company.id,
      assignedAt: now,
      acceptedAt: now,
      partnerPayout,
    },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "This job is no longer available — another company accepted it first." },
      { status: 409 },
    );
  }

  const job = await prisma.inspectionJob.findUnique({ where: { id } });

  // Notify customer that a company has been assigned (provider-ready stub).
  if (job) {
    const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ") || "your vehicle";
    await sendEmail(
      job.customerEmail,
      `Inspection company assigned — ${job.jobCode}`,
      `<p>Hi ${job.customerName},</p>
<p><b>${company.name}</b> has been assigned to inspect ${vehicle}.</p>
<p>They will arrive at the scheduled time. Job ID: ${job.jobCode}</p>
<p>— The Wheeler Dealers</p>`,
    );
  }

  return NextResponse.json({ ok: true, jobId: id, acceptedBy: company.name });
}
