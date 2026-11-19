import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { getJobOpenHours, notifyCompaniesNewJob } from "@/lib/inspection";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { resetSnapshot, snapshotCommission } from "@/lib/ledger";
import { approveReport } from "@/lib/review";
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
 * status (marketplace override). Marking a submitted job "completed" is the
 * super admin verifying the report: it is stamped "Verified by The Wheeler
 * Dealers" and the report link is delivered to the customer.
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
    await resetSnapshot(id, "Job renewed by admin");
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
      if (["assigned", "accepted"].includes(job.status)) {
        data.status = "available";
        await resetSnapshot(id, "Admin unassigned the job");
      }
    } else {
      const inspector = await prisma.inspector.findUnique({ where: { id: inspId }, select: { id: true, companyId: true } });
      if (!inspector) {
        return NextResponse.json({ error: "Inspection company not found." }, { status: 400 });
      }
      data.inspector = { connect: { id: inspId } };
      data.assignedAt = new Date();
      if (["open", "available", "payment_pending"].includes(job.status)) {
        data.status = "accepted";
        data.acceptedAt = new Date();
      }
      // Lock the company's commission if the marketplace accept didn't already.
      if (job.partnerPayout == null && inspector.companyId) {
        const snap = await snapshotCommission(id, inspector.companyId);
        if (!snap.ok) {
          return NextResponse.json({ error: snap.error }, { status: 409 });
        }
        const pay = await prisma.jobPayment.findUnique({ where: { jobId: id }, select: { partnerFils: true } });
        if (pay?.partnerFils != null) data.partnerPayout = Math.round(pay.partnerFils / 100);
      }
    }
  }

  // Completing = verifying the submitted report (stamp + send to customer).
  if (body.status === "completed") {
    if (body.renew || body.assignedInspectorId !== undefined) {
      return NextResponse.json({ error: "Verify the report on its own request." }, { status: 400 });
    }
    const who = await getAdminIdentity(req);
    const result = await approveReport({ type: "admin", id: who?.id ?? "admin", name: who?.name ?? "Super Admin" }, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, job: { id, status: "completed" } });
  }

  // Explicit status change (manual override / cancel / reopen).
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
  }

  const updated = await prisma.inspectionJob.update({
    where: { id },
    data,
    include: {
      inspector: { select: { id: true, name: true } },
    },
  });

  // A renewed job is live again — alert the companies that can still take it.
  if (body.renew) {
    await notifyCompaniesNewJob(updated);
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
