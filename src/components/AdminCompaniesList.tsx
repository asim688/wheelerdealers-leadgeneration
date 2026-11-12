"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CompanyActionButtons, DOC_KIND_LABEL, type AdminCompany } from "./adminCompanyShared";

/** Manage Companies: roster of inspection companies. Details (or the name) opens the company's own page. */
export default function AdminCompaniesList({
  onChanged,
  onUnauthorized,
}: {
  onChanged?: () => void;
  onUnauthorized: () => void;
}) {
  const [list, setList] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");

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
    onChanged?.();
  }

  const pendingCount = list.filter((c) => c.approvalStatus === "pending").length;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Inspection Companies</h2>
        <p className="text-xs text-neutral-500">
          Companies self-register at <span className="font-mono">/company</span>. Click a company or Details to open its page.
          {pendingCount > 0 && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {pendingCount} pending approval
            </span>
          )}
        </p>
      </div>

      {actionError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-neutral-400">No companies registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-2.5 py-2">Company</th>
                <th className="px-2.5 py-2">Point of Contact</th>
                <th className="px-2.5 py-2 text-center">Inspectors</th>
                <th className="px-2.5 py-2 text-center">Assigned</th>
                <th className="px-2.5 py-2 text-center">Completed</th>
                <th className="px-2.5 py-2">Status</th>
                <th className="px-2.5 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-2.5 py-2.5">
                    <Link
                      href={`/admin/inspections/companies/${c.id}`}
                      className="text-left font-medium text-neutral-800 hover:text-red-600"
                      title="Open company page"
                    >
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-neutral-500">
                      {c.email}
                      {c.tradeLicense ? ` · TL: ${c.tradeLicense}` : ""}
                    </p>
                    <p className="truncate text-xs text-neutral-400">{[c.city, c.emirate].filter(Boolean).join(", ") || c.areas || "No location"}</p>
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
                  <td className="px-2.5 py-2.5">
                    <p className="text-neutral-700">{c.pocName || "—"}</p>
                    {c.pocMobile && (
                      <a href={`tel:${c.pocMobile}`} className="text-xs text-red-600 hover:underline">{c.pocMobile}</a>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 text-center font-semibold text-neutral-800">{c.inspectorCount}</td>
                  <td className="px-2.5 py-2.5 text-center font-semibold text-blue-700">{c.jobsAssigned}</td>
                  <td className="px-2.5 py-2.5 text-center font-semibold text-green-700">{c.jobsCompleted}</td>
                  <td className="px-2.5 py-2.5">
                    <StatusBadges c={c} />
                    {c.verifiedByName && (
                      <p className="mt-1 text-[10px] text-neutral-400">verified by {c.verifiedByName}</p>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/admin/inspections/companies/${c.id}`}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Details
                      </Link>
                      <CompanyActionButtons company={c} onPatch={(body) => patch(c.id, body)} />
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

export function StatusBadges({ c }: { c: Pick<AdminCompany, "approvalStatus" | "active" | "payoutGaps"> }) {
  return (
    <>
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
      {!c.active && <span className="ml-1 rounded bg-neutral-100 px-1.5 text-[10px] text-neutral-500">inactive</span>}
      {c.payoutGaps.length > 0 && (
        <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title={`Missing: ${c.payoutGaps.join(", ")}`}>
          payout incomplete
        </span>
      )}
    </>
  );
}
