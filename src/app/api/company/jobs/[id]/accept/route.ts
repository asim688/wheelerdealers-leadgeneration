import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { getInspectionPricing, sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * POST /api/company/jobs/[id]/accept
 * ---------------------------------------------------------------------------
 * Uber-style first-accept-wins. The updateMany with a status guard is atomic —
 * if two companies tap ACCEPT simultaneously only one transition succeeds; the
 * loser gets a 409. Companies that previously cancelled this job are barred
 * ("your loss" rule), and expired jobs cannot be accepted.
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

  const company = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, active: true, approvalStatus: true },
  });
  if (!company || !company.active || company.approvalStatus !== "approved") {
    return NextResponse.json(
      { error: "Your company is not approved to accept jobs." },
      { status: 403 },
    );
  }

  // Exclusion check ("cancelled once — never again for this job").
  const pre = await prisma.inspectionJob.findUnique({
    where: { id },
    select: { excludedCompanyIds: true, expiresAt: true },
  });
  if (!pre) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if ((pre.excludedCompanyIds ?? "").split(",").includes(company.id)) {
    return NextResponse.json(
      { error: "You cancelled this job earlier — it can no longer be accepted by your company." },
      { status: 403 },
    );
  }
  if (pre.expiresAt && pre.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "This job's acceptance window has expired." },
      { status: 410 },
    );
  }

  const { partnerPayout } = await getInspectionPricing();
  const now = new Date();

  // Atomic claim: succeeds only while the job is still in the pool.
  const claimed = await prisma.inspectionJob.updateMany({
    where: { id, status: "available" },
    data: {
      status: "accepted",
      acceptedByCompanyId: company.id,
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
