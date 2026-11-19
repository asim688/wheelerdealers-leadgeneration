"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtAed } from "@/lib/commission";

/**
 * Payment Management (Super Admin, Phase 1). Cards, transactions, pending payouts and company payouts.
 * The Admin pays partners by bank transfer and records it here ("Paid" + bank reference).
 * Amounts are shown in AED; "Gross" always includes the 5% VAT.
 */

interface Row {
  id: string;
  jobCode: string;
  customer: string;
  company: string | null;
  companyId: string | null;
  grossFils: number;
  vatFils: number;
  netFils: number;
  commissionLabel: string;
  commissionFils: number | null;
  partnerFils: number | null;
  refundedFils: number;
  paymentStatus: string;
  payoutStatus: string;
  eligibleAt: string | null;
  paidAt: string | null;
  payoutRef: string | null;
  paidByName: string | null;
  holdReason: string | null;
  createdAt: string;
}

interface Summary {
  totalReceivedFils: number; totalReceivedCount: number; vatFils: number; commissionEarnedFils: number;
  payableFils: number; dueNowFils: number; dueNowCount: number; waitingFils: number; onHoldFils: number; onHoldCount: number;
  paidOutFils: number; paidOutCount: number; refundedFils: number; refundedCount: number; refundRequestCount: number;
}

interface CompanyPayout { id: string; name: string; bank: string | null; jobs: number; dueFils: number; waitingFils: number; holdFils: number; paidFils: number }

interface Payload {
  summary: Summary;
  rows: Row[];
  total: number;
  companyPayouts: CompanyPayout[];
  companies: Array<{ id: string; name: string }>;
}

interface Detail {
  payment: { id: string };
  invoice: { number: string; url: string } | null;
  company: { name: string; bankAccountTitle: string | null; bankAccountNumber: string | null; bankIban: string | null; bankName: string | null; bankBranch: string | null } | null;
  events: Array<{ id: string; type: string; by: string | null; role: string | null; detail: string | null; at: string }>;
}

type Tab = "transactions" | "pending" | "refunds" | "companies";

const PAYOUT_STYLE: Record<string, string> = {
  not_eligible: "bg-neutral-100 text-neutral-500",
  pending: "bg-amber-100 text-amber-800",
  due: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-700",
  on_hold: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};
const PAYOUT_LABEL: Record<string, string> = {
  not_eligible: "No company yet",
  pending: "Waiting",
  due: "Due — pay now",
  paid: "Paid",
  on_hold: "On hold",
  cancelled: "Cancelled (refunded)",
};

const dt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

export default function AdminPaymentsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("transactions");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [paying, setPaying] = useState<Row | null>(null);
  const [holding, setHolding] = useState<Row | null>(null);
  const [timeline, setTimeline] = useState<Row | null>(null);
  const [refunding, setRefunding] = useState<Row | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const qs = useCallback(
    (extra?: Record<string, string>) => {
      const p = new URLSearchParams();
      if (dq) p.set("q", dq);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (companyId) p.set("companyId", companyId);
      if (status) p.set("status", status);
      for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
      return p.toString();
    },
    [dq, from, to, companyId, status],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?${qs()}`);
      if (res.status === 401) return onUnauthorized();
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [qs, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>): Promise<boolean> {
    setError("");
    const res = await fetch(`/api/admin/payments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) {
      onUnauthorized();
      return false;
    }
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not update this payment.");
      return false;
    }
    await load();
    return true;
  }

  const s = data?.summary;
  const rows = (data?.rows ?? []).filter((r) =>
    tab === "pending"
      ? ["pending", "due", "on_hold"].includes(r.payoutStatus) && r.partnerFils != null
      : tab === "refunds"
        ? r.paymentStatus === "refund_requested" || r.refundedFils > 0
        : true,
  );

  const card = (label: string, value: string, sub?: string, tone = "text-neutral-900") => (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );

  const input = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {card("Payments received", s ? `AED ${fmtAed(s.totalReceivedFils)}` : "—", s ? `${s.totalReceivedCount} payments · gross, VAT included` : undefined)}
        {card("Due to pay now", s ? `AED ${fmtAed(s.dueNowFils)}` : "—", s ? `${s.dueNowCount} payouts ready (3 h after report sent)` : undefined, "text-blue-700")}
        {card("Partner amounts payable", s ? `AED ${fmtAed(s.payableFils)}` : "—", s ? `waiting AED ${fmtAed(s.waitingFils)} · on hold AED ${fmtAed(s.onHoldFils)}` : undefined, "text-amber-700")}
        {card("Paid out to companies", s ? `AED ${fmtAed(s.paidOutFils)}` : "—", s ? `${s.paidOutCount} payouts` : undefined, "text-green-700")}
        {card("WD commission earned", s ? `AED ${fmtAed(s.commissionEarnedFils)}` : "—", "excl. VAT · reports delivered", "text-red-700")}
        {card("VAT collected (5%)", s ? `AED ${fmtAed(s.vatFils)}` : "—", "included in payments received")}
        {card("Refunds", s ? `AED ${fmtAed(s.refundedFils)}` : "—", s ? `${s.refundedCount} refunded · ${s.refundRequestCount} waiting for you` : undefined, s && s.refundRequestCount > 0 ? "text-red-700" : undefined)}
        {card("Gateway fees (WD expense)", "—", "Added with the gateway integration (Phase 2)", "text-neutral-400")}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["transactions", "All transactions"], ["pending", "Pending payouts"], ["refunds", "Refunds"], ["companies", "Company payouts"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-red-600 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"}`}
          >
            {label}
          </button>
        ))}
        <a
          href={`/api/admin/payments?${qs({ format: "csv" })}`}
          className="ml-auto rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job ID, customer, email…" className={`${input} min-w-[220px] flex-1`} />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input}>
          <option value="">All companies</option>
          <option value="unassigned">Unassigned</option>
          {data?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {tab === "transactions" && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">All payout statuses</option>
            {Object.entries(PAYOUT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>
      <p className="text-xs text-neutral-400">Dates are Dubai time. All amounts in AED; “Gross” includes 5% VAT. Commission is calculated on the amount excluding VAT.</p>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "companies" ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Company</th><th className="px-4 py-3">Bank (for the transfer)</th>
                <th className="px-4 py-3 text-right">Due now</th><th className="px-4 py-3 text-right">Waiting</th>
                <th className="px-4 py-3 text-right">On hold</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-center">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
              ) : !data || data.companyPayouts.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No company payouts yet.</td></tr>
              ) : (
                data.companyPayouts.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{c.bank ?? <span className="text-amber-700">No bank details</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmtAed(c.dueFils)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{fmtAed(c.waitingFils)}</td>
                    <td className="px-4 py-3 text-right text-red-700">{fmtAed(c.holdFils)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{fmtAed(c.paidFils)}</td>
                    <td className="px-4 py-3 text-center text-neutral-600">{c.jobs}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-3">Job</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Company</th>
                <th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">VAT</th><th className="px-3 py-3">Rate</th>
                <th className="px-3 py-3 text-right">WD</th><th className="px-3 py-3 text-right">Company</th>
                <th className="px-3 py-3">Payout</th><th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-neutral-400">No payments match.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-50 align-top last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs text-neutral-800">{r.jobCode}</p>
                      <p className="text-[11px] text-neutral-400">{dt(r.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3 text-neutral-800">{r.customer}</td>
                    <td className="px-3 py-3 text-neutral-700">{r.company ?? <span className="text-neutral-400">Unassigned</span>}</td>
                    <td className="px-3 py-3 text-right font-medium">{fmtAed(r.grossFils)}</td>
                    <td className="px-3 py-3 text-right text-neutral-500">{fmtAed(r.vatFils)}</td>
                    <td className="px-3 py-3 text-neutral-600">{r.commissionLabel}</td>
                    <td className="px-3 py-3 text-right font-semibold text-red-700">{fmtAed(r.commissionFils)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-900">{fmtAed(r.partnerFils)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAYOUT_STYLE[r.payoutStatus] ?? "bg-neutral-100 text-neutral-600"}`}>{PAYOUT_LABEL[r.payoutStatus] ?? r.payoutStatus}</span>
                      {r.payoutStatus === "pending" && r.eligibleAt && <p className="mt-0.5 text-[10px] text-neutral-400">due {dt(r.eligibleAt)}</p>}
                      {r.payoutStatus === "paid" && <p className="mt-0.5 text-[10px] text-neutral-500">{r.payoutRef} · {r.paidByName}</p>}
                      {r.payoutStatus === "on_hold" && r.holdReason && <p className="mt-0.5 max-w-[180px] text-[10px] text-red-600">{r.holdReason}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {r.payoutStatus === "due" && (
                          <button onClick={() => setPaying(r)} className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700">Mark paid</button>
                        )}
                        {["pending", "due"].includes(r.payoutStatus) && (
                          <button onClick={() => setHolding(r)} className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50">Hold</button>
                        )}
                        {r.payoutStatus === "on_hold" && (
                          <button onClick={() => void act(r.id, { action: "release" })} className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">Release</button>
                        )}
                        {r.paymentStatus !== "refunded" && (
                          <button onClick={() => setRefunding(r)} className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${r.paymentStatus === "refund_requested" ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}>
                            {r.paymentStatus === "refund_requested" ? "Refund requested" : "Refund"}
                          </button>
                        )}
                        <button onClick={() => setTimeline(r)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100">Timeline</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {paying && <PayDialog row={paying} onClose={() => setPaying(null)} onConfirm={async (reference) => { if (await act(paying.id, { action: "paid", reference })) setPaying(null); }} />}
      {holding && <HoldDialog row={holding} onClose={() => setHolding(null)} onConfirm={async (reason) => { if (await act(holding.id, { action: "hold", reason })) setHolding(null); }} />}
      {refunding && (
        <RefundDialog
          row={refunding}
          onClose={() => setRefunding(null)}
          onConfirm={async (body) => {
            setError("");
            const res = await fetch(`/api/admin/payments/${refunding.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (res.status === 401) return onUnauthorized();
            if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "Could not record the refund.");
            setRefunding(null);
            await load();
          }}
        />
      )}
      {timeline && <TimelineDialog row={timeline} onClose={() => setTimeline(null)} />}
    </div>
  );
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-neutral-600">{sub}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

function PayDialog({ row, onClose, onConfirm }: { row: Row; onClose: () => void; onConfirm: (ref: string) => Promise<void> }) {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => {
    void fetch(`/api/admin/payments/${row.id}`).then(async (r) => r.ok && setDetail(await r.json()));
  }, [row.id]);
  const c = detail?.company;
  return (
    <Modal title="Record bank transfer" sub={`${row.company} · ${row.jobCode}`} onClose={onClose}>
      <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
        Transfer <b>AED {fmtAed(row.partnerFils)}</b> to the company, then enter the bank reference below.
      </p>
      {c && (
        <dl className="mt-3 space-y-1 text-xs text-neutral-600">
          <div className="flex justify-between gap-3"><dt>Account title</dt><dd className="text-right font-medium text-neutral-800">{c.bankAccountTitle ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt>Bank</dt><dd className="text-right font-medium text-neutral-800">{[c.bankName, c.bankBranch].filter(Boolean).join(", ") || "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt>IBAN</dt><dd className="text-right font-mono font-medium text-neutral-800">{c.bankIban ?? "—"}</dd></div>
        </dl>
      )}
      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Bank transfer reference *
        <input value={ref} onChange={(e) => setRef(e.target.value)} autoFocus placeholder="e.g. ENBD-TRF-20261118-001" className="mt-1.5 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
        <button
          disabled={busy || ref.trim().length < 3}
          onClick={async () => { setBusy(true); await onConfirm(ref.trim()); setBusy(false); }}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Mark as paid"}
        </button>
      </div>
    </Modal>
  );
}

function RefundDialog({ row, onClose, onConfirm }: { row: Row; onClose: () => void; onConfirm: (b: { kind: "full" | "partial"; amount?: number; reason: string; reference: string }) => Promise<void> }) {
  const remaining = row.grossFils - row.refundedFils;
  const [kind, setKind] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(row.paymentStatus === "refund_requested" ? "Customer cancelled before a company accepted" : "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const valid = kind === "full" || (Number.isFinite(n) && n > 0 && Math.round(n * 100) <= remaining);
  const input = "mt-1.5 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";
  return (
    <Modal title="Record refund" sub={`${row.customer} · ${row.jobCode}`} onClose={onClose}>
      <p className="mt-2 text-sm text-neutral-500">
        Send the money back from your Stripe dashboard, then record it here. The customer paid AED {fmtAed(row.grossFils)}
        {row.refundedFils > 0 ? ` (AED ${fmtAed(row.refundedFils)} already refunded)` : ""}.
        {row.payoutStatus === "paid" && <span className="mt-1 block font-medium text-red-600">The company has already been paid for this job — the refund must be recovered from them.</span>}
      </p>
      <div className="mt-4 inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm font-medium">
        {(["full", "partial"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-4 py-2 ${kind === k ? "bg-red-600 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>
            {k === "full" ? `Full · AED ${fmtAed(remaining)}` : "Partial amount"}
          </button>
        ))}
      </div>
      {kind === "partial" && (
        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Amount to refund (AED) *
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={`up to ${fmtAed(remaining)}`} className={input} />
        </label>
      )}
      <label className="mt-3 block text-sm font-medium text-neutral-700">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
      </label>
      <label className="mt-3 block text-sm font-medium text-neutral-700">
        Stripe refund ID / reference <span className="font-normal text-neutral-400">(optional)</span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. re_3Nx…" className={input} />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
        <button
          disabled={busy || !valid}
          onClick={async () => { setBusy(true); await onConfirm({ kind, amount: kind === "partial" ? n : undefined, reason, reference }); setBusy(false); }}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Record refund"}
        </button>
      </div>
    </Modal>
  );
}

function HoldDialog({ row, onClose, onConfirm }: { row: Row; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Hold payout" sub={`${row.company ?? "Unassigned"} · ${row.jobCode}`} onClose={onClose}>
      <p className="mt-2 text-sm text-neutral-500">The payout will not be due until you release the hold. The reason is saved in the audit trail.</p>
      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Reason *
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className="mt-1.5 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
        <button
          disabled={busy || reason.trim().length < 3}
          onClick={async () => { setBusy(true); await onConfirm(reason.trim()); setBusy(false); }}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Place hold"}
        </button>
      </div>
    </Modal>
  );
}

function TimelineDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    void fetch(`/api/admin/payments/${row.id}`).then(async (r) => r.ok && setD(await r.json()));
  }, [row.id]);
  return (
    <Modal title="Payment timeline" sub={`${row.jobCode} · AED ${fmtAed(row.grossFils)}`} onClose={onClose}>
      {!d ? (
        <p className="mt-4 text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
        {d.invoice && (
          <p className="mt-3 text-sm text-neutral-700">
            Tax invoice: <a href={d.invoice.url} target="_blank" rel="noreferrer" className="font-medium text-red-600 hover:underline">{d.invoice.number}</a>
          </p>
        )}
        <ol className="mt-4 space-y-3 border-l-2 border-neutral-200 pl-4">
          {d.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
              <p className="text-sm font-medium capitalize text-neutral-900">{e.type.replace(/_/g, " ")}</p>
              {e.detail && <p className="text-xs text-neutral-600">{e.detail}</p>}
              <p className="text-[11px] text-neutral-400">{e.by ?? "—"} · {dt(e.at)}</p>
            </li>
          ))}
        </ol>
        </>
      )}
      <div className="mt-5 text-right"><button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Close</button></div>
    </Modal>
  );
}
