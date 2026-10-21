"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import InspectionRunner from "./InspectionRunner";
import type {
  AvailableJob,
  InspectorJob,
  InspectorJobDetail,
  InspectorProfile,
  InspectorStats,
} from "@/lib/types";

type View = "loading" | "login" | "register" | "dashboard" | "job" | "inspect";
type Filter = "all" | "available" | "open" | "today" | "completed" | "payments";

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

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InspectorPortal() {
  const [view, setView] = useState<View>("loading");
  const [inspector, setInspector] = useState<InspectorProfile | null>(null);
  const [stats, setStats] = useState<InspectorStats>({ open: 0, today: 0, completed: 0 });
  const [jobs, setJobs] = useState<InspectorJob[]>([]);
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeJob, setActiveJob] = useState<InspectorJobDetail | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState("");

  const loadJobs = useCallback(async (f: Filter) => {
    setLoadingJobs(true);
    try {
      const listFilter = f === "available" || f === "payments" ? (f === "payments" ? "completed" : "all") : f;
      const [jobsRes, availRes] = await Promise.all([
        fetch(`/api/inspector/jobs?filter=${listFilter}`),
        fetch("/api/inspector/jobs/available"),
      ]);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setStats(data.stats);
        setJobs(data.jobs);
      }
      if (availRes.ok) {
        const data = await availRes.json();
        setAvailableJobs(data.jobs);
      } else {
        setAvailableJobs([]);
      }
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  async function acceptJob(id: string) {
    setAcceptingId(id);
    setAcceptError("");
    try {
      const res = await fetch(`/api/inspector/jobs/${id}/accept`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await loadJobs(filter);
      } else {
        setAcceptError(data.error || "Could not accept this job.");
        await loadJobs(filter);
      }
    } catch {
      setAcceptError("Network error — please try again.");
    } finally {
      setAcceptingId(null);
    }
  }

  // Bootstrap: who am I?
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inspector/me");
        if (res.ok) {
          const data = await res.json();
          setInspector(data.inspector);
          setView("dashboard");
          await loadJobs("all");
        } else {
          setView("login");
        }
      } catch {
        setView("login");
      }
    })();
  }, [loadJobs]);

  async function onLoggedIn(profile: InspectorProfile) {
    setInspector(profile);
    setView("dashboard");
    await loadJobs("all");
  }

  async function logout() {
    await fetch("/api/inspector/logout", { method: "POST" });
    setInspector(null);
    setJobs([]);
    setView("login");
  }

  function pickFilter(f: Filter) {
    setFilter(f);
    setView("dashboard");
    setSidebarOpen(false);
    void loadJobs(f);
  }

  async function openJob(id: string) {
    const res = await fetch(`/api/inspector/jobs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setActiveJob(data.job as InspectorJobDetail);
      setView("job");
    }
  }

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (view === "login") {
    return <LoginForm onLoggedIn={onLoggedIn} onRegister={() => setView("register")} />;
  }

  if (view === "register") {
    return <RegisterForm onBack={() => setView("login")} />;
  }

  if (view === "inspect" && activeJob) {
    return (
      <InspectionRunner
        jobId={activeJob.id}
        jobCode={activeJob.jobCode}
        vehicle={activeJob.vehicle.label}
        onExit={() => setView("job")}
        onCompleted={() => {
          setView("dashboard");
          void loadJobs(filter);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Sidebar */}
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
          <SideLink active={filter === "all"} onClick={() => pickFilter("all")}>Dashboard</SideLink>
          <SideLink active={filter === "available"} onClick={() => pickFilter("available")} badge={stats.available}>Available Jobs</SideLink>
          <SideLink active={filter === "open"} onClick={() => pickFilter("open")} badge={stats.open}>Accepted Jobs</SideLink>
          <SideLink active={filter === "today"} onClick={() => pickFilter("today")} badge={stats.today}>Today&apos;s Jobs</SideLink>
          <SideLink active={filter === "completed"} onClick={() => pickFilter("completed")} badge={stats.completed}>Completed</SideLink>
          <SideLink active={filter === "payments"} onClick={() => pickFilter("payments")}>Payments</SideLink>
        </nav>

        <div className="absolute inset-x-4 bottom-4 space-y-2 text-sm">
          <p className="truncate text-xs text-neutral-400">{inspector?.email}</p>
          <button onClick={logout} className="w-full rounded-md px-3 py-2 text-left font-medium text-neutral-600 hover:bg-neutral-100">
            Sign out
          </button>
          <Link href="/" className="block px-3 text-xs text-neutral-400 hover:text-neutral-600">← Back to site</Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">☰</button>
          <h1 className="text-base font-semibold text-neutral-900 sm:text-lg">
            {view === "job" ? "Job Details" : "Dashboard"}
          </h1>
        </header>

        <main className="w-full flex-1 p-4 sm:p-6">
          {view === "job" && activeJob ? (
            <JobDetail
              job={activeJob}
              onBack={() => setView("dashboard")}
              onStart={() => setView("inspect")}
            />
          ) : filter === "available" ? (
            <AvailableJobsPanel
              jobs={availableJobs}
              loading={loadingJobs}
              acceptingId={acceptingId}
              error={acceptError}
              onAccept={acceptJob}
              onRefresh={() => void loadJobs(filter)}
            />
          ) : filter === "payments" ? (
            <PaymentsPanel stats={stats} jobs={jobs} loading={loadingJobs} />
          ) : (
            <Dashboard
              inspector={inspector}
              stats={stats}
              jobs={jobs}
              filter={filter}
              loading={loadingJobs}
              onPickFilter={pickFilter}
              onOpenJob={openJob}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// --- Dashboard --------------------------------------------------------------

function Dashboard({
  inspector,
  stats,
  jobs,
  filter,
  loading,
  onPickFilter,
  onOpenJob,
}: {
  inspector: InspectorProfile | null;
  stats: InspectorStats;
  jobs: InspectorJob[];
  filter: Filter;
  loading: boolean;
  onPickFilter: (f: Filter) => void;
  onOpenJob: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Welcome back{inspector ? `, ${inspector.name.split(" ")[0]}` : ""} 👋
        </h2>
        <p className="text-sm text-neutral-500">Here&apos;s your inspection workload.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Accepted jobs" value={stats.open} tone="blue" />
        <StatCard label="Today" value={stats.today} tone="amber" />
        <StatCard label="Completed" value={stats.completed} tone="green" />
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-neutral-900">{stats.thisWeek ?? 0}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Completed this week</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-neutral-900">
            {stats.avgScore != null ? `${stats.avgScore}` : "—"}
            <span className="text-sm text-neutral-400">/10</span>
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Avg. condition score</p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "open", "today", "completed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => onPickFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-red-600 text-white"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f === "today" ? "Today" : f}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">
            {filter === "today" ? "Today's Schedule" : "Jobs"}
          </div>
          {loading ? (
            <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-400">No jobs to show.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    onClick={() => onOpenJob(j.id)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                  >
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-sm font-bold text-neutral-900">
                        {j.scheduledSlot ? j.scheduledSlot.replace(/\s?[AP]M/, "") : "—"}
                      </p>
                      <p className="text-[10px] uppercase text-neutral-400">
                        {j.scheduledSlot?.match(/[AP]M/)?.[0] || ""}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">{j.vehicle}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {j.customerName} · {j.location || "—"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{j.jobCode}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[j.status] || "bg-neutral-100 text-neutral-600"}`}>
                      {statusLabel(j.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Marketplace: Available jobs ---------------------------------------------

function AvailableJobsPanel({
  jobs,
  loading,
  acceptingId,
  error,
  onAccept,
  onRefresh,
}: {
  jobs: AvailableJob[];
  loading: boolean;
  acceptingId: string | null;
  error: string;
  onAccept: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Available Jobs</h2>
          <p className="text-sm text-neutral-500">
            New inspections open to all approved companies — first to accept wins.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-md border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      )}

      {loading ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
          No inspections available right now — you&apos;ll be notified when a new job is posted.
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-600">
                    New Inspection Available
                  </p>
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
                  onClick={() => onAccept(j.id)}
                  disabled={acceptingId !== null}
                  className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {acceptingId === j.id ? "Accepting…" : "ACCEPT JOB"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Payments -----------------------------------------------------------------

function PaymentsPanel({
  stats,
  jobs,
  loading,
}: {
  stats: InspectorStats;
  jobs: InspectorJob[];
  loading: boolean;
}) {
  const currency = jobs[0]?.currency || "AED";
  const completed = jobs.filter((j) => ["completed", "report_submitted"].includes(j.status));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Payments</h2>
        <p className="text-sm text-neutral-500">Your earnings from completed inspections.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-green-700">
            {currency} {(stats.earned ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Earned (finalised jobs)</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-700">
            {currency} {(stats.pendingEarnings ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-neutral-500">Pending (jobs in progress)</p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">
          Completed Inspections
        </div>
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

// --- Job detail -------------------------------------------------------------

function JobDetail({
  job,
  onBack,
  onStart,
}: {
  job: InspectorJobDetail;
  onBack: () => void;
  onStart: () => void;
}) {
  const dest = encodeURIComponent(job.location.full || "");
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${dest}`;
  const started = !!job.startedAt;
  const done = job.status === "completed";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={onBack} className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
        ← Back to jobs
      </button>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs text-neutral-400">{job.jobCode}</p>
            <h2 className="text-xl font-bold text-neutral-900">{job.vehicle.label}</h2>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[job.status] || "bg-neutral-100"}`}>
            {statusLabel(job.status)}
          </span>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <InfoBlock title="Customer">
            <p className="font-medium text-neutral-900">{job.customer.name}</p>
            <a href={`tel:${job.customer.mobile}`} className="block text-red-600 hover:underline">{job.customer.mobile}</a>
            <a href={`mailto:${job.customer.email}`} className="block text-neutral-500 hover:underline">{job.customer.email}</a>
          </InfoBlock>

          <InfoBlock title="Appointment">
            <p className="font-medium text-neutral-900">
              {job.scheduledAt ? new Date(job.scheduledAt).toDateString() : "To be scheduled"}
            </p>
            <p className="text-neutral-500">{job.scheduledSlot || ""}</p>
          </InfoBlock>

          <InfoBlock title="Vehicle">
            <p className="text-neutral-700">{job.vehicle.label}</p>
            {job.vehicle.vin && <p className="font-mono text-xs text-neutral-500">VIN {job.vehicle.vin}</p>}
            <p className="text-xs text-neutral-500">
              {[job.vehicle.trim, job.vehicle.transmission, job.vehicle.fuelType].filter(Boolean).join(" · ")}
            </p>
          </InfoBlock>

          <InfoBlock title="Location">
            <p className="text-neutral-700">{job.location.full || "—"}</p>
            <div className="mt-1 flex gap-3 text-xs">
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">View map</a>
              <a href={navUrl} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">Navigate</a>
            </div>
          </InfoBlock>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`tel:${job.customer.mobile}`} className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Call Customer
          </a>
          <a href={navUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Navigate
          </a>
          {!done && (
            <button onClick={onStart} className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700">
              {started ? "Continue Inspection" : "Start Inspection"}
            </button>
          )}
          {done && (
            <button onClick={onStart} className="rounded-md border border-green-300 bg-green-50 px-6 py-2.5 text-sm font-semibold text-green-700">
              View Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Login ------------------------------------------------------------------

function LoginForm({ onLoggedIn, onRegister }: { onLoggedIn: (p: InspectorProfile) => void; onRegister: () => void }) {
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
      const res = await fetch("/api/inspector/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.inspector) onLoggedIn(data.inspector);
      else setError(data.error || "Login failed.");
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
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@wheelerdealers.test" className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" />
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••" className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" />
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-neutral-500">
          New inspection company?{" "}
          <button type="button" onClick={onRegister} className="font-semibold text-red-600 hover:underline">
            Apply to join
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

// --- Company registration ----------------------------------------------------

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

function RegisterForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    companyName: "",
    tradeLicense: "",
    contactPerson: "",
    phone: "",
    email: "",
    password: "",
    services: "",
    bankName: "",
    bankIban: "",
  });
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleArea(a: string) {
    setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (areas.length === 0) {
      setError("Select at least one service area.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/inspector/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, areas }),
      });
      const data = await res.json();
      if (res.ok && data.ok) setDone(true);
      else setError(data.error || "Registration failed. Please try again.");
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
            Thank you! Our team will review your company details and trade license. You&apos;ll
            receive an email once your account is approved.
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <p className="mt-2 text-sm font-semibold text-neutral-700">Partner with Wheeler Dealers</p>
          <p className="mt-1 text-xs text-neutral-500">Register your inspection company to receive jobs</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Company name *</label>
            <input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} required className={input} placeholder="Al Fahim Auto Inspection LLC" />
          </div>
          <div>
            <label className={label}>Trade license number *</label>
            <input value={form.tradeLicense} onChange={(e) => set("tradeLicense", e.target.value)} required className={input} placeholder="CN-1234567" />
          </div>
          <div>
            <label className={label}>Contact person *</label>
            <input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} required className={input} placeholder="Full name" />
          </div>
          <div>
            <label className={label}>Phone *</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required className={input} placeholder="+9715xxxxxxxx" />
          </div>
          <div>
            <label className={label}>Email *</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" required className={input} placeholder="ops@company.ae" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Password * <span className="font-normal text-neutral-400">(min 6 characters)</span></label>
            <input value={form.password} onChange={(e) => set("password", e.target.value)} type="password" required minLength={6} className={input} placeholder="••••••••" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Service areas *</label>
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
          <div className="sm:col-span-2">
            <label className={label}>Services offered <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.services} onChange={(e) => set("services", e.target.value)} className={input} placeholder="Pre-purchase inspection, diagnostics…" />
          </div>
          <div>
            <label className={label}>Bank name <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={input} placeholder="Emirates NBD" />
          </div>
          <div>
            <label className={label}>IBAN <span className="font-normal text-neutral-400">(optional)</span></label>
            <input value={form.bankIban} onChange={(e) => set("bankIban", e.target.value)} className={input} placeholder="AE07 0331 …" />
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

// --- small helpers ----------------------------------------------------------

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
  const tones = {
    blue: "text-blue-700",
    amber: "text-amber-700",
    green: "text-green-700",
  };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <p className={`text-3xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="space-y-0.5 text-sm">{children}</div>
    </div>
  );
}
