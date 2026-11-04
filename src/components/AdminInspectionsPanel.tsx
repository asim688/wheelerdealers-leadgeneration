"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type {
  AdminInspectionsResponse,
  AdminInspectionJob,
} from "@/lib/types";
import ReportReview from "./ReportReview";

/**
 * Admin "Jobs Management" — list and filter vehicle-inspection jobs by
 * company, track their status, and manage inspection companies.
 */

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "payment_pending", label: "Payment Pending" },
  { key: "available", label: "Available" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In Progress" },
  { key: "report_submitted", label: "Awaiting Verification" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_STYLES: Record<string, string> = {
  payment_pending: "bg-neutral-100 text-neutral-500",
  available: "bg-purple-100 text-purple-700",
  open: "bg-neutral-100 text-neutral-600",
  accepted: "bg-blue-100 text-blue-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  report_submitted: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminInspectionsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminInspectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showManagers, setShowManagers] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInspectors, setShowInspectors] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) p.set("status", status);
      if (companyId) p.set("companyId", companyId);
      if (managerId) p.set("managerId", managerId);
      if (debouncedQ) p.set("q", debouncedQ);
      const res = await fetch(`/api/admin/inspections?${p.toString()}`);
      if (res.status === 401) return onUnauthorized();
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, status, companyId, managerId, debouncedQ, onUnauthorized]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, companyId, managerId, debouncedQ]);

  async function patchJob(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/inspections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await fetchJobs();
      } else {
        const err = await res.json().catch(() => ({}));
        window.alert(err.error || "Could not update this job.");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function renewJob(id: string, jobCode: string) {
    const sure = window.confirm(
      `Renew ${jobCode}? It will go back to the live pool with a fresh acceptance window and all eligible companies will be alerted again.`,
    );
    if (sure) await patchJob(id, { renew: true });
  }

  function exportCsv() {
    if (!data) return;
    const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB") : "");
    const header = [
      "Job ID", "Status", "Review", "Customer", "Mobile", "Email", "Vehicle", "VIN", "Address",
      "Company", "Inspector", "Account manager", "Scheduled", "Booked", "Accepted", "Started",
      "Report submitted", "Verified at", "Verified by", "Return note", "Fee", "Payment", "Partner payout", "Commission",
    ];
    const rows = data.jobs.map((j) => [
      j.jobCode,
      j.status,
      reviewLabel(j),
      j.customerName,
      j.customerMobile,
      j.customerEmail,
      j.vehicle,
      j.vin ?? "",
      j.address ?? j.location,
      j.company?.name ?? "Unassigned",
      j.inspector?.name ?? "",
      j.accountManager?.name ?? "",
      j.scheduledAt ? `${new Date(j.scheduledAt).toLocaleDateString("en-GB")} ${j.scheduledSlot ?? ""}` : "",
      d(j.createdAt),
      d(j.acceptedAt),
      d(j.startedAt),
      d(j.reportSubmittedAt),
      d(j.review?.verifiedAt),
      j.review?.verifiedByName ?? "",
      j.review?.returnNote ?? "",
      j.fee ?? "",
      j.paymentStatus ?? "",
      j.partnerPayout ?? "",
      j.commission ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const companies = data?.companies ?? [];
  const counts = data?.statusCounts ?? {};
  const revenue = data?.revenue ?? 0;
  const payouts = data?.payouts ?? 0;
  const commission = data?.commission ?? 0;
  const currency = data?.currency ?? "AED";

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-neutral-900">{counts.all ?? 0}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Total jobs</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-green-700">{counts.completed ?? 0}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Completed</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-neutral-900">
            {currency} {revenue.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Revenue (completed)</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-700">
            {currency} {payouts.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Partner payouts</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-red-700">
            {currency} {commission.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Commission</p>
        </div>
      </div>

      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => {
            const c = t.key ? counts[t.key] : counts.all;
            return (
              <button
                key={t.key || "all"}
                onClick={() => setStatus(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  status === t.key ? "bg-red-600 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {t.label}
                {typeof c === "number" && <span className="ml-1 opacity-70">{c}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPricing((s) => !s)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            Pricing
          </button>
          <button onClick={() => setShowInspectors((s) => !s)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            Manage Companies
          </button>
          <button onClick={() => setShowManagers((s) => !s)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            Account Managers
          </button>
          <button onClick={exportCsv} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Export
          </button>
        </div>
      </div>

      {showPricing && <PricingSettings onClose={() => setShowPricing(false)} onUnauthorized={onUnauthorized} />}
      {showInspectors && <CompaniesManager onClose={() => setShowInspectors(false)} onChanged={fetchJobs} onUnauthorized={onUnauthorized} />}
      {showManagers && <AccountManagersPanel onClose={() => setShowManagers(false)} onChanged={fetchJobs} onUnauthorized={onUnauthorized} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search job ID, customer, email, vehicle, VIN…"
          className="min-w-[220px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500">
          <option value="">All companies</option>
          <option value="unassigned">Unassigned</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(data?.managers?.length ?? 0) > 0 && (
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500">
            <option value="">All account managers</option>
            {data!.managers!.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Account Manager</th>
              <th className="px-4 py-3">Date &amp; Time</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
            ) : !data || data.jobs.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-neutral-400">No jobs match your filters.</td></tr>
            ) : (
              data.jobs.map((j) => (
                <Fragment key={j.id}>
                  <JobRow
                    job={j}
                    saving={savingId === j.id}
                    expanded={expanded === j.id}
                    onToggle={() => setExpanded((cur) => (cur === j.id ? null : j.id))}
                    onReview={() => setReviewJobId(j.id)}
                    onStatus={(s) => patchJob(j.id, { status: s })}
                    onRenew={() => renewJob(j.id, j.jobCode)}
                  />
                  {expanded === j.id && (
                    <tr className="border-b border-neutral-100 bg-neutral-50/70">
                      <td colSpan={9} className="px-4 pb-4 pt-1">
                        <JobDetails job={j} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reviewJobId && <ReportReview jobId={reviewJobId} onClose={() => setReviewJobId(null)} onChanged={() => void fetchJobs()} />}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span>{data.total} jobs · page {data.page} of {data.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-neutral-300 px-3 py-1.5 disabled:opacity-40">Prev</button>
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-neutral-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({
  job,
  saving,
  expanded,
  onToggle,
  onReview,
  onStatus,
  onRenew,
}: {
  job: AdminInspectionJob;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReview: () => void;
  onStatus: (status: string) => void;
  onRenew: () => void;
}) {
  // A job still sitting in the pool past its window is invisible to companies
  // until a super admin renews it.
  const isExpired =
    job.status === "available" && !!job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now();
  const canRenew =
    isExpired || ["cancelled", "accepted", "assigned"].includes(job.status);

  return (
    <tr className={`border-b border-neutral-50 last:border-0 ${saving ? "opacity-50" : ""}`}>
      <td className="whitespace-nowrap px-4 py-3">
        <button onClick={onToggle} className="font-mono text-xs text-neutral-600 hover:text-red-600" title="Show all details">
          {expanded ? "▾" : "▸"} {job.jobCode}
        </button>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-neutral-800">{job.customerName}</p>
        <a href={`tel:${job.customerMobile}`} className="text-xs text-red-600 hover:underline">{job.customerMobile}</a>
      </td>
      <td className="px-4 py-3 text-neutral-700">
        {job.vehicle}
        <p className="text-xs text-neutral-400">{job.location}</p>
      </td>
      <td className="px-4 py-3">
        {job.company ? (
          <p className="font-medium text-neutral-800">{job.company.name}</p>
        ) : (
          <span className="text-xs text-neutral-400">Unassigned</span>
        )}
        {job.inspector && <p className="text-xs text-neutral-500">{job.inspector.name}</p>}
      </td>
      <td className="px-4 py-3 text-neutral-700">
        {job.accountManager?.name ?? <span className="text-xs text-neutral-400">{job.company ? "Super admin" : "—"}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
        {job.scheduledAt ? (
          <>
            <p>{new Date(job.scheduledAt).toLocaleDateString()}</p>
            <p className="text-xs text-neutral-400">{job.scheduledSlot}</p>
          </>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            job.paymentStatus === "paid"
              ? "bg-green-50 text-green-700"
              : job.paymentStatus === "waived"
                ? "bg-neutral-100 text-neutral-500"
                : "bg-amber-50 text-amber-700"
          }`}
          title={job.paymentRef ? `Ref: ${job.paymentRef}` : undefined}
        >
          {job.paymentStatus === "paid"
            ? `paid ${job.currency} ${job.fee ?? ""}`
            : job.paymentStatus || "pending"}
        </span>
        {job.paidAt && (
          <p className="mt-1 text-[11px] text-neutral-400">
            {new Date(job.paidAt).toLocaleString()}
            {job.paymentProvider ? ` · ${job.paymentProvider}` : ""}
          </p>
        )}
        {job.partnerPayout != null && (
          <p className="mt-1 text-[11px] text-neutral-400">payout {job.partnerPayout}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[job.status] || "bg-neutral-100"}`}>
          {job.status === "report_submitted" ? "awaiting verification" : job.status.replace(/_/g, " ")}
        </span>
        {isExpired && (
          <p className="mt-1 text-[11px] font-semibold text-amber-600">expired — not visible to companies</p>
        )}
        {job.status !== "report_submitted" && reviewLabel(job) && (
          <p className="mt-1 text-[11px] font-semibold text-neutral-500">{reviewLabel(job)}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          {job.status === "report_submitted" ? (
            <button
              onClick={onReview}
              disabled={saving}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              Review &amp; verify
            </button>
          ) : (job.review || job.status === "completed") && (
            <button onClick={onReview} className="text-xs font-medium text-neutral-600 hover:underline">
              Review history
            </button>
          )}
          {job.reportToken && (
            <a
              href={`/inspection/report/${job.reportToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-red-600 hover:underline"
            >
              View report
            </a>
          )}
          {canRenew && (
            <button
              onClick={onRenew}
              disabled={saving}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                isExpired
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Renew job
            </button>
          )}
          {job.status !== "cancelled" && job.status !== "completed" ? (
            <button onClick={() => onStatus("cancelled")} disabled={saving} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
              Cancel
            </button>
          ) : job.status === "cancelled" ? (
            <button onClick={() => onStatus("available")} disabled={saving} className="text-xs font-medium text-neutral-500 hover:underline disabled:opacity-40">
              Reopen
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// --- Pricing settings ---------------------------------------------------------

function PricingSettings({ onClose, onUnauthorized }: { onClose: () => void; onUnauthorized: () => void }) {
  const [customerPrice, setCustomerPrice] = useState("");
  const [partnerPayout, setPartnerPayout] = useState("");
  const [jobOpenHours, setJobOpenHours] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (res.status === 401) return onUnauthorized();
        if (res.ok) {
          const data = await res.json();
          setCustomerPrice(String(data.customerPrice));
          setPartnerPayout(String(data.partnerPayout));
          if (data.jobOpenHours) setJobOpenHours(String(data.jobOpenHours));
          if (data.currency) setCurrency(data.currency);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [onUnauthorized]);

  const price = Number(customerPrice) || 0;
  const payout = Number(partnerPayout) || 0;
  const commission = Math.max(price - payout, 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPrice: price,
          partnerPayout: payout,
          jobOpenHours: Number(jobOpenHours) || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) setSaved(true);
      else setError(data.error || "Could not save pricing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-900">Inspection Pricing</h3>
        <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">Close</button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <form onSubmit={save} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Customer price ({currency})</label>
            <input value={customerPrice} onChange={(e) => setCustomerPrice(e.target.value)} type="number" min="1" required className="w-36 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Partner payout ({currency})</label>
            <input value={partnerPayout} onChange={(e) => setPartnerPayout(e.target.value)} type="number" min="0" required className="w-36 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
          </div>
          <div className="pb-2 text-sm text-neutral-600">
            Commission: <strong>{currency} {commission.toLocaleString()}</strong> per job
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Job live window (hours)</label>
            <input value={jobOpenHours} onChange={(e) => setJobOpenHours(e.target.value)} type="number" min="1" max="720" placeholder="1" className="w-36 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
          </div>
          <button type="submit" disabled={busy || payout > price} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          {payout > price && <p className="pb-2 text-xs text-red-600">Payout cannot exceed customer price.</p>}
          {saved && <p className="pb-2 text-xs text-green-600">Saved ✓ — applies to new bookings.</p>}
          {error && <p className="pb-2 text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

/** Short review state for a job ("" when no report yet). */
function reviewLabel(j: AdminInspectionJob): string {
  if (j.status === "report_submitted") return "awaiting verification";
  if (j.review?.verifiedAt) return `verified by ${j.review.verifiedByName ?? "Wheeler Dealers"}`;
  if (j.review?.returnedAt && j.status === "in_progress") return "returned to inspector";
  return "";
}

/** Every recorded detail of a job (expanded row). */
function JobDetails({ job: j }: { job: AdminInspectionJob }) {
  const d = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const rows: Array<[string, React.ReactNode]> = [
    ["Customer", `${j.customerName} · ${j.customerMobile} · ${j.customerEmail}`],
    ["Vehicle", `${j.vehicle}${j.vin ? ` · VIN ${j.vin}` : ""}`],
    ["Address", j.address || j.location || "—"],
    ["Company", j.company?.name ?? "Unassigned"],
    ["Inspector", j.inspector ? `${j.inspector.name}${j.inspectorPhone ? ` · ${j.inspectorPhone}` : ""}` : "—"],
    ["Account manager", j.accountManager?.name ?? (j.company ? "Not assigned — super admin verifies" : "—")],
    ["Booked", d(j.createdAt)],
    ["Accepted", d(j.acceptedAt)],
    ["Inspection started", d(j.startedAt)],
    ["Report submitted", d(j.reportSubmittedAt)],
    ["Verified", j.review?.verifiedAt ? `${d(j.review.verifiedAt)} · ${j.review.verifiedByName ?? ""}` : "—"],
    ["Sent to customer", d(j.review?.sentAt)],
    ["Return note", j.review?.returnNote ?? "—"],
    ["Payment", `${j.paymentStatus ?? "pending"}${j.fee != null ? ` · ${j.currency} ${j.fee}` : ""}${j.paymentProvider ? ` · ${j.paymentProvider}` : ""}${j.paymentRef ? ` · ref ${j.paymentRef}` : ""}`],
    ["Partner payout / commission", `${j.partnerPayout ?? "—"} / ${j.commission ?? "—"}`],
  ];
  return (
    <div className="grid gap-x-6 gap-y-1.5 rounded-xl border border-neutral-200 bg-white p-4 text-xs sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[9.5rem_1fr] gap-2">
          <span className="text-neutral-500">{k}</span>
          <span className="break-words text-neutral-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

// --- Companies manager (multi-tenant) ----------------------------------------

interface AdminCompany {
  id: string;
  name: string;
  details: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  lat: number | null;
  lng: number | null;
  pocName: string | null;
  pocMobile: string | null;
  pocEmail: string | null;
  tradeLicense: string | null;
  areas: string | null;
  services: string | null;
  bankAccountTitle: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  bankName: string | null;
  bankBranch: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  pocEmailVerifiedAt: string | null;
  pocMobileVerifiedAt: string | null;
  missingDocs: string[];
  payoutGaps: string[];
  approvalStatus: string;
  active: boolean;
  inspectorCount: number;
  jobsAssigned: number;
  jobsCompleted: number;
  documents: Array<{ id: string; kind: string; label: string | null; fileName: string; sizeBytes: number; createdAt: string }>;
  createdAt: string;
}

const DOC_KIND_LABEL: Record<string, string> = {
  trade_license: "Trade License",
  vat_certificate: "VAT Certificate",
  iban_letter: "Bank IBAN Letter",
};

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function CompaniesManager({
  onClose,
  onChanged,
  onUnauthorized,
}: {
  onClose: () => void;
  onChanged: () => void;
  onUnauthorized: () => void;
}) {
  const [list, setList] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/companies");
      if (res.status === 401) return onUnauthorized();
      if (res.ok) setList((await res.json()).companies);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const [actionError, setActionError] = useState("");

  async function patch(id: string, body: Record<string, unknown>) {
    setActionError("");
    const res = await fetch(`/api/admin/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return onUnauthorized();
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error || "Could not update the company.");
    }
    await load();
    onChanged();
  }

  const pendingCount = list.filter((c) => c.approvalStatus === "pending").length;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-neutral-900">Inspection Companies</h3>
          <p className="text-xs text-neutral-500">
            Companies self-register at <span className="font-mono">/company</span>.
            {pendingCount > 0 && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {pendingCount} pending approval
              </span>
            )}
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">Close</button>
      </div>

      {actionError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}
      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-neutral-400">No companies registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Point of Contact</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-center">Inspectors</th>
                <th className="px-3 py-2 text-center">Jobs Assigned</th>
                <th className="px-3 py-2 text-center">Jobs Completed</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <Fragment key={c.id}>
                <tr className={`border-b border-neutral-50 last:border-0 ${openId === c.id ? "bg-neutral-50/60" : ""}`}>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
                      className="text-left font-medium text-neutral-800 hover:text-red-600"
                      title="View all registration details"
                    >
                      {c.name}
                    </button>
                    <p className="truncate text-xs text-neutral-500">
                      {c.email}
                      {c.tradeLicense ? ` · TL: ${c.tradeLicense}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.documents.length === 0 ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">No documents</span>
                      ) : (
                        c.documents.map((d) => (
                          <a
                            key={d.id}
                            href={`/api/admin/companies/${c.id}/documents/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={d.fileName}
                            className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                          >
                            {DOC_KIND_LABEL[d.kind] ?? d.label ?? d.fileName}
                          </a>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-neutral-700">{c.pocName || "—"}</p>
                    {c.pocMobile && (
                      <a href={`tel:${c.pocMobile}`} className="text-xs text-red-600 hover:underline">{c.pocMobile}</a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {[c.city, c.emirate].filter(Boolean).join(", ") || c.areas || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold text-neutral-800">{c.inspectorCount}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-blue-700">{c.jobsAssigned}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-green-700">{c.jobsCompleted}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        c.approvalStatus === "approved"
                          ? "bg-green-100 text-green-700"
                          : c.approvalStatus === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.approvalStatus}
                    </span>
                    {!c.active && (
                      <span className="ml-1 rounded bg-neutral-100 px-1.5 text-[10px] text-neutral-500">inactive</span>
                    )}
                    {c.payoutGaps.length > 0 && (
                      <span className="mt-1 block w-fit rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title={`Missing: ${c.payoutGaps.join(", ")}`}>
                        payout incomplete
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          openId === c.id ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        {openId === c.id ? "Hide" : "Details"}
                      </button>
                      {c.approvalStatus === "pending" && (
                        <button onClick={() => patch(c.id, { approvalStatus: "approved" })} className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700">
                          Approve
                        </button>
                      )}
                      {c.approvalStatus === "approved" && (
                        <button onClick={() => patch(c.id, { approvalStatus: "suspended" })} className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50">
                          Suspend
                        </button>
                      )}
                      {c.approvalStatus === "suspended" && (
                        <button onClick={() => patch(c.id, { approvalStatus: "approved" })} className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
                          Reinstate
                        </button>
                      )}
                      <button
                        onClick={() => patch(c.id, { active: !c.active })}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          c.active ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100" : "border-green-300 bg-green-50 text-green-700"
                        }`}
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
                {openId === c.id && (
                  <tr className="border-b border-neutral-100 bg-neutral-50/60">
                    <td colSpan={8} className="px-3 pb-4 pt-1">
                      {/* Fixed to the visible card width so it doesn't scroll with the wide table. */}
                      <div className="w-[calc(100vw-22rem)] max-w-[1040px] min-w-[560px]">
                        <CompanyDetails company={c} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Full registration record for one company (what the company filled in) ─ */

function CompanyDetails({ company: c }: { company: AdminCompany }) {
  const mapUrl =
    c.lat != null && c.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
      : [c.address, c.city, c.emirate].some(Boolean)
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address, c.city, c.emirate].filter(Boolean).join(", "))}`
        : null;
  const registered = new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hasBank = [c.bankAccountTitle, c.bankAccountNumber, c.bankIban, c.bankName, c.bankBranch].some(Boolean);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DetailGroup title="Company">
        <DetailRow k="Company name" v={c.name} />
        <DetailRow k="Company details" v={c.details} />
        <DetailRow k="Company email" v={c.email} href={`mailto:${c.email}`} verifiedAt={c.emailVerifiedAt} />
        <DetailRow k="Company mobile" v={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} verifiedAt={c.phoneVerifiedAt} />
        <DetailRow k="Trade license no." v={c.tradeLicense} />
        <DetailRow k="Services" v={c.services} />
        <DetailRow k="Registered" v={registered} />
        <DetailRow k="Account status" v={`${c.approvalStatus}${c.active ? "" : " · login inactive"}`} />
      </DetailGroup>

      <DetailGroup title="Company documents">
        {c.documents.length === 0 ? (
          <p className="text-xs text-amber-700">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {c.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-800">{DOC_KIND_LABEL[d.kind] ?? d.label ?? "Document"}</p>
                  <p className="truncate text-[11px] text-neutral-500">{d.fileName} · {fmtBytes(d.sizeBytes)}</p>
                </div>
                <a
                  href={`/api/admin/companies/${c.id}/documents/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
        {c.missingDocs.map((m) => (
          <p key={m} className="mt-1 text-[11px] text-amber-700">{m} missing</p>
        ))}
      </DetailGroup>

      <DetailGroup title="Location">
        <DetailRow k="Address" v={c.address} />
        <DetailRow k="City" v={c.city} />
        <DetailRow k="Emirate" v={c.emirate} />
        <DetailRow k="Service areas" v={c.areas} />
        <DetailRow k="Map pin" v={c.lat != null && c.lng != null ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : null} href={mapUrl ?? undefined} />
      </DetailGroup>

      <DetailGroup title="Point of Contact (gets job alerts)">
        <DetailRow k="PoC name" v={c.pocName} />
        <DetailRow k="PoC mobile (WhatsApp)" v={c.pocMobile} href={c.pocMobile ? `https://wa.me/${c.pocMobile.replace(/\D/g, "")}` : undefined} verifiedAt={c.pocMobileVerifiedAt} />
        <DetailRow k="PoC email" v={c.pocEmail} href={c.pocEmail ? `mailto:${c.pocEmail}` : undefined} verifiedAt={c.pocEmailVerifiedAt} />
      </DetailGroup>

      <DetailGroup title="Payout details">
        {c.payoutGaps.length > 0 && (
          <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            Can&apos;t accept new jobs until complete. Missing: {c.payoutGaps.join(", ")}.
          </p>
        )}
        {hasBank ? (
          <>
            <DetailRow k="Account title" v={c.bankAccountTitle} />
            <DetailRow k="Account number" v={c.bankAccountNumber} mono />
            <DetailRow k="IBAN" v={c.bankIban} mono />
            <DetailRow k="Bank name" v={c.bankName} />
            <DetailRow k="Bank branch" v={c.bankBranch} />
          </>
        ) : (
          <p className="text-xs text-neutral-500">Not provided — commissions cannot be settled until the company adds bank details.</p>
        )}
      </DetailGroup>

      <DetailGroup title="Marketplace activity">
        <DetailRow k="Inspectors" v={String(c.inspectorCount)} />
        <DetailRow k="Jobs assigned" v={String(c.jobsAssigned)} />
        <DetailRow k="Jobs completed" v={String(c.jobsCompleted)} />
      </DetailGroup>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({
  k,
  v,
  href,
  mono = false,
  verifiedAt,
}: {
  k: string;
  v: string | null | undefined;
  href?: string;
  mono?: boolean;
  /** When provided (even null), shows a Verified / Not verified badge. */
  verifiedAt?: string | null;
}) {
  const text = v && v.trim() ? v : null;
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1 text-xs">
      <span className="text-neutral-500">
        {k}
        {verifiedAt !== undefined && text && (
          verifiedAt ? (
            <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-semibold text-green-700" title={`Verified ${new Date(verifiedAt).toLocaleString("en-GB")}`}>✓ verified</span>
          ) : (
            <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">not verified</span>
          )
        )}
      </span>
      {text ? (
        href ? (
          <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={`break-words text-red-600 hover:underline ${mono ? "font-mono" : ""}`}>
            {text}
          </a>
        ) : (
          <span className={`break-words text-neutral-800 ${mono ? "font-mono" : ""}`}>{text}</span>
        )
      ) : (
        <span className="text-neutral-400">—</span>
      )}
    </div>
  );
}

// --- Account Managers (Wheeler Dealers staff who verify reports) -------------

interface AdminManager {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  verified: boolean;
  createdAt: string;
  companies: Array<{ id: string; name: string }>;
  awaitingReview: number;
}

function AccountManagersPanel({
  onClose,
  onChanged,
  onUnauthorized,
}: {
  onClose: () => void;
  onChanged: () => void;
  onUnauthorized: () => void;
}) {
  const [managers, setManagers] = useState<AdminManager[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; accountManagerId: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [formCompanies, setFormCompanies] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/managers");
      if (res.status === 401) return onUnauthorized();
      if (res.ok) {
        const d = await res.json();
        setManagers(d.managers);
        setCompanies(d.companies);
      }
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) {
        onUnauthorized();
        return false;
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Something went wrong.");
        return false;
      }
      await load();
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/admin/managers", "POST", { ...form, companyIds: formCompanies })) {
      setForm({ name: "", email: "", phone: "", password: "" });
      setFormCompanies([]);
      setShowAdd(false);
    }
  }

  async function resetPassword(m: AdminManager) {
    const pw = window.prompt(`New password for ${m.name} (min 6 characters):`);
    if (pw) await call(`/api/admin/managers/${m.id}`, "PATCH", { password: pw });
  }

  const ownerName = (companyId: string) => {
    const owner = companies.find((c) => c.id === companyId)?.accountManagerId;
    return owner ? managers.find((m) => m.id === owner)?.name : null;
  };

  function CompanyPicker({ selected, onChange, forManager }: { selected: string[]; onChange: (ids: string[]) => void; forManager?: string }) {
    return (
      <div className="flex flex-wrap gap-2">
        {companies.length === 0 && <p className="text-xs text-neutral-400">No inspection companies yet.</p>}
        {companies.map((c) => {
          const on = selected.includes(c.id);
          const other = c.accountManagerId && c.accountManagerId !== forManager ? ownerName(c.id) : null;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on ? "border-red-600 bg-red-50 text-red-700" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
              title={other ? `Currently with ${other} — selecting moves it` : undefined}
            >
              {on ? "✓ " : ""}
              {c.name}
              {other && !on ? <span className="ml-1 text-neutral-400">({other})</span> : null}
            </button>
          );
        })}
      </div>
    );
  }

  const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-neutral-900">Account Managers</h3>
          <p className="text-xs text-neutral-500">
            Wheeler Dealers staff who verify inspection reports. Each manager sees only the companies assigned here and
            signs in at <span className="font-mono">/manager</span>. Companies without a manager are verified by the super admin.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd((s) => !s)} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
            {showAdd ? "Cancel" : "+ Add account manager"}
          </button>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">Close</button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showAdd && (
        <form onSubmit={create} className="mb-5 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="Full name *" className={input} />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required type="email" placeholder="Email *" className={input} />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required type="tel" placeholder="Mobile * (UAE, 05X XXX XXXX)" className={input} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={6} type="password" placeholder="Password * (min 6)" className={input} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">Assign inspection companies</p>
            <CompanyPicker selected={formCompanies} onChange={setFormCompanies} />
          </div>
          <p className="text-xs text-neutral-500">The manager gets an email with the sign-in link and verifies their email and mobile at first sign-in. Share the password with them yourself.</p>
          <button type="submit" disabled={busy} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Creating…" : "Create account manager"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : managers.length === 0 ? (
        <p className="text-sm text-neutral-400">No account managers yet — all reports are verified by the super admin.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {managers.map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {m.name}
                    {!m.active && <span className="ml-2 rounded bg-neutral-100 px-1.5 text-[10px] text-neutral-500">inactive</span>}
                    {m.verified ? (
                      <span className="ml-2 rounded bg-green-100 px-1.5 text-[10px] font-semibold text-green-700">✓ verified</span>
                    ) : (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">verification pending</span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">{m.email} · {m.phone ?? "—"}</p>
                  {editing !== m.id && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.companies.length === 0 ? (
                        <span className="text-xs text-amber-700">No companies assigned</span>
                      ) : (
                        m.companies.map((c) => (
                          <span key={c.id} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">{c.name}</span>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.awaitingReview > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{m.awaitingReview} awaiting</span>
                  )}
                  <button
                    onClick={() => {
                      setEditing(editing === m.id ? null : m.id);
                      setEditCompanies(m.companies.map((c) => c.id));
                    }}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    {editing === m.id ? "Cancel" : "Assign companies"}
                  </button>
                  <button onClick={() => resetPassword(m)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100">
                    Reset password
                  </button>
                  <button
                    onClick={() => call(`/api/admin/managers/${m.id}`, "PATCH", { active: !m.active })}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${m.active ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100" : "border-green-300 bg-green-50 text-green-700"}`}
                  >
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
              {editing === m.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <CompanyPicker selected={editCompanies} onChange={setEditCompanies} forManager={m.id} />
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (await call(`/api/admin/managers/${m.id}`, "PATCH", { companyIds: editCompanies })) setEditing(null);
                    }}
                    className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save assignment"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
