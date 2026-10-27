"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

// --- local types matching /api/company/* responses ---------------------------

interface CompanyProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  pocName: string | null;
  pocMobile: string | null;
  pocEmail: string | null;
  approvalStatus: string;
  active: boolean;
}

interface CompanyStats {
  open: number;
  today: number;
  completed: number;
  earned: number;
  pendingEarnings: number;
}

interface CompanyJob {
  id: string;
  jobCode: string;
  status: string;
  vehicle: string;
  location: string;
  customerName: string | null;
  customerMobile: string | null;
  address: string | null;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  inspector: { id: string; name: string } | null;
  payout: number | null;
  currency: string | null;
  completedAt: string | null;
}

interface PoolJob {
  id: string;
  jobCode: string;
  vehicle: string;
  location: string;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  expiresAt: string | null;
}

interface CompanyInspector {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  jobCount: number;
}

type View = "loading" | "login" | "register" | "dashboard";
type Tab = "all" | "available" | "open" | "today" | "completed" | "inspectors" | "payments";

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

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

// --- root ---------------------------------------------------------------------

export default function CompanyPortal() {
  const [view, setView] = useState<View>("loading");
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [stats, setStats] = useState<CompanyStats>({ open: 0, today: 0, completed: 0, earned: 0, pendingEarnings: 0 });
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [pool, setPool] = useState<PoolJob[]>([]);
  const [inspectors, setInspectors] = useState<CompanyInspector[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const loadAll = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const jobFilter = t === "open" || t === "today" || t === "completed" ? t : "all";
      const [jobsRes, poolRes, inspRes] = await Promise.all([
        fetch(`/api/company/jobs?filter=${jobFilter}`),
        fetch("/api/company/jobs/available"),
        fetch("/api/company/inspectors"),
      ]);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setStats(data.stats);
        setJobs(data.jobs);
      }
      if (poolRes.ok) {
        const data = await poolRes.json();
        setPool(data.jobs);
      } else {
        setPool([]);
      }
      if (inspRes.ok) {
        const data = await inspRes.json();
        setInspectors(data.inspectors);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/company/me");
        if (res.ok) {
          const data = await res.json();
          setCompany(data.company);
          setView("dashboard");
          await loadAll("all");
        } else {
          setView("login");
        }
      } catch {
        setView("login");
      }
    })();
  }, [loadAll]);

  function pickTab(t: Tab) {
    setTab(t);
    setNotice("");
    setSidebarOpen(false);
    void loadAll(t);
  }

  async function logout() {
    await fetch("/api/company/logout", { method: "POST" });
    setCompany(null);
    setJobs([]);
    setView("login");
  }

  async function acceptJob(id: string) {
    const res = await fetch(`/api/company/jobs/${id}/accept`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice("✅ Job accepted! Assign one of your inspectors from My Jobs.");
    } else {
      setNotice(data.error || "Could not accept this job.");
    }
    await loadAll(tab);
  }

  async function assignJob(jobId: string, inspectorId: string) {
    const res = await fetch(`/api/company/jobs/${jobId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectorId }),
    });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok ? "✅ Inspector assigned and notified." : data.error || "Could not assign inspector.");
    await loadAll(tab);
  }

  async function cancelJob(jobId: string) {
    const sure = window.confirm(
      "Cancel this job? It will go back to the live pool for OTHER companies — your company will be permanently excluded from re-accepting this job.",
    );
    if (!sure) return;
    const res = await fetch(`/api/company/jobs/${jobId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok ? "Job cancelled and relisted to other companies." : data.error || "Could not cancel job.");
    await loadAll(tab);
  }

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }
  if (view === "login") {
    return (
      <CompanyLogin
        onLoggedIn={async (p) => {
          setCompany(p);
          setView("dashboard");
          await loadAll("all");
        }}
        onRegister={() => setView("register")}
      />
    );
  }
  if (view === "register") {
    return <CompanyRegister onBack={() => setView("login")} />;
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 -translate-x-full border-r border-neutral-200 bg-white p-4 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <BrandLogo size="sm" />
          <button className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close">✕</button>
        </div>
        <p className="mt-1 text-xs font-medium text-neutral-400">Inspection Company Portal</p>

        <nav className="mt-6 space-y-1 text-sm">
          <SideLink active={tab === "all"} onClick={() => pickTab("all")}>Dashboard</SideLink>
          <SideLink active={tab === "available"} onClick={() => pickTab("available")} badge={pool.length}>Live Jobs</SideLink>
          <SideLink active={tab === "open"} onClick={() => pickTab("open")} badge={stats.open}>My Jobs</SideLink>
          <SideLink active={tab === "today"} onClick={() => pickTab("today")} badge={stats.today}>Today</SideLink>
          <SideLink active={tab === "completed"} onClick={() => pickTab("completed")} badge={stats.completed}>Completed</SideLink>
          <SideLink active={tab === "inspectors"} onClick={() => pickTab("inspectors")} badge={inspectors.length}>My Inspectors</SideLink>
          <SideLink active={tab === "payments"} onClick={() => pickTab("payments")}>Payments</SideLink>
        </nav>

        <div className="absolute inset-x-4 bottom-4 space-y-2 text-sm">
          <p className="truncate text-xs font-semibold text-neutral-600">{company?.name}</p>
          <p className="truncate text-xs text-neutral-400">{company?.email}</p>
          <button onClick={logout} className="w-full rounded-md px-3 py-2 text-left font-medium text-neutral-600 hover:bg-neutral-100">
            Sign out
          </button>
          <Link href="/" className="block px-3 text-xs text-neutral-400 hover:text-neutral-600">← Back to site</Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">☰</button>
          <h1 className="text-base font-semibold text-neutral-900 sm:text-lg">
            {tab === "available" ? "Live Jobs" : tab === "inspectors" ? "My Inspectors" : tab === "payments" ? "Payments" : "Dashboard"}
          </h1>
        </header>

        <main className="w-full flex-1 p-4 sm:p-6">
          {notice && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>
          )}
          {tab === "available" ? (
            <LiveJobsPanel jobs={pool} loading={loading} onAccept={acceptJob} onRefresh={() => void loadAll(tab)} />
          ) : tab === "inspectors" ? (
            <InspectorsPanel inspectors={inspectors} onChanged={() => void loadAll(tab)} />
          ) : tab === "payments" ? (
            <PaymentsPanel stats={stats} jobs={jobs} loading={loading} />
          ) : (
            <JobsPanel
              company={company}
              stats={stats}
              jobs={jobs}
              inspectors={inspectors}
              tab={tab}
              loading={loading}
              onPickTab={pickTab}
              onAssign={assignJob}
              onCancel={cancelJob}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// --- Dashboard / My Jobs ------------------------------------------------------

const ASSIGNABLE = ["accepted", "assigned"];
const CANCELLABLE = ["accepted", "assigned"];

function JobsPanel({
  company,
  stats,
  jobs,
  inspectors,
  tab,
  loading,
  onPickTab,
  onAssign,
  onCancel,
}: {
  company: CompanyProfile | null;
  stats: CompanyStats;
  jobs: CompanyJob[];
  inspectors: CompanyInspector[];
  tab: Tab;
  loading: boolean;
  onPickTab: (t: Tab) => void;
  onAssign: (jobId: string, inspectorId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  const activeInspectors = inspectors.filter((i) => i.active);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Welcome back{company ? `, ${company.name}` : ""} 👋
        </h2>
        <p className="text-sm text-neutral-500">Accept live jobs, assign your inspectors, track earnings.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Active jobs" value={stats.open} tone="blue" />
        <StatCard label="Today" value={stats.today} tone="amber" />
        <StatCard label="Completed" value={stats.completed} tone="green" />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "open", "today", "completed"] as Tab[]).map((f) => (
            <button
              key={f}
              onClick={() => onPickTab(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === f ? "bg-red-600 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f === "open" ? "Active" : f}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">Jobs</div>
          {loading ? (
            <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-400">No jobs to show — accept a job from Live Jobs.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {jobs.map((j) => (
                <li key={j.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">{j.vehicle}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {j.customerName || "Customer"} · {j.address || j.location}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        🗓 {j.scheduledAt ? new Date(j.scheduledAt).toDateString() : "Flexible"}
                        {j.scheduledSlot ? ` · ${j.scheduledSlot}` : ""}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{j.jobCode}</p>
                      {j.customerMobile && (
                        <a href={`tel:${j.customerMobile}`} className="text-xs text-red-600 hover:underline">
                          📞 {j.customerMobile}
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[j.status] || "bg-neutral-100 text-neutral-600"}`}>
                        {statusLabel(j.status)}
                      </span>
                      {j.payout != null && (
                        <p className="text-xs font-bold text-neutral-700">
                          {j.currency || "AED"} {j.payout.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {j.inspector ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        👷 {j.inspector.name}
                      </span>
                    ) : ASSIGNABLE.includes(j.status) ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        ⚠ No inspector assigned
                      </span>
                    ) : null}

                    {ASSIGNABLE.includes(j.status) && activeInspectors.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) onAssign(j.id, e.target.value);
                        }}
                        className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700"
                      >
                        <option value="" disabled>
                          {j.inspector ? "Reassign inspector…" : "Assign inspector…"}
                        </option>
                        {activeInspectors.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                    )}

                    {CANCELLABLE.includes(j.status) && (
                      <button
                        onClick={() => onCancel(j.id)}
                        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Cancel job
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Live jobs pool -------------------------------------------------------------

function LiveJobsPanel({
  jobs,
  loading,
  onAccept,
  onRefresh,
}: {
  jobs: PoolJob[];
  loading: boolean;
  onAccept: (id: string) => void;
  onRefresh: () => void;
}) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Live Jobs</h2>
          <p className="text-sm text-neutral-500">
            Open to all approved companies — first to accept wins. Jobs disappear when the window expires.
          </p>
        </div>
        <button onClick={onRefresh} className="rounded-md border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
          No live jobs right now — your Point of Contact will get a WhatsApp when a new job goes live.
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const left = timeLeft(j.expiresAt);
            return (
              <li key={j.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-600">Job Live</p>
                      {left && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">⏱ {left}</span>
                      )}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-neutral-900">{j.vehicle}</h3>
                    <div className="mt-1.5 space-y-0.5 text-sm text-neutral-600">
                      <p>📍 {j.location}</p>
                      <p>
                        🗓 {j.scheduledAt ? new Date(j.scheduledAt).toDateString() : "Flexible"}
                        {j.scheduledSlot ? ` · ${j.scheduledSlot}` : ""}
                      </p>
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] text-neutral-400">{j.jobCode}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setAcceptingId(j.id);
                      await onAccept(j.id);
                      setAcceptingId(null);
                    }}
                    disabled={acceptingId !== null}
                    className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {acceptingId === j.id ? "Accepting…" : "ACCEPT JOB"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- My Inspectors ---------------------------------------------------------------

function InspectorsPanel({
  inspectors,
  onChanged,
}: {
  inspectors: CompanyInspector[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/company/inspectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setForm({ name: "", email: "", phone: "", password: "" });
        setShowForm(false);
        onChanged();
      } else {
        setError(data.error || "Could not create inspector.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(i: CompanyInspector) {
    await fetch(`/api/company/inspectors/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !i.active }),
    });
    onChanged();
  }

  const input = "w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">My Inspectors</h2>
          <p className="text-sm text-neutral-500">
            Create logins for your inspectors — they sign in at <span className="font-mono">/inspector</span> to run jobs you assign.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          {showForm ? "Close" : "+ Add inspector"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="Inspector name *" className={input} />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" required placeholder="Email *" className={input} />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Mobile (optional)" className={input} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" required minLength={6} placeholder="Password * (min 6)" className={input} />
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="mt-4 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Creating…" : "Create inspector"}
          </button>
        </form>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white">
        {inspectors.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400">
            No inspectors yet — add your first inspector to start assigning jobs.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {inspectors.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{i.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {i.email}
                    {i.phone ? ` · ${i.phone}` : ""}
                  </p>
                </div>
                <span className="text-xs text-neutral-500">{i.jobCount} job{i.jobCount === 1 ? "" : "s"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {i.active ? "Active" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleActive(i)}
                  className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  {i.active ? "Disable" : "Enable"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Payments -------------------------------------------------------------------

function PaymentsPanel({ stats, jobs, loading }: { stats: CompanyStats; jobs: CompanyJob[]; loading: boolean }) {
  const currency = jobs[0]?.currency || "AED";
  const completed = jobs.filter((j) => ["completed", "report_submitted"].includes(j.status));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Payments</h2>
        <p className="text-sm text-neutral-500">Your company&apos;s earnings from completed inspections.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-green-700">{currency} {(stats.earned ?? 0).toLocaleString()}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Earned (finalised jobs)</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-700">{currency} {(stats.pendingEarnings ?? 0).toLocaleString()}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Pending (jobs in progress)</p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">Completed Inspections</div>
        {loading ? (
          <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>
        ) : completed.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400">No completed inspections yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {completed.map((j) => (
              <li key={j.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{j.vehicle}</p>
                  <p className="font-mono text-[11px] text-neutral-400">
                    {j.jobCode}
                    {j.completedAt ? ` · ${new Date(j.completedAt).toDateString()}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[j.status] || "bg-neutral-100 text-neutral-600"}`}>
                  {j.status === "completed" ? "Paid out" : "Awaiting review"}
                </span>
                <p className="w-24 text-right text-sm font-bold text-neutral-900">
                  {j.payout != null ? `${j.currency || "AED"} ${j.payout.toLocaleString()}` : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Login ----------------------------------------------------------------------

function CompanyLogin({
  onLoggedIn,
  onRegister,
}: {
  onLoggedIn: (p: CompanyProfile) => void;
  onRegister: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/company/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.company) {
        // fetch full profile
        const meRes = await fetch("/api/company/me");
        const me = meRes.ok ? await meRes.json() : { company: data.company };
        onLoggedIn(me.company);
      } else setError(data.error || "Login failed.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <p className="mt-2 text-sm text-neutral-500">Inspection Company Portal</p>
        </div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Company email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="ops@company.ae" className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" />
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••" className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" />
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-neutral-500">
          New inspection company?{" "}
          <button type="button" onClick={onRegister} className="font-semibold text-red-600 hover:underline">
            Register your company
          </button>
        </p>
        {isDev && (
          <p className="mt-4 text-center text-[11px] text-neutral-400">
            Demo: inspector@wheelerdealers.test / inspector1234
          </p>
        )}
      </form>
    </div>
  );
}

// --- Registration -----------------------------------------------------------------

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

const DOC_MAX_BYTES = 4 * 1024 * 1024;
const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

interface ExtraDoc {
  id: number;
  label: string;
  file: File | null;
}

function FileField({ file, onChange, label }: { file: File | null; onChange: (f: File | null) => void; label: string }) {
  return (
    <div>
      <label className="block cursor-pointer rounded-md border border-dashed border-neutral-300 px-3 py-3 text-sm hover:border-red-400 hover:bg-red-50/40">
        <input type="file" accept={DOC_ACCEPT} aria-label={label} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        {file ? (
          <span className="font-medium text-neutral-800">{file.name} <span className="font-normal text-neutral-400">({(file.size / 1024 / 1024).toFixed(1)} MB) · tap to change</span></span>
        ) : (
          <span className="text-neutral-500">Tap to attach a file <span className="text-neutral-400">(PDF, JPG or PNG, up to 4 MB)</span></span>
        )}
      </label>
    </div>
  );
}

function CompanyRegister({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    name: "",
    details: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    city: "",
    emirate: "",
    pocName: "",
    pocMobile: "",
    pocEmail: "",
    tradeLicense: "",
    services: "",
    bankAccountTitle: "",
    bankAccountNumber: "",
    bankIban: "",
    bankName: "",
    bankBranch: "",
  });
  const [areas, setAreas] = useState<string[]>([]);
  const [tradeFile, setTradeFile] = useState<File | null>(null);
  const [vatFile, setVatFile] = useState<File | null>(null);
  const [extras, setExtras] = useState<ExtraDoc[]>([]);
  const [uploadToken, setUploadToken] = useState("");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function updateExtra(id: number, patch: Partial<ExtraDoc>) {
    setExtras((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleArea(a: string) {
    setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const docs: Array<{ key: string; kind: string; label: string; file: File }> = [];
    if (!tradeFile) return setError("Please attach your Company Trade License.");
    if (!vatFile) return setError("Please attach your VAT Certificate.");
    docs.push({ key: "trade", kind: "trade_license", label: "Company Trade License", file: tradeFile });
    docs.push({ key: "vat", kind: "vat_certificate", label: "VAT Certificate", file: vatFile });
    for (const x of extras) {
      if (!x.file) continue;
      if (!x.label.trim()) return setError("Please name each additional document.");
      docs.push({ key: `extra-${x.id}`, kind: "other", label: x.label.trim(), file: x.file });
    }
    const tooBig = docs.find((d) => d.file.size > DOC_MAX_BYTES);
    if (tooBig) return setError(`"${tooBig.file.name}" is larger than 4 MB. Please attach a smaller file.`);

    setBusy(true);
    try {
      let token = uploadToken;
      if (!token) {
        const res = await fetch("/api/company/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, areas }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) return setError(data.error || "Registration failed. Please try again.");
        token = data.uploadToken as string;
        setUploadToken(token);
      }

      const sent = new Set(uploaded);
      for (const d of docs) {
        if (sent.has(d.key)) continue;
        const fd = new FormData();
        fd.append("token", token);
        fd.append("kind", d.kind);
        fd.append("label", d.label);
        fd.append("file", d.file);
        const up = await fetch("/api/company/register/documents", { method: "POST", body: fd });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) {
          setUploaded([...sent]);
          return setError(`Your application is saved, but "${d.label}" could not be uploaded: ${upData.error || "please try again"}. Press Submit again to retry.`);
        }
        sent.add(d.key);
      }
      setUploaded([...sent]);
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">✅</p>
          <h2 className="mt-3 text-lg font-bold text-neutral-900">Application submitted</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Thank you! The Wheeler Dealers team will review your company details. You&apos;ll be
            notified once your account is approved — then your Point of Contact starts receiving
            live job alerts.
          </p>
          <button onClick={onBack} className="mt-6 rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const input = "w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";
  const label = "mb-1.5 block text-sm font-medium text-neutral-700";
  const section = "text-xs font-bold uppercase tracking-wide text-neutral-400";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <p className="mt-2 text-sm font-semibold text-neutral-700">Partner with Wheeler Dealers</p>
          <p className="mt-1 text-xs text-neutral-500">Register your inspection company to receive live jobs</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <p className={`sm:col-span-2 ${section}`}>Company</p>
          <div className="sm:col-span-2">
            <label className={label}>Company name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required className={input} placeholder="Al Fahim Auto Inspection LLC" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Company details <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.details} onChange={(e) => set("details", e.target.value)} className={input} placeholder="Short description of your company" />
          </div>
          <div>
            <label className={label}>Company email *</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required className={input} placeholder="ops@company.ae" />
          </div>
          <div>
            <label className={label}>Company mobile *</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required className={input} placeholder="+9715xxxxxxxx" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Password * <span className="font-normal text-neutral-400">(min 6 characters)</span></label>
            <input value={form.password} onChange={(e) => set("password", e.target.value)} type="password" required minLength={6} className={input} placeholder="••••••••" />
          </div>
          <div>
            <label className={label}>Trade license <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.tradeLicense} onChange={(e) => set("tradeLicense", e.target.value)} className={input} placeholder="CN-1234567" />
          </div>
          <div>
            <label className={label}>Services <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.services} onChange={(e) => set("services", e.target.value)} className={input} placeholder="Pre-purchase inspection…" />
          </div>

          <p className={`sm:col-span-2 mt-2 ${section}`}>Company documents</p>
          <div className="sm:col-span-2">
            <label className={label}>Company Trade License *</label>
            <FileField file={tradeFile} onChange={setTradeFile} label="Company Trade License" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>VAT Certificate *</label>
            <FileField file={vatFile} onChange={setVatFile} label="VAT Certificate" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Additional documents <span className="font-normal text-neutral-400">(optional)</span></label>
            <p className="mb-2 text-xs text-neutral-500">If we need any other document, we will ask you to attach it.</p>
            <div className="space-y-3">
              {extras.map((x) => (
                <div key={x.id} className="space-y-2 rounded-md border border-neutral-200 p-3">
                  <div className="flex gap-2">
                    <input value={x.label} onChange={(e) => updateExtra(x.id, { label: e.target.value })} maxLength={80} className={input} placeholder="Document name, e.g. Insurance certificate" />
                    <button type="button" onClick={() => setExtras((cur) => cur.filter((y) => y.id !== x.id))} className="shrink-0 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Remove</button>
                  </div>
                  <FileField file={x.file} onChange={(f) => updateExtra(x.id, { file: f })} label={x.label || "Additional document"} />
                </div>
              ))}
              {extras.length < 6 && (
                <button type="button" onClick={() => setExtras((cur) => [...cur, { id: Date.now(), label: "", file: null }])} className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                  + Attach another document
                </button>
              )}
            </div>
          </div>

          <p className={`sm:col-span-2 mt-2 ${section}`}>Location</p>
          <div className="sm:col-span-2">
            <label className={label}>Address <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className={input} placeholder="Street, building, area" />
          </div>
          <div>
            <label className={label}>City</label>
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={input} placeholder="Dubai" />
          </div>
          <div>
            <label className={label}>Emirate</label>
            <select value={form.emirate} onChange={(e) => set("emirate", e.target.value)} className={input}>
              <option value="">Select…</option>
              {EMIRATES.map((em) => (
                <option key={em} value={em}>{em}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Service areas</label>
            <div className="flex flex-wrap gap-2">
              {EMIRATES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleArea(a)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    areas.includes(a)
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <p className={`sm:col-span-2 mt-2 ${section}`}>Point of Contact (gets job alerts)</p>
          <div>
            <label className={label}>PoC name *</label>
            <input value={form.pocName} onChange={(e) => set("pocName", e.target.value)} required className={input} placeholder="Full name" />
          </div>
          <div>
            <label className={label}>PoC mobile * <span className="font-normal text-neutral-400">(WhatsApp)</span></label>
            <input value={form.pocMobile} onChange={(e) => set("pocMobile", e.target.value)} required className={input} placeholder="+9715xxxxxxxx" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>PoC email <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.pocEmail} onChange={(e) => set("pocEmail", e.target.value)} type="email" className={input} placeholder="poc@company.ae" />
          </div>

          <p className={`sm:col-span-2 mt-2 ${section}`}>Payout details (optional)</p>
          <div className="sm:col-span-2">
            <label className={label}>Account title</label>
            <input value={form.bankAccountTitle} onChange={(e) => set("bankAccountTitle", e.target.value)} className={input} placeholder="Company account holder name" />
          </div>
          <div>
            <label className={label}>Account number</label>
            <input value={form.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value)} className={input} placeholder="1234567890" />
          </div>
          <div>
            <label className={label}>IBAN</label>
            <input value={form.bankIban} onChange={(e) => set("bankIban", e.target.value)} className={input} placeholder="AE07 0331 …" />
          </div>
          <div>
            <label className={label}>Bank name</label>
            <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={input} placeholder="Emirates NBD" />
          </div>
          <div>
            <label className={label}>Bank branch</label>
            <input value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} className={input} placeholder="Deira, Dubai" />
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className="mt-6 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
          {busy ? "Submitting…" : "Submit application"}
        </button>
        <p className="mt-4 text-center text-sm text-neutral-500">
          Already registered?{" "}
          <button type="button" onClick={onBack} className="font-semibold text-red-600 hover:underline">
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}

// --- small helpers -----------------------------------------------------------------

function SideLink({ active, onClick, badge, children }: { active?: boolean; onClick: () => void; badge?: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium transition-colors ${
        active ? "bg-red-50 text-red-700" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <span>{children}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-600">{badge}</span>
      )}
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "green" }) {
  const tones = { blue: "text-blue-700", amber: "text-amber-700", green: "text-green-700" };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <p className={`text-3xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  );
}
