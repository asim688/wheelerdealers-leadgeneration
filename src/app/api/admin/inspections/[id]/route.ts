import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { getBaseUrl, getInspectionPricing, getJobOpenHours, notifyCompaniesNewJob, sendReportNotification } from "@/lib/inspection";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const STATUSES = [
  "payment_pending",
  "available",
  "accepted",
  "assigned",
  "in_progress",
  "report_submitted",
  "completed",
  "cancelled",
  "open",
];

/**
 * PATCH /api/admin/inspections/[id]
 * ---------------------------------------------------------------------------
 * Assign / reassign an inspection company and/or manually change a job's
 * status (marketplace override). Marking a job "completed" finalises it: the
 * standardized report link is delivered to the customer at that moment.
 * `renew: true` re-opens an expired job with a fresh acceptance window.
 * Body: { assignedInspectorId?: string | null, status?: string, renew?: boolean }.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: { assignedInspectorId?: string | null; status?: string; renew?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const job = await prisma.inspectionJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      partnerPayout: true,
      assignedInspectorId: true,
      acceptedByCompanyId: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const data: Prisma.InspectionJobUpdateInput = {};

  // Renew: give an expired (or stale) job a fresh acceptance window and put it
  // back in front of the companies. Exclusions are intentionally preserved —
  // a company that cancelled stays permanently excluded.
  if (body.renew) {
    if (["completed", "report_submitted", "in_progress"].includes(job.status)) {
      return NextResponse.json(
        { error: "This job is already being worked on and cannot be renewed." },
        { status: 409 },
      );
    }
    const openHours = await getJobOpenHours();
    data.expiresAt = new Date(Date.now() + openHours * 3_600_000);
    data.status = "available";
    data.acceptedAt = null;
    data.assignedAt = null;
    data.startedAt = null;
    data.partnerPayout = null;
    if (job.assignedInspectorId) data.inspector = { disconnect: true };
    if (job.acceptedByCompanyId) data.acceptedByCompany = { disconnect: true };
  }

  // Assignment (manual admin override of the marketplace).
  if (body.assignedInspectorId !== undefined) {
    const inspId = body.assignedInspectorId;
    if (inspId === null || inspId === "") {
      data.inspector = { disconnect: true };
      data.assignedAt = null;
      // Return the job to the marketplace pool unless it's further along.
      if (["assigned", "accepted"].includes(job.status)) data.status = "available";
    } else {
      const inspector = await prisma.inspector.findUnique({ where: { id: inspId }, select: { id: true } });
      if (!inspector) {
        return NextResponse.json({ error: "Inspection company not found." }, { status: 400 });
      }
      data.inspector = { connect: { id: inspId } };
      data.assignedAt = new Date();
      if (["open", "available", "payment_pending"].includes(job.status)) {
        data.status = "accepted";
        data.acceptedAt = new Date();
      }
      // Snapshot the payout if the marketplace accept didn't set one.
      if (job.partnerPayout == null) {
        const { partnerPayout } = await getInspectionPricing();
        data.partnerPayout = partnerPayout;
      }
    }
  }

  // Explicit status change (manual override / cancel / finalize).
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "completed") data.completedAt = new Date();
  }

  const updated = await prisma.inspectionJob.update({
    where: { id },
    data,
    include: {
      inspector: { select: { id: true, name: true } },
      report: { select: { overallScore: true, sentAt: true } },
    },
  });

  // A renewed job is live again — alert the companies that can still take it.
  if (body.renew) {
    await notifyCompaniesNewJob(updated);
  }

  // Finalisation: the first transition to "completed" delivers the branded
  // report link to the customer (email + SMS + WhatsApp, provider-ready).
  if (
    body.status === "completed" &&
    job.status !== "completed" &&
    updated.reportToken &&
    !updated.report?.sentAt
  ) {
    const reportUrl = `${getBaseUrl()}/inspection/report/${updated.reportToken}`;
    await Promise.allSettled([
      sendReportNotification({
        jobCode: updated.jobCode,
        customerName: updated.customerName,
        customerMobile: updated.customerMobile,
        customerEmail: updated.customerEmail,
        reportUrl,
        overallScore: updated.report?.overallScore ?? null,
      }),
      prisma.inspectionReport.update({
        where: { jobId: updated.id },
        data: { sentAt: new Date() },
      }),
    ]);
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: updated.id,
      status: updated.status,
      inspector: updated.inspector ? { id: updated.inspector.id, name: updated.inspector.name } : null,
    },
  });
}
