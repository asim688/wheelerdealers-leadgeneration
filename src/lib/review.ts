import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getManagerId, isAdmin, getAdminEmail } from "./auth";
import { getBaseUrl, sendEmail, sendReportNotification } from "./inspection";
import { brandEmail, esc } from "./emailTemplates";
import { itemType, optionsFor, VALUE_KEYS } from "./inspectionChecklist";

/**
 * ----------------------------------------------------------------------------
 * Report review (Wheeler Dealers verification before release).
 * ----------------------------------------------------------------------------
 * Inspector submits → status "report_submitted" → the company's Account
 * Manager (or the super admin when no manager is assigned) is notified →
 * reviewer previews the report and can edit it (audited), return it to the
 * inspector with a note, or approve it. Approval stamps the report "Verified
 * by The Wheeler Dealers" and sends the link to the customer.
 * ----------------------------------------------------------------------------
 */

export type Reviewer =
  | { type: "admin"; id: "admin"; name: string }
  | { type: "manager"; id: string; name: string };

/** The signed-in reviewer (super admin or a verified, active account manager). */
export async function getReviewer(req: NextRequest): Promise<Reviewer | null> {
  if (isAdmin(req)) return { type: "admin", id: "admin", name: "Super Admin" };
  const managerId = getManagerId(req);
  if (!managerId) return null;
  const m = await prisma.accountManager.findUnique({
    where: { id: managerId },
    select: { id: true, name: true, active: true, emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  if (!m || !m.active || !m.emailVerifiedAt || !m.phoneVerifiedAt) return null;
  return { type: "manager", id: m.id, name: m.name };
}

/** Jobs whose company (accepting company, or the inspector's company) is assigned to this manager. */
export function managerJobsWhere(managerId: string): Prisma.InspectionJobWhereInput {
  return {
    OR: [
      { acceptedByCompany: { accountManagerId: managerId } },
      { acceptedByCompanyId: null, inspector: { company: { accountManagerId: managerId } } },
    ],
  };
}

/** Restricts a job query to what the reviewer may see. */
export function reviewerScope(reviewer: Reviewer): Prisma.InspectionJobWhereInput {
  return reviewer.type === "admin" ? {} : managerJobsWhere(reviewer.id);
}

/** Loads a job the reviewer is allowed to review, or null. */
export async function findReviewableJob(reviewer: Reviewer, jobId: string) {
  return prisma.inspectionJob.findFirst({
    where: { AND: [{ id: jobId }, reviewerScope(reviewer)] },
    select: { id: true, status: true, jobCode: true },
  });
}

export async function logActivity(
  jobId: string,
  action: "submitted" | "edited" | "returned" | "approved",
  actor: { type: "inspector" | "manager" | "admin"; id?: string | null; name?: string | null },
  detail?: string | null,
) {
  await prisma.reportActivity
    .create({
      data: {
        jobId,
        action,
        detail: detail ? detail.slice(0, 4000) : null,
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorName: actor.name ?? null,
      },
    })
    .catch((err) => console.error("report activity log failed:", err));
}

/** The job's company + its account manager (accepting company, else the inspector's company). */
async function jobCompanyAndManager(jobId: string) {
  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    select: {
      jobCode: true,
      make: true,
      model: true,
      year: true,
      acceptedByCompany: { select: { name: true, accountManager: { select: { name: true, email: true, active: true } } } },
      inspector: {
        select: {
          name: true,
          email: true,
          company: { select: { name: true, accountManager: { select: { name: true, email: true, active: true } } } },
        },
      },
    },
  });
  if (!job) return null;
  const company = job.acceptedByCompany ?? job.inspector?.company ?? null;
  const manager = company?.accountManager?.active ? company.accountManager : null;
  return { job, company, manager };
}

/** Inspector submitted (or re-submitted) → notify the assigned manager, else the super admin. */
export async function notifyReportSubmitted(jobId: string, resubmitted: boolean) {
  const info = await jobCompanyAndManager(jobId);
  if (!info) return;
  const { job, company, manager } = info;
  const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle";
  const to = manager?.email ?? getAdminEmail();
  const url = `${getBaseUrl()}${manager ? "/manager" : "/admin/inspections"}`;
  const verb = resubmitted ? "re-submitted" : "submitted";
  const html = brandEmail({
    heading: `Report ${verb} — awaiting your verification`,
    bodyHtml: `<p style="margin:0 0 12px">${manager ? `Hi ${esc(manager.name)},` : "Hello,"}</p>
<p style="margin:0 0 12px">The inspection report for <b>${esc(job.jobCode)}</b> (${esc(vehicle)}) has been ${verb} by
${esc(job.inspector?.name ?? "the inspector")}${company ? ` of <b>${esc(company.name)}</b>` : ""}.</p>
<p style="margin:0 0 12px">Please review it. You can correct it, return it to the inspector, or verify it — once verified it is sent to the customer with the Wheeler Dealers verification stamp.</p>`,
    cta: { label: "Review the report", url },
  });
  await sendEmail(to, `Report ${verb} for verification — ${job.jobCode}`, html,
    `The inspection report for ${job.jobCode} (${vehicle}) has been ${verb} and awaits your verification: ${url}`);
}

/** Approve: stamp as verified, complete the job and send the report link to the customer. */
export async function approveReport(reviewer: Reviewer, jobId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    include: { report: { select: { id: true, sentAt: true } } },
  });
  if (!job) return { ok: false, status: 404, error: "Job not found." };
  if (job.status !== "report_submitted" || !job.report || !job.reportToken) {
    return { ok: false, status: 409, error: "Only a submitted report can be verified." };
  }

  const now = new Date();
  // Status guard makes approval idempotent if two reviewers click at once.
  const claimed = await prisma.inspectionJob.updateMany({
    where: { id: jobId, status: "report_submitted" },
    data: { status: "completed", completedAt: now },
  });
  if (claimed.count === 0) return { ok: false, status: 409, error: "This report was already handled." };

  await prisma.inspectionReport.update({
    where: { jobId },
    data: {
      verifiedAt: now,
      verifiedById: reviewer.id,
      verifiedByName: reviewer.type === "admin" ? "The Wheeler Dealers" : reviewer.name,
      returnedAt: null,
      returnNote: null,
    },
  });
  await logActivity(jobId, "approved", reviewer, "Report verified and sent to the customer.");

  if (!job.report.sentAt) {
    const reportUrl = `${getBaseUrl()}/inspection/report/${job.reportToken}`;
    await Promise.allSettled([
      sendReportNotification({
        jobCode: job.jobCode,
        customerName: job.customerName,
        customerMobile: job.customerMobile,
        customerEmail: job.customerEmail,
        reportUrl,
      }),
      prisma.inspectionReport.update({ where: { jobId }, data: { sentAt: new Date() } }),
    ]);
  }
  return { ok: true };
}

/** Return the report to the inspector with a note; they can edit and re-submit. */
export async function returnReport(
  reviewer: Reviewer,
  jobId: string,
  rawNote: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const note = (rawNote ?? "").trim().slice(0, 2000);
  if (note.length < 3) return { ok: false, status: 400, error: "Please tell the inspector what to correct." };

  const now = new Date();
  const moved = await prisma.inspectionJob.updateMany({
    where: { id: jobId, status: "report_submitted" },
    data: { status: "in_progress", reportSubmittedAt: null },
  });
  if (moved.count === 0) return { ok: false, status: 409, error: "Only a submitted report can be returned." };
  await prisma.inspectionReport.update({ where: { jobId }, data: { returnedAt: now, returnNote: note } });
  await logActivity(jobId, "returned", reviewer, note);

  const info = await jobCompanyAndManager(jobId);
  if (info?.job.inspector?.email) {
    const { job } = info;
    const url = `${getBaseUrl()}/inspector`;
    const html = brandEmail({
      heading: `Report returned for correction — ${job.jobCode}`,
      bodyHtml: `<p style="margin:0 0 12px">Hi ${esc(job.inspector!.name)},</p>
<p style="margin:0 0 12px">The Wheeler Dealers has returned your report for <b>${esc(job.jobCode)}</b> with this note:</p>
<p style="margin:0 0 12px;padding:10px 12px;background:#fef2f2;border-left:3px solid #dc2626">${esc(note)}</p>
<p style="margin:0">Open the job in the inspector portal, make the correction and submit it again.</p>`,
      cta: { label: "Open inspector portal", url },
    });
    await sendEmail(job.inspector!.email, `Report returned for correction — ${job.jobCode}`, html,
      `Your report for ${job.jobCode} was returned for correction: ${note}. Open ${url}, correct it and submit again.`);
  }
  return { ok: true };
}

/* ── Reviewer edits (audited) ─────────────────────────────────────────────── */

export interface ItemEdit {
  itemKey: string;
  condition?: string | null;
  comments?: string | null;
  value?: Record<string, unknown> | null;
}

export const REPORT_EDIT_FIELDS = {
  odometerKm: "Odometer (km)",
  odometerStatus: "Odometer authenticity",
  exteriorColor: "Exterior colour",
  regionalSpecs: "Regional specifications",
  engineConfig: "Engine configuration",
  keysCount: "Number of keys",
  spareTyre: "Spare tyre",
  diagnosticScan: "Diagnostic scan history",
  summary: "Additional observations",
  limitations: "Inspection limitations",
} as const;
export type ReportEditField = keyof typeof REPORT_EDIT_FIELDS;

const clean = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const fmt = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * Applies reviewer edits to a submitted report and records each change.
 * Returns the number of changed values.
 */
export async function applyReviewerEdits(
  reviewer: Reviewer,
  jobId: string,
  items: ItemEdit[],
  report: Partial<Record<ReportEditField, unknown>>,
): Promise<{ ok: true; changed: number } | { ok: false; status: number; error: string }> {
  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    select: { status: true, items: true, report: true },
  });
  if (!job) return { ok: false, status: 404, error: "Job not found." };
  if (job.status !== "report_submitted") {
    return { ok: false, status: 409, error: "Only a submitted report (awaiting verification) can be edited." };
  }

  const byKey = new Map(job.items.map((i) => [i.itemKey, i]));
  const changes: string[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const e of items.slice(0, 300)) {
    const item = e && typeof e.itemKey === "string" ? byKey.get(e.itemKey) : undefined;
    if (!item) continue;
    const type = itemType(item.itemKey);
    const data: Prisma.InspectionItemUpdateInput = {};
    if (e.condition !== undefined) {
      const c = clean(e.condition, 60);
      // Empty = "Not recorded"; anything outside the item's options is ignored.
      const valid = c === null || optionsFor(type).includes(c);
      const next = c;
      if (valid && next !== item.condition) {
        data.condition = next;
        changes.push(`${item.section} › ${item.label}: observation "${fmt(item.condition)}" → "${fmt(next)}"`);
      }
    }
    if (e.comments !== undefined) {
      const next = clean(e.comments, 1000);
      if (next !== item.comments) {
        data.comments = next;
        changes.push(`${item.section} › ${item.label}: comment "${fmt(item.comments)}" → "${fmt(next)}"`);
      }
    }
    if (e.value !== undefined) {
      const out: Record<string, string> = {};
      if (e.value && typeof e.value === "object") {
        for (const [k, raw] of Object.entries(e.value)) {
          const s = clean(raw, 20);
          if (VALUE_KEYS.has(k) && s) out[k] = s;
        }
      }
      const next = Object.keys(out).length ? out : null;
      if (JSON.stringify(next) !== JSON.stringify(item.value ?? null)) {
        data.value = next ?? Prisma.JsonNull;
        changes.push(`${item.section} › ${item.label}: measurements ${fmt(item.value)} → ${fmt(next)}`);
      }
    }
    if (Object.keys(data).length) {
      ops.push(prisma.inspectionItem.update({ where: { id: item.id }, data }));
    }
  }

  const reportData: Prisma.InspectionReportUpdateInput = {};
  const current = (job.report ?? {}) as Record<string, unknown>;
  for (const [field, label] of Object.entries(REPORT_EDIT_FIELDS) as [ReportEditField, string][]) {
    if (!(field in report)) continue;
    const raw = report[field];
    let next: string | number | null;
    if (field === "odometerKm" || field === "keysCount") {
      const n = Number(raw);
      next = raw === "" || raw == null || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
    } else {
      next = clean(raw, ["diagnosticScan", "summary", "limitations"].includes(field) ? 4000 : 200);
    }
    if ((current[field] ?? null) !== next) {
      (reportData as Record<string, unknown>)[field] = next;
      changes.push(`${label}: "${fmt(current[field])}" → "${fmt(next)}"`);
    }
  }
  if (Object.keys(reportData).length && job.report) {
    ops.push(prisma.inspectionReport.update({ where: { jobId }, data: reportData }));
  }

  if (!changes.length) return { ok: true, changed: 0 };
  await prisma.$transaction(ops);
  await logActivity(jobId, "edited", reviewer, changes.join("\n"));
  return { ok: true, changed: changes.length };
}
