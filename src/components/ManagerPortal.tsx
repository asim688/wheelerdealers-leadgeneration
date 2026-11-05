"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import VerifyField from "./VerifyField";
import ReportReview from "./ReportReview";
import { normaliseEmail, normaliseUaeMobile, verificationKey } from "@/lib/contactValidation";

/**
 * Account Manager portal: Wheeler Dealers staff verify the inspection
 * reports of the companies the super admin assigned to them.
 */

interface Manager {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}
interface Company {
  id: string;
  name: string;
}
interface QueueJob {
  id: string;
  jobCode: string;
  status: string;
  vehicle: string;
  location: string;
  customerName: string;
  company: string | null;
  inspector: string | null;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  reportSubmittedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  returnedAt: string | null;
  returnNote: string | null;
  reportToken: string | null;
}

type Queue = "awaiting" | "returned" | "verified" | "active" | "all";
const QUEUES: Array<{ key: Queue; label: string }> = [
  { key: "awaiting", label: "Awaiting verification" },
  { key: "returned", label: "Returned to inspector" },
  { key: "verified", label: "Verified" },
  { key: "active", label: "In inspection" },
  { key: "all", label: "All jobs" },
];

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function ManagerPortal() {
  const [view, setView] = useState<"loading" | "login" | "verify" | "dashboard">("loading");
  const [manager, setManager] = useState<Manager | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/manager/me");
    if (!res.ok) return setView("login");
    const d = await res.json();
    setManager(d.manager);
    setCompanies(d.companies ?? []);
    setView(d.needsVerification ? "verify" : "dashboard");
  }, []);

  useEffect(() => {
    void loadMe().catch(() => setView("login"));
  }, [loadMe]);

  const logout = useCallback(async () => {
    await fetch("/api/manager/logout", { method: "POST" });
    setManager(null);
    setView("login");
  }, []);

  if (view === "loading") return <Centered>Loading…</Centered>;
  if (view === "login") return <ManagerLogin onDone={() => void loadMe()} />;
  if (view === "verify" && manager) return <ManagerVerify manager={manager} onDone={() => void loadMe()} onLogout={logout} />;
  if (!manager) return <Centered>Loading…</Centered>;
  return <ManagerDashboard manager={manager} companies={companies} onLogout={logout} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">{children}</div>;
}

function ManagerLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/manager/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onDone();
      else setError(d.error || "Sign in failed.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <p className="mt-2 text-sm font-semibold text-neutral-700">Account Manager</p>
          <p className="text-xs text-neutral-500">Verify inspection reports before they reach customers</p>
        </div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={input} />
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className={input} />
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-xs text-neutral-400">Accounts are created by the Wheeler Dealers super admin.</p>
      </form>
    </div>
  );
}

function ManagerVerify({ manager, onDone, onLogout }: { manager: Manager; onDone: () => void; onLogout: () => void }) {
  const [email, setEmail] = useState(manager.email);
  const [phone, setPhone] = useState(manager.phone ?? "");
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const e = normaliseEmail(email);
  const m = normaliseUaeMobile(phone);
  const ready = !!(e && m && proofs[verificationKey("email", e)] && proofs[verificationKey("sms", m)]);

  async function finish() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/manager/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, phone: m, proofs: Object.values(proofs) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDone();
    else setError(d.error || "Could not complete verification.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <h1 className="mt-3 text-lg font-bold text-neutral-900">Verify your email and mobile</h1>
          <p className="mt-1 text-sm text-neutral-500">Welcome, {manager.name.split(" ")[0]}! Confirm these belong to you before you can review reports.</p>
        </div>
        <div className="space-y-4">
          <VerifyField channel="email" id="mgr-email" label="Email" value={email} onChange={setEmail} proofs={proofs} onProof={(k, p) => setProofs((c) => ({ ...c, [k]: p }))} required />
          <VerifyField channel="sms" id="mgr-phone" label="Mobile (UAE)" value={phone} onChange={setPhone} proofs={proofs} onProof={(k, p) => setProofs((c) => ({ ...c, [k]: p }))} required placeholder="05X XXX XXXX" />
        </div>
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button onClick={finish} disabled={!ready || busy} className="mt-6 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Saving…" : ready ? "Continue" : "Verify both to continue"}
        </button>
        <button onClick={onLogout} className="mt-3 w-full text-center text-sm text-neutral-500 hover:text-neutral-800">Sign out</button>
      </div>
    </div>
  );
}

function ManagerDashboard({ manager, companies, onLogout }: { manager: Manager; companies: Company[]; onLogout: () => void }) {
  const [queue, setQueue] = useState<Queue>("awaiting");
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openJob, setOpenJob] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ queue });
      if (q.trim()) p.set("q", q.trim());
      const res = await fetch(`/api/manager/jobs?${p.toString()}`, { headers: { "x-review-as": "manager" } });
      if (res.status === 401) return onLogout();
      const d = await res.json();
      setJobs(d.jobs ?? []);
      setCounts(d.counts ?? {});
    } finally {
      setLoading(false);
    }
  }, [queue, q, onLogout]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/"><BrandLogo size="sm" /></Link>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-neutral-900">Account Manager</p>
              <p className="text-xs text-neutral-500">{manager.name} · {manager.email}</p>
            </div>
          </div>
          <button onClick={onLogout} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Sign out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your inspection companies</p>
          {companies.length === 0 ? (
            <p className="mt-1 text-sm text-amber-700">No companies assigned yet — ask the super admin to assign companies to you.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {companies.map((c) => (
                <span key={c.id} className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800">{c.name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {QUEUES.map((t) => (
            <button
              key={t.key}
              onClick={() => setQueue(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                queue === t.key ? "bg-red-600 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job ID, customer, vehicle, VIN…" className="ml-auto min-w-[220px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500 sm:flex-none" />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Company / Inspector</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Nothing here right now.</td></tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-neutral-500">{j.jobCode}</p>
                      <p className="text-neutral-800">{j.customerName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-neutral-800">{j.vehicle}</p>
                      <p className="text-xs text-neutral-400">{j.location}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-800">{j.company ?? "—"}</p>
                      <p className="text-xs text-neutral-500">{j.inspector ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{fmt(j.reportSubmittedAt)}</td>
                    <td className="px-4 py-3"><ReviewBadge j={j} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setOpenJob(j.id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                          j.status === "report_submitted" ? "bg-red-600 text-white hover:bg-red-700" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        {j.status === "report_submitted" ? "Review" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {openJob && <ReportReview jobId={openJob} as="manager" onClose={() => setOpenJob(null)} onChanged={() => void load()} />}
    </div>
  );
}

function ReviewBadge({ j }: { j: QueueJob }) {
  if (j.status === "report_submitted") return <Badge cls="bg-amber-100 text-amber-800">Awaiting verification</Badge>;
  if (j.status === "completed") return <Badge cls="bg-green-100 text-green-700">Verified{j.verifiedByName ? ` · ${j.verifiedByName}` : ""}</Badge>;
  if (j.returnedAt && j.status === "in_progress") return <span title={j.returnNote ?? ""}><Badge cls="bg-red-100 text-red-700">Returned to inspector</Badge></span>;
  return <Badge cls="bg-neutral-100 text-neutral-600">{j.status.replace(/_/g, " ")}</Badge>;
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
