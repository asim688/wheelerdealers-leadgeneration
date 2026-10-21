import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * POST /api/company/jobs/[id]/assign
 * ---------------------------------------------------------------------------
 * Company admin assigns an accepted job to one of ITS OWN inspectors
 * (parent → child). Body: { inspectorId }.
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

  let body: { inspectorId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const inspectorId = body.inspectorId ?? "";
  if (!inspectorId) {
    return NextResponse.json({ error: "inspectorId is required." }, { status: 400 });
  }

  // Job must belong to this company and be in an assignable state.
  const job = await prisma.inspectionJob.findFirst({
    where: {
      id,
      acceptedByCompanyId: companyId,
      status: { in: ["accepted", "assigned", "in_progress"] },
    },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Job not found or not assignable." },
      { status: 404 },
    );
  }

  // Inspector must belong to this company and be active.
  const inspector = await prisma.inspector.findFirst({
    where: { id: inspectorId, companyId, active: true },
    select: { id: true, name: true, email: true },
  });
  if (!inspector) {
    return NextResponse.json(
      { error: "Inspector not found in your company." },
      { status: 404 },
    );
  }

  await prisma.inspectionJob.update({
    where: { id },
    data: { assignedInspectorId: inspector.id, assignedAt: new Date() },
  });

  const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle";
  await sendEmail(
    inspector.email,
    `New inspection assigned — ${job.jobCode}`,
    `<p>Hi ${inspector.name},</p>
<p>You have been assigned an inspection: <b>${vehicle}</b>.</p>
<p>Scheduled: ${job.scheduledAt ? job.scheduledAt.toDateString() : "flexible"} ${job.scheduledSlot ?? ""}</p>
<p>Open your inspector portal to start. Job ID: ${job.jobCode}</p>
<p>— ${"The Wheeler Dealers"}</p>`,
  );

  return NextResponse.json({ ok: true, jobId: id, assignedTo: inspector.name });
}
