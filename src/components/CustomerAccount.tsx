"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import CustomerOtpModal from "./CustomerOtpModal";
import VerifyField from "./VerifyField";
import { normaliseEmail, verificationKey } from "@/lib/contactValidation";

/**
 * Customer account: sign in / sign up with the mobile code, verify the email
 * once, then "My Bookings & Reports".
 */

interface Customer {
  id: string;
  mobile: string;
  name: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
}
interface Booking {
  id: string;
  jobCode: string;
  status: string;
  vehicle: string;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  reportToken: string | null;
  createdAt: string;
}

/** Customer-friendly booking stage. */
const STAGE: Record<string, { label: string; cls: string }> = {
  payment_pending: { label: "Awaiting payment", cls: "bg-amber-100 text-amber-800" },
  available: { label: "Finding an inspector", cls: "bg-purple-100 text-purple-700" },
  open: { label: "Finding an inspector", cls: "bg-purple-100 text-purple-700" },
  accepted: { label: "Inspector assigned", cls: "bg-blue-100 text-blue-700" },
  assigned: { label: "Inspector assigned", cls: "bg-blue-100 text-blue-700" },
  in_progress: { label: "Inspection in progress", cls: "bg-amber-100 text-amber-800" },
  report_submitted: { label: "Report being verified", cls: "bg-teal-100 text-teal-700" },
  completed: { label: "Report ready", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", cls: "bg-neutral-100 text-neutral-500" },
};

export default function CustomerAccount() {
  const [state, setState] = useState<"loading" | "guest" | "ready">("loading");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showOtp, setShowOtp] = useState(false);
  const [signup, setSignup] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/customer/me");
      if (!res.ok) {
        setState("guest");
        return;
      }
      const d = await res.json();
      setCustomer(d.customer);
      setBookings(d.jobs ?? []);
      setState("ready");
    } catch {
      setState("guest");
    }
  }, []);

  useEffect(() => {
    setSignup(new URLSearchParams(window.location.search).get("signup") === "1");
    void load();
  }, [load]);

  async function signOut() {
    await fetch("/api/customer/logout", { method: "POST" });
    setCustomer(null);
    setBookings([]);
    setState("guest");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/"><BrandLogo size="sm" /></Link>
          {state === "ready" && (
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Sign out</button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        {state === "loading" && <p className="text-center text-sm text-neutral-400">Loading…</p>}

        {state === "guest" && (
          <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-neutral-900">{signup ? "Create your Smart Motorist account" : "Sign in to your account"}</h1>
            <p className="mt-2 text-sm text-neutral-500">
              {signup
                ? "Use your UAE mobile number — we'll send you a 6-digit code. Then verify your email and you're done."
                : "Sign in with your mobile number to see your bookings and inspection reports."}
            </p>
            <button onClick={() => setShowOtp(true)} className="mt-6 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
              Continue with mobile number
            </button>
            <p className="mt-4 text-sm text-neutral-500">
              {signup ? "Already have an account? " : "New here? "}
              <button onClick={() => setSignup((v) => !v)} className="font-semibold text-red-600 hover:underline">
                {signup ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        )}

        {state === "ready" && customer && !customer.emailVerifiedAt && (
          <CompleteProfile customer={customer} onDone={() => void load()} />
        )}

        {state === "ready" && customer && customer.emailVerifiedAt && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">My Bookings &amp; Reports</h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {customer.name ? `${customer.name} · ` : ""}
                  {customer.mobile} · {customer.email}
                </p>
              </div>
              <Link href="/inspection/book" className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                Book an inspection
              </Link>
            </div>

            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                <p className="font-medium text-neutral-800">No bookings yet</p>
                <p className="mt-1 text-sm text-neutral-500">Book a professional vehicle inspection — your report will appear here.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {bookings.map((b) => {
                  const stage = STAGE[b.status] ?? { label: b.status.replace(/_/g, " "), cls: "bg-neutral-100 text-neutral-600" };
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-neutral-900">{b.vehicle}</p>
                        <p className="text-sm text-neutral-500">
                          {b.scheduledAt ? `${new Date(b.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${b.scheduledSlot ?? ""}` : "Date to be confirmed"}
                        </p>
                        <p className="font-mono text-[11px] text-neutral-400">{b.jobCode}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.cls}`}>{stage.label}</span>
                      {b.status === "completed" && b.reportToken ? (
                        <a href={`/inspection/report/${b.reportToken}`} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
                          View report
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-400">{b.status === "cancelled" ? "" : "Report available once verified"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>

      {showOtp && (
        <CustomerOtpModal
          onClose={() => setShowOtp(false)}
          onVerified={() => {
            setShowOtp(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/** First sign-in: name + verified email (once per account). */
function CompleteProfile({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [name, setName] = useState(customer.name ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const e = normaliseEmail(email);
  const proof = e ? proofs[verificationKey("email", e)] : undefined;

  async function save() {
    if (!e || !proof) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/customer/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, proofs: [proof], name }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDone();
    else setError(d.error || "Could not save your details.");
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold text-neutral-900">Complete your account</h1>
      <p className="mt-1 text-sm text-neutral-500">Mobile {customer.mobile} is verified ✓. Add your name and verify your email — we send booking confirmations and reports there.</p>
      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">Full name</span>
        <input value={name} onChange={(ev) => setName(ev.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500" placeholder="Your name" />
      </label>
      <div className="mt-4">
        <VerifyField channel="email" id="acct-email" label="Email" value={email} onChange={setEmail} proofs={proofs} onProof={(k, p) => setProofs((c) => ({ ...c, [k]: p }))} required />
      </div>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button onClick={save} disabled={!proof || busy || !name.trim()} className="mt-6 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
        {busy ? "Saving…" : !name.trim() ? "Enter your name" : proof ? "Continue" : "Verify your email to continue"}
      </button>
    </div>
  );
}
