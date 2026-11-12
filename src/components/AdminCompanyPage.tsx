"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import { LoginForm } from "./AdminDashboard";
import { CompanyActionButtons, CompanyDetails, fmtDateTime, type AdminCompany, type CompanyActivityEvent } from "./adminCompanyShared";
import { StatusBadges } from "./AdminCompaniesList";
import type { AdminInspectionJob } from "@/lib/types";

/**
 * One company's own page (Super Admin). Left menu:
 *   Inspections → All / Assigned / Completed,  Company details,  Inspectors.
 * Opens from Details (or the company name) in Manage Companies.
 */

interface CompanyInspector {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  approvalStatus: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  jobs: number;
  jobsCompleted: number;
}

interface CompanyPayload {
  company: AdminCompany;
  accountManager: { id: string; name: string; email: string } | null;
  jobCounts: { all: number; assigned: number; completed: number };
  inspectors: CompanyInspector[];
  activity: CompanyActivityEvent[];
}

type View = "all" | "assigned" | "completed" | "details" | "inspectors";

const JOB_VIEWS: Record<"all" | "assigned" | "completed", { label: string; status: string }> = {
  all: { label: "All", status: "" },
  assigned: { label: "Assigned", status: "accepted,assigned,in_progress,report_submitted" },
  completed: { label: "Completed", status: "completed" },
};

const STATUS_STYLES: Record<string, string> = {
  payment_pending: "bg-neutral-100 text-neutral-500",
  available: "bg-purple-100 text-purple-700",
  accepted: "bg-blue-100 text-blue-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  report_submitted: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminCompanyPage({ companyId }: { companyId: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<CompanyPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<View>("details");
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`);
      if (res.status === 401) return setAuthed(false);
      setAuthed(true);
      if (res.status === 404) return setNotFound(true);
      if (res.ok) setData(await res.json());
    } catch {
      setAuthed(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }, []);

  async function patch(body: Record<string, unknown>) {
    setActionError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return setAuthed(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setActionError(d.error || "Could not update the company.");
    }
    await load();
  }

  if (authed === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-400">Loading…</div>;
  }
  if (!authed) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-300 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col items-center gap-3">
            <BrandLogo />
            <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">Super Admin · Company</span>
          </div>
          <LoginForm onAuthed={() => { setAuthed(true); void load(); }} />
        </div>
      </main>
    );
  }
  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100 text-neutral-600">
        <p>Company not found.</p>
        <Link href="/admin/inspections?section=companies" className="font-semibold text-red-600 hover:underline">← Back to companies</Link>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-400">Loading…</div>;
  }

  const { company: c, jobCounts, inspectors } = data;
  const pick = (v: View) => {
    setView(v);
    setMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-neutral-200 bg-white transition-transform md:static md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Company</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Super Admin</p>
          </div>
        </div>

        <div className="mx-3 mb-2 rounded-xl bg-neutral-50 p-3">
          <p className="truncate text-sm font-semibold text-neutral-900" title={c.name}>{c.name}</p>
          <div className="mt-1.5"><StatusBadges c={c} /></div>
        </div>

        <nav className="flex-1 px-3 pb-4">
          <p className="mb-1 mt-3 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-400">Inspections</p>
          {(["all", "assigned", "completed"] as const).map((k) => (
            <SideItem key={k} active={view === k} onClick={() => pick(k)} indent count={jobCounts[k]}>
              {JOB_VIEWS[k].label}
            </SideItem>
          ))}
          <div className="my-3 border-t border-neutral-100" />
          <SideItem active={view === "details"} onClick={() => pick("details")}>Company details</SideItem>
          <SideItem active={view === "inspectors"} onClick={() => pick("inspectors")} count={inspectors.length}>Inspectors</SideItem>
        </nav>

        <div className="border-t border-neutral-100 p-3">
          <Link href="/admin/inspections?section=companies" className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
            ← All companies
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 md:hidden" aria-label="Open menu">
            ☰
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-neutral-900 sm:text-lg">{c.name}</h1>
            <p className="truncate text-xs text-neutral-500">
              {[c.city, c.emirate].filter(Boolean).join(", ") || c.email}
              {data.accountManager ? ` · Account manager: ${data.accountManager.name}` : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <CompanyActionButtons company={c} onPatch={patch} />
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100">Sign out</button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {actionError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

          {view === "details" && <CompanyDetails company={c} activity={data.activity} />}
          {view === "inspectors" && <InspectorsTable inspectors={inspectors} />}
          {(view === "all" || view === "assigned" || view === "completed") && (
            <CompanyJobs key={view} companyId={companyId} view={view} onUnauthorized={() => setAuthed(false)} />
          )}
        </main>
      </div>
    </div>
  );
}

function SideItem({
  active,
  indent,
  count,
  onClick,
  children,
}: {
  active: boolean;
  indent?: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center justify-between rounded-lg py-2 pr-3 text-left text-[15px] transition-colors ${
        indent ? "pl-6" : "pl-3"
      } ${active ? "bg-red-50 font-semibold text-red-700" : "font-medium text-neutral-700 hover:bg-neutral-100"}`}
    >
      <span>{children}</span>
      {typeof count === "number" && <span className={`text-xs ${active ? "text-red-500" : "text-neutral-400"}`}>{count}</span>}
    </button>
  );
}

function CompanyJobs({
  companyId,
  view,
  onUnauthorized,
}: {
  companyId: string;
  view: "all" | "assigned" | "completed";
  onUnauthorized: () => void;
}) {
  const [jobs, setJobs] = useState<AdminInspectionJob[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const p = new URLSearchParams({ page: String(page), pageSize: "20", companyId });
      if (JOB_VIEWS[view].status) p.set("status", JOB_VIEWS[view].status);
      const res = await fetch(`/api/admin/inspections?${p.toString()}`);
      if (cancelled) return;
      if (res.status === 401) return onUnauthorized();
      if (res.ok) {
        const d = await res.json();
        setJobs(d.jobs);
        setPages(d.totalPages);
        setTotal(d.total);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, view, page, onUnauthorized]);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">
        Inspections <span className="font-normal text-neutral-400">· {JOB_VIEWS[view].label}</span>
        {!loading && <span className="ml-1.5 text-sm font-normal text-neutral-400">({total})</span>}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Date &amp; Time</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No inspections here yet.</td></tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">{j.jobCode}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{j.customerName}</p>
                    <p className="text-xs text-neutral-500">{j.customerMobile}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-neutral-800">{j.vehicle}</p>
                    <p className="text-xs text-neutral-400">{j.location}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{j.inspector?.name ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {j.scheduledAt ? new Date(j.scheduledAt).toLocaleDateString("en-GB") : "—"}
                    {j.scheduledSlot && <p className="text-xs text-neutral-400">{j.scheduledSlot}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{j.paymentStatus ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[j.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {j.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
          <span>page {page} of {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 disabled:opacity-40">Prev</button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InspectorsTable({ inspectors }: { inspectors: CompanyInspector[] }) {
  const badge = (at: string | null) =>
    at ? (
      <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-semibold text-green-700" title={`Verified ${fmtDateTime(at)}`}>✓ verified</span>
    ) : (
      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">not verified</span>
    );
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">
        Inspectors <span className="text-sm font-normal text-neutral-400">({inspectors.length})</span>
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3 text-center">Jobs</th>
              <th className="px-4 py-3 text-center">Completed</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody>
            {inspectors.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">This company has not added any inspectors yet.</td></tr>
            ) : (
              inspectors.map((i) => (
                <tr key={i.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{i.name}</td>
                  <td className="px-4 py-3 text-neutral-700">{i.email}{badge(i.emailVerifiedAt)}</td>
                  <td className="px-4 py-3 text-neutral-700">{i.phone ?? "—"}{i.phone && badge(i.phoneVerifiedAt)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-blue-700">{i.jobs}</td>
                  <td className="px-4 py-3 text-center font-semibold text-green-700">{i.jobsCompleted}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.active && i.approvalStatus === "approved" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {i.active ? i.approvalStatus : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{fmtDateTime(i.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
