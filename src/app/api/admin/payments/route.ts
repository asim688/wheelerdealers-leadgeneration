import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { effectivePayoutStatus } from "@/lib/ledger";
import { describeSetting } from "@/lib/commission";

export const runtime = "nodejs";

const DUBAI_OFFSET_MS = 4 * 3_600_000; // UTC+4, no DST

/** "2026-11-18" in Dubai time → UTC instant at the start of that day. */
function dubaiDayStart(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - DUBAI_OFFSET_MS);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const aed = (fils: number | null | undefined) => (fils == null ? "" : (fils / 100).toFixed(2));

/**
 * GET /api/admin/payments  (Admin only)
 *   ?tab=transactions|pending|companies   &q=  &status=<payout status>  &companyId=  &from=YYYY-MM-DD  &to=YYYY-MM-DD
 *   &format=csv  → CSV export of the transactions in the selected filters
 * Returns the summary cards (all in AED, VAT-inclusive gross clearly separated), the rows and per-company payouts.
 */
export async function GET(req: NextRequest) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const status = sp.get("status") || "";
  const companyId = sp.get("companyId") || "";
  const from = dubaiDayStart(sp.get("from") || "");
  const toDay = dubaiDayStart(sp.get("to") || "");
  const to = toDay ? new Date(toDay.getTime() + 86_400_000) : null;
  const now = new Date();

  const where: Prisma.JobPaymentWhereInput = {};
  const and: Prisma.JobPaymentWhereInput[] = [];
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  if (companyId) and.push({ companyId: companyId === "unassigned" ? null : companyId });
  if (q) {
    and.push({
      OR: [
        { id: { contains: q } },
        { job: { jobCode: { contains: q, mode: "insensitive" } } },
        { job: { customerName: { contains: q, mode: "insensitive" } } },
        { job: { customerEmail: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const all = await prisma.jobPayment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { jobCode: true, customerName: true, customerEmail: true, status: true, vin: true } },
    },
  });

  const companyIds = [...new Set(all.map((p) => p.companyId).filter(Boolean))] as string[];
  const companies = await prisma.inspectionCompany.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true, bankName: true, bankIban: true, bankAccountTitle: true },
  });
  const cmap = new Map(companies.map((c) => [c.id, c]));

  const rows = all.map((p) => {
    const eff = effectivePayoutStatus(p, now);
    return {
      id: p.id,
      jobId: p.jobId,
      jobCode: p.job.jobCode,
      customer: p.job.customerName,
      customerEmail: p.job.customerEmail,
      companyId: p.companyId,
      company: p.companyId ? cmap.get(p.companyId)?.name ?? "—" : null,
      grossFils: p.grossFils,
      vatFils: p.vatFils,
      netFils: p.netFils,
      commissionLabel: describeSetting(p.commissionType, p.commissionValue),
      commissionFils: p.commissionFils,
      partnerFils: p.partnerFils,
      refundedFils: p.refundedFils,
      paymentStatus: p.paymentStatus,
      payoutStatus: eff,
      eligibleAt: p.eligibleAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      payoutRef: p.payoutRef,
      paidByName: p.paidByName,
      holdReason: p.holdReason,
      jobStatus: p.job.status,
      createdAt: p.createdAt.toISOString(),
    };
  });

  const filtered = status ? rows.filter((r) => r.payoutStatus === status) : rows;

  if (sp.get("format") === "csv") {
    const header = [
      "Payment ID", "Job ID", "Date (Dubai)", "Customer", "Company", "Gross (incl. VAT)", "VAT 5%", "Net (excl. VAT)",
      "Commission", "WD commission", "Company share", "Payment status", "Payout status", "Payout due after", "Paid at", "Bank reference", "Paid by",
    ];
    const lines = filtered.map((r) =>
      [
        r.id, r.jobCode,
        new Date(new Date(r.createdAt).getTime() + DUBAI_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16),
        r.customer, r.company ?? "Unassigned", aed(r.grossFils), aed(r.vatFils), aed(r.netFils),
        r.commissionLabel, aed(r.commissionFils), aed(r.partnerFils), r.paymentStatus, r.payoutStatus,
        r.eligibleAt ?? "", r.paidAt ?? "", r.payoutRef ?? "", r.paidByName ?? "",
      ].map(csvCell).join(","),
    );
    return new NextResponse([header.map(csvCell).join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // Summary cards (over the date/company/search filter, before the status filter).
  const sum = (list: typeof rows, f: (r: (typeof rows)[number]) => number | null | undefined) => list.reduce((t, r) => t + (f(r) ?? 0), 0);
  const live = rows.filter((r) => r.paymentStatus !== "refunded");
  const withCompany = live.filter((r) => r.partnerFils != null);
  const unpaid = withCompany.filter((r) => ["pending", "due", "on_hold"].includes(r.payoutStatus));
  const summary = {
    totalReceivedFils: sum(rows, (r) => r.grossFils),
    totalReceivedCount: rows.length,
    vatFils: sum(rows, (r) => r.vatFils),
    commissionEarnedFils: sum(live.filter((r) => r.eligibleAt), (r) => r.commissionFils),
    payableFils: sum(unpaid, (r) => r.partnerFils),
    dueNowFils: sum(unpaid.filter((r) => r.payoutStatus === "due"), (r) => r.partnerFils),
    dueNowCount: unpaid.filter((r) => r.payoutStatus === "due").length,
    waitingFils: sum(unpaid.filter((r) => r.payoutStatus === "pending"), (r) => r.partnerFils),
    onHoldFils: sum(unpaid.filter((r) => r.payoutStatus === "on_hold"), (r) => r.partnerFils),
    onHoldCount: unpaid.filter((r) => r.payoutStatus === "on_hold").length,
    paidOutFils: sum(withCompany.filter((r) => r.payoutStatus === "paid"), (r) => r.partnerFils),
    paidOutCount: withCompany.filter((r) => r.payoutStatus === "paid").length,
    refundedFils: sum(rows, (r) => r.refundedFils),
    refundedCount: rows.filter((r) => r.refundedFils > 0).length,
    refundRequestCount: rows.filter((r) => r.paymentStatus === "refund_requested").length,
  };

  // Per-company payable / paid.
  const byCompany = new Map<string, { id: string; name: string; bank: string | null; jobs: number; dueFils: number; waitingFils: number; holdFils: number; paidFils: number }>();
  for (const r of withCompany) {
    if (!r.companyId) continue;
    const c = cmap.get(r.companyId);
    const row = byCompany.get(r.companyId) ?? {
      id: r.companyId, name: c?.name ?? "—",
      bank: c?.bankIban ? `${c.bankName ?? ""} · ${c.bankIban}` : null,
      jobs: 0, dueFils: 0, waitingFils: 0, holdFils: 0, paidFils: 0,
    };
    row.jobs += 1;
    if (r.payoutStatus === "due") row.dueFils += r.partnerFils ?? 0;
    else if (r.payoutStatus === "pending") row.waitingFils += r.partnerFils ?? 0;
    else if (r.payoutStatus === "on_hold") row.holdFils += r.partnerFils ?? 0;
    else if (r.payoutStatus === "paid") row.paidFils += r.partnerFils ?? 0;
    byCompany.set(r.companyId, row);
  }

  const allCompanies = await prisma.inspectionCompany.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return NextResponse.json({
    now: now.toISOString(),
    summary,
    rows: filtered,
    total: filtered.length,
    companyPayouts: [...byCompany.values()].sort((a, b) => b.dueFils - a.dueFils),
    companies: allCompanies,
  });
}
