"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

interface PayInfo {
  job: {
    id: string;
    jobCode: string;
    status: string;
    fee: number;
    currency: string;
    paid: boolean;
    cancelled: boolean;
    vehicle: string;
    scheduledAt: string | null;
    scheduledSlot: string | null;
    email: string;
  };
  methods: { card: boolean; tamara: boolean; tamaraInstalments: number[] };
}

type Method = "card" | "tamara";

const fmt = (n: number) => n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Payment-method chooser shown after a booking is created: card (Stripe) or instalments (Tamara). */
export default function InspectionPayPage({ jobId }: { jobId: string }) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/inspection/pay/${jobId}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.loginRequired) return setLoginRequired(true);
    if (!res.ok) return setError(data.error || "Could not load this booking.");
    const d = data as PayInfo;
    setInfo(d);
    setMethod(d.methods.tamara && !d.methods.card ? "tamara" : d.methods.card ? "card" : null);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pay = async () => {
    if (!method || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspection/pay/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.paid) return void load();
      setError(data.error || "Payment could not be started. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const maxInstalments = info?.methods.tamaraInstalments.length ? Math.max(...info.methods.tamaraInstalments) : 0;
  const perInstalment = info && maxInstalments ? info.job.fee / maxInstalments : 0;
  const when = info?.job.scheduledAt
    ? `${new Date(info.job.scheduledAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${info.job.scheduledSlot ? ` · ${info.job.scheduledSlot}` : ""}`
    : "Date to be confirmed";

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Link href="/"><BrandLogo size="md" /></Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {loginRequired ? (
            <div className="text-center">
              <h1 className="text-xl font-bold text-neutral-900">Sign in to pay</h1>
              <p className="mt-2 text-sm text-neutral-600">This booking belongs to a signed-in customer. Please sign in with the same mobile number to complete the payment.</p>
              <Link href="/account" className="mt-5 inline-block rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Go to My Account</Link>
            </div>
          ) : !info ? (
            <p className="text-center text-sm text-neutral-500">{error ?? "Loading your booking…"}</p>
          ) : info.job.paid ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <h1 className="text-xl font-bold text-neutral-900">Already paid</h1>
              <p className="mt-2 text-sm text-neutral-600">Booking <span className="font-semibold">{info.job.jobCode}</span> is confirmed. You can follow it under My Bookings.</p>
              <Link href="/account" className="mt-5 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">My Bookings</Link>
            </div>
          ) : info.job.cancelled ? (
            <div className="text-center">
              <h1 className="text-xl font-bold text-neutral-900">Booking cancelled</h1>
              <p className="mt-2 text-sm text-neutral-600">Booking {info.job.jobCode} was cancelled, so there is nothing to pay.</p>
              <Link href="/inspection/book" className="mt-5 inline-block rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Book a new inspection</Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-neutral-900">Complete your payment</h1>
              <p className="mt-1 text-sm text-neutral-500">Your inspection is reserved. It is confirmed once the payment goes through.</p>

              <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-wide text-neutral-400">Job ID</dt><dd className="font-mono font-semibold text-neutral-900">{info.job.jobCode}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-neutral-400">Vehicle</dt><dd className="font-medium text-neutral-900">{info.job.vehicle}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-neutral-400">When</dt><dd className="font-medium text-neutral-900">{when}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-neutral-400">Total</dt><dd className="text-lg font-bold text-red-700">{info.job.currency} {fmt(info.job.fee)} <span className="text-xs font-normal text-neutral-400">incl. 5% VAT</span></dd></div>
              </dl>

              <p className="mt-6 text-sm font-semibold text-neutral-800">How would you like to pay?</p>
              <div className="mt-2 space-y-3">
                {info.methods.card && (
                  <MethodCard selected={method === "card"} onSelect={() => setMethod("card")} title="Pay by card" subtitle={`Pay ${info.job.currency} ${fmt(info.job.fee)} now · Visa, Mastercard`}>
                    <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">VISA</span>
                    <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">MC</span>
                  </MethodCard>
                )}
                {info.methods.tamara && (
                  <MethodCard
                    selected={method === "tamara"}
                    onSelect={() => setMethod("tamara")}
                    title={`Split in ${info.methods.tamaraInstalments.join(", ").replace(/, (\d+)$/, " or $1")} payments with Tamara`}
                    subtitle={maxInstalments ? `From ${info.job.currency} ${fmt(perInstalment)} today · interest-free · Sharia-compliant` : "Interest-free instalments"}
                  >
                    <span className="rounded-md bg-[#3bffc4] px-2 py-0.5 text-[11px] font-extrabold lowercase tracking-tight text-neutral-900">tamara</span>
                  </MethodCard>
                )}
                {!info.methods.card && !info.methods.tamara && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Online payment is temporarily unavailable. Please contact us to complete your booking.</p>
                )}
              </div>

              {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button
                onClick={() => void pay()}
                disabled={!method || busy}
                className="mt-6 w-full rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Redirecting…" : method === "tamara" ? "Continue with Tamara" : method === "card" ? `Pay ${info.job.currency} ${fmt(info.job.fee)}` : "Choose a payment method"}
              </button>
              <p className="mt-3 text-center text-xs text-neutral-400">
                You will be taken to a secure {method === "tamara" ? "Tamara" : "payment"} page. The Wheeler Dealers never sees your card details.
              </p>
              <p className="mt-4 text-center text-xs text-neutral-400">
                Booked for <span className="font-medium text-neutral-600">{info.job.email}</span> · <Link href="/account" className="underline">My Bookings</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MethodCard({ selected, onSelect, title, subtitle, children }: { selected: boolean; onSelect: () => void; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${selected ? "border-red-600 bg-red-50/40" : "border-neutral-200 hover:border-neutral-300"}`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-red-600" : "border-neutral-300"}`}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-red-600" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-900">{title}</span>
        <span className="block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </button>
  );
}
