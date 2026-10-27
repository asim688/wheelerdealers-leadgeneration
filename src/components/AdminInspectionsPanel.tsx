"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminInspectionsResponse,
  AdminInspectionJob,
} from "@/lib/types";

/**
 * Admin "Jobs Management" — list, filter, assign inspectors and track the
 * status of vehicle-inspection jobs, plus a collapsible inspector roster.
 */

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "payment_pending", label: "Payment Pending" },
  { key: "available", label: "Available" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In Progress" },
  { key: "report_submitted", label: "Report Submitted" },
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
  const [inspectorId, setInspectorId] = useState("");
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
      if (inspectorId) p.set("inspectorId", inspectorId);
      if (debouncedQ) p.set("q", debouncedQ);
      const res = await fetch(`/api/admin/inspections?${p.toString()}`);
      if (res.status === 401) return onUnauthorized();
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, status, inspectorId, debouncedQ, onUnauthorized]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, inspectorId, debouncedQ]);

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
    const header = ["Job ID", "Status", "Customer", "Mobile", "Vehicle", "Inspector", "Scheduled", "Location"];
    const rows = data.jobs.map((j) => [
      j.jobCode,
      j.status,
      j.customerName,
      j.customerMobile,
      j.vehicle,
      j.inspector?.name ?? "Unassigned",
      j.scheduledAt ? `${new Date(j.scheduledAt).toLocaleDateString()} ${j.scheduledSlot ?? ""}` : "",
      j.location,
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

  const inspectors = data?.inspectors ?? [];
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
          <button onClick={exportCsv} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Export
          </button>
        </div>
      </div>

      {showPricing && <PricingSettings onClose={() => setShowPricing(false)} onUnauthorized={onUnauthorized} />}
      {showInspectors && <CompaniesManager onClose={() => setShowInspectors(false)} onChanged={fetchJobs} onUnauthorized={onUnauthorized} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search job ID, customer, vehicle…"
          className="min-w-[220px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <select value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500">
          <option value="">All companies</option>
          <option value="unassigned">Unassigned</option>
          {inspectors.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Date &amp; Time</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
            ) : !data || data.jobs.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-400">No jobs match your filters.</td></tr>
            ) : (
              data.jobs.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  inspectors={inspectors}
                  saving={savingId === j.id}
                  onAssign={(inspId) => patchJob(j.id, { assignedInspectorId: inspId })}
                  onStatus={(s) => patchJob(j.id, { status: s })}
                  onRenew={() => renewJob(j.id, j.jobCode)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

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
  inspectors,
  saving,
  onAssign,
  onStatus,
  onRenew,
}: {
  job: AdminInspectionJob;
  inspectors: Array<{ id: string; name: string }>;
  saving: boolean;
  onAssign: (inspectorId: string) => void;
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
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">{job.jobCode}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-neutral-800">{job.customerName}</p>
        <a href={`tel:${job.customerMobile}`} className="text-xs text-red-600 hover:underline">{job.customerMobile}</a>
      </td>
      <td className="px-4 py-3 text-neutral-700">
        {job.vehicle}
        <p className="text-xs text-neutral-400">{job.location}</p>
      </td>
      <td className="px-4 py-3">
        <select
          value={job.inspector?.id ?? ""}
          disabled={saving}
          onChange={(e) => onAssign(e.target.value)}
          className="max-w-[150px] rounded-md border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-red-500"
        >
          <option value="">Unassigned</option>
          {inspectors.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
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
          {job.status.replace(/_/g, " ")}
        </span>
        {isExpired && (
          <p className="mt-1 text-[11px] font-semibold text-amber-600">expired — not visible to companies</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          {job.status === "report_submitted" && (
            <button
              onClick={() => onStatus("completed")}
              disabled={saving}
              className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            >
              Finalize &amp; send report
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

// --- Companies manager (multi-tenant) ----------------------------------------

interface AdminCompany {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  emirate: string | null;
  pocName: string | null;
  pocMobile: string | null;
  tradeLicense: string | null;
  areas: string | null;
  approvalStatus: string;
  active: boolean;
  inspectorCount: number;
  jobsAssigned: number;
  jobsCompleted: number;
  documents: Array<{ id: string; kind: string; label: string | null; fileName: string; sizeBytes: number }>;
  createdAt: string;
}

const DOC_KIND_LABEL: Record<string, string> = {
  trade_license: "Trade License",
  vat_certificate: "VAT Certificate",
};

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

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
                <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-neutral-800">{c.name}</p>
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
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
