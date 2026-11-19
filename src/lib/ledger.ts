import { prisma } from "@/lib/prisma";
import {
  PAYOUT_DELAY_HOURS,
  aedToFils,
  computeSplit,
  describeSetting,
  isValidSetting,
  vatFromGross,
  type CommissionSetting,
} from "@/lib/commission";

/**
 * Payment ledger (Phase 1): one JobPayment per paid job, with the commission
 * snapshot taken when a company accepts and the partner payout lifecycle
 *   not_eligible → pending → due (3 h after the report is sent) → paid, on_hold by Admin.
 */

export interface LedgerActor {
  name: string;
  role: "admin" | "account_manager" | "system" | "customer";
  id?: string | null;
}

export async function logPaymentEvent(paymentId: string, type: string, actor: LedgerActor, detail?: string | null) {
  await prisma.paymentEvent.create({
    data: { paymentId, type, actorName: actor.name, actorRole: actor.role, detail: detail ? detail.slice(0, 500) : null },
  });
}

/** Creates the ledger row for a paid job (idempotent). Safe to call from payment capture and at accept. */
export async function ensureJobPayment(jobId: string) {
  const existing = await prisma.jobPayment.findUnique({ where: { jobId } });
  if (existing) return existing;
  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    select: { fee: true, currency: true, paymentStatus: true },
  });
  if (!job || job.fee == null || job.fee <= 0 || job.paymentStatus !== "paid") return null;

  const grossFils = aedToFils(job.fee);
  const { vatFils, netFils } = vatFromGross(grossFils);
  try {
    const created = await prisma.jobPayment.create({
      data: { jobId, currency: job.currency, grossFils, vatFils, netFils },
    });
    await logPaymentEvent(created.id, "created", { name: "System", role: "system" }, `Payment received AED ${(grossFils / 100).toFixed(2)} (VAT ${(vatFils / 100).toFixed(2)})`);
    return created;
  } catch {
    return prisma.jobPayment.findUnique({ where: { jobId } }); // lost a race with a parallel call
  }
}

/** The company's current commission setting, or null when none has been set. */
export async function getActiveAgreement(companyId: string) {
  return prisma.commissionAgreement.findFirst({
    where: { companyId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Locks the commission for a job that a company has just accepted. Returns an
 * error message when the company has no (or an unusable) commission setting.
 */
export async function snapshotCommission(jobId: string, companyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const agreement = await getActiveAgreement(companyId);
  if (!agreement) {
    return { ok: false, error: "Wheeler Dealers has not set your commission yet. Please contact us so we can activate your account for jobs." };
  }
  const payment = await ensureJobPayment(jobId);
  if (!payment) return { ok: false, error: "This job has no confirmed payment." };

  const res = computeSplit(payment.grossFils, { type: agreement.type as CommissionSetting["type"], value: agreement.value });
  if (!res.ok) return { ok: false, error: res.error };

  await prisma.jobPayment.update({
    where: { id: payment.id },
    data: {
      companyId,
      agreementId: agreement.id,
      commissionType: agreement.type,
      commissionValue: agreement.value,
      commissionFils: res.split.commissionFils,
      partnerFils: res.split.partnerFils,
      snapshotAt: new Date(),
      payoutStatus: payment.payoutStatus === "on_hold" ? "on_hold" : "pending",
      eligibleAt: null,
    },
  });
  await logPaymentEvent(
    payment.id,
    "snapshot",
    { name: "System", role: "system" },
    `Commission locked: ${describeSetting(agreement.type, agreement.value)} → WD AED ${(res.split.commissionFils / 100).toFixed(2)}, company AED ${(res.split.partnerFils / 100).toFixed(2)}`,
  );
  return { ok: true };
}

/** A company cancelled the job and it went back to the pool: forget the snapshot. */
export async function resetSnapshot(jobId: string, reason: string) {
  const p = await prisma.jobPayment.findUnique({ where: { jobId } });
  if (!p || p.payoutStatus === "paid") return;
  await prisma.jobPayment.update({
    where: { id: p.id },
    data: {
      companyId: null, agreementId: null, commissionType: null, commissionValue: null,
      commissionFils: null, partnerFils: null, snapshotAt: null, eligibleAt: null,
      payoutStatus: p.payoutStatus === "on_hold" ? "on_hold" : "not_eligible",
    },
  });
  await logPaymentEvent(p.id, "snapshot_reset", { name: "System", role: "system" }, reason);
}

/** The report reached the customer: the payout becomes due after the review window. */
export async function markReportDelivered(jobId: string, sentAt: Date) {
  const p = await prisma.jobPayment.findUnique({ where: { jobId } });
  if (!p) return;
  const eligibleAt = new Date(sentAt.getTime() + PAYOUT_DELAY_HOURS * 3_600_000);
  await prisma.jobPayment.update({ where: { id: p.id }, data: { eligibleAt } });
  await logPaymentEvent(p.id, "eligible", { name: "System", role: "system" }, `Report delivered; payout due after ${eligibleAt.toISOString()}`);
}

/** pending → due is derived from the clock, so no background job is needed. */
export function effectivePayoutStatus(p: { payoutStatus: string; eligibleAt: Date | null; paymentStatus: string }, now = new Date()): string {
  if (p.payoutStatus === "pending" && (p.paymentStatus === "received" || p.paymentStatus === "partially_refunded") && p.eligibleAt && p.eligibleAt <= now) return "due";
  return p.payoutStatus;
}

// --- Commission agreements ---------------------------------------------------

export async function setCommission(opts: {
  companyId: string;
  setting: CommissionSetting;
  note?: string | null;
  actor: LedgerActor;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidSetting(opts.setting)) return { ok: false, error: "Enter a valid commission (0–100% or a positive AED amount)." };
  const company = await prisma.inspectionCompany.findUnique({ where: { id: opts.companyId }, select: { id: true } });
  if (!company) return { ok: false, error: "Company not found." };

  const prev = await getActiveAgreement(opts.companyId);
  if (prev && prev.type === opts.setting.type && prev.value === opts.setting.value) {
    return { ok: false, error: "That is already the current commission." };
  }
  await prisma.$transaction([
    prisma.commissionAgreement.updateMany({ where: { companyId: opts.companyId, status: "active" }, data: { status: "superseded" } }),
    prisma.commissionAgreement.create({
      data: {
        companyId: opts.companyId,
        type: opts.setting.type,
        value: opts.setting.value,
        previousType: prev?.type ?? null,
        previousValue: prev?.value ?? null,
        note: opts.note?.trim().slice(0, 300) || null,
        createdById: opts.actor.id ?? null,
        createdByName: opts.actor.name,
        createdByRole: opts.actor.role,
      },
    }),
  ]);
  return { ok: true };
}
