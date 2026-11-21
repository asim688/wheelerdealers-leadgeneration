"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "../BrandLogo";
import { Field, StatusBadge, aed, inputCls } from "./careUi";

interface Req {
  id: string;
  code: string;
  service: string;
  serviceLabel: string;
  status: string;
  vehicle: string;
  condition: string | null;
  issue: string | null;
  pickupAddress: string;
  pickupEmirate: string | null;
  destAddress: string | null;
  fuel: string | null;
  scheduledAt: string | null;
  flexible: boolean;
  bidsCloseAt: string | null;
  priceFils: number | null;
  etaMinutes: number | null;
  etaChangePending: boolean;
  needsEtaConfirm: boolean;
  kind: "roadside" | "towing";
  paymentStatus: string;
  paidFils: number | null;
  customer: { name: string; mobile: string } | null;
  myBid: { id: string; priceFils: number; etaMinutes: number; pickupAt: string | null; terms: string | null; status: string } | null;
}

const dt = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** /care/partner — towing / roadside partner portal. */
export default function CarePartnerPortal() {
  const [state, setState] = useState<"loading" | "login" | "in">("loading");
  const [data, setData] = useState<{ partner: { name: string; email: string; services: string[]; emirates: string[] }; open: Req[]; jobs: Req[] } | null>(null);
  const [tab, setTab] = useState<"open" | "jobs">("open");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/care/partner/requests", { cache: "no-store" });
    if (r.status === 401) return setState("login");
    setData(await r.json());
    setState("in");
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: string, body: Record<string, unknown>, ok: string) => {
    const r = await fetch(`/api/care/partner/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setNotice(r.ok ? (d.changed ? "New arrival time sent — the customer must approve it before the booking is confirmed." : ok) : d.error || "Something went wrong.");
    await load();
    return r.ok;
  };

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading…</div>;
  if (state === "login") return <PartnerLogin onIn={() => void load()} />;

  const needAction = data!.jobs.filter((j) => j.needsEtaConfirm).length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <div>
              <p className="text-sm font-semibold text-neutral-900">{data!.partner.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-neutral-400">Care Partner Portal</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/company/logout", { method: "POST" });
              setState("login");
            }}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex gap-2">
          <TabBtn on={tab === "open"} onClick={() => setTab("open")}>Open towing requests ({data!.open.length})</TabBtn>
          <TabBtn on={tab === "jobs"} onClick={() => setTab("jobs")}>
            My jobs ({data!.jobs.length}){needAction > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{needAction}</span>}
          </TabBtn>
        </div>
        {notice && <p className="mt-4 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">{notice}</p>}

        {tab === "open" ? (
          data!.open.length === 0 ? (
            <Empty text="No open towing requests in your area right now. New requests appear here automatically." />
          ) : (
            <div className="mt-4 space-y-3">
              {data!.open.map((r) => (
                <OpenRequestCard key={r.id} r={r} act={act} />
              ))}
            </div>
          )
        ) : data!.jobs.length === 0 ? (
          <Empty text="Jobs you win or WD assigns to you will appear here." />
        ) : (
          <div className="mt-4 space-y-3">
            {data!.jobs.map((r) => (
              <JobCard key={r.id} r={r} act={act} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-red-600 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"}`}>
      {children}
    </button>
  );
}

const Empty = ({ text }: { text: string }) => <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">{text}</div>;

function Details({ r }: { r: Req }) {
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <p><span className="text-neutral-400">Vehicle:</span> {r.vehicle}{r.condition ? ` · ${r.condition}` : ""}</p>
      <p><span className="text-neutral-400">When:</span> {r.scheduledAt ? (r.flexible ? `${new Date(r.scheduledAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" })} · flexible` : dt(r.scheduledAt)) : "As soon as possible"}</p>
      <p><span className="text-neutral-400">Pickup:</span> {r.pickupAddress}{r.pickupEmirate ? `, ${r.pickupEmirate}` : ""}</p>
      {r.destAddress && <p><span className="text-neutral-400">Destination:</span> {r.destAddress}</p>}
      {r.fuel && <p><span className="text-neutral-400">Fuel:</span> {r.fuel}</p>}
      {r.issue && <p className="sm:col-span-2"><span className="text-neutral-400">Notes:</span> {r.issue}</p>}
    </div>
  );
}

function OpenRequestCard({ r, act }: { r: Req; act: (id: string, body: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(r.myBid ? String(r.myBid.priceFils / 100) : "");
  const [eta, setEta] = useState(r.myBid ? String(r.myBid.etaMinutes) : "");
  const [pickupAt, setPickupAt] = useState("");
  const [terms, setTerms] = useState(r.myBid?.terms ?? "");
  const [err, setErr] = useState<string | null>(null);
  const live = r.myBid?.status === "active";

  const submit = async () => {
    setErr(null);
    // Mirror the server rule: both the price and the ETA are mandatory.
    if (!(Number(price) >= 10)) return setErr("Enter the total towing price (AED, VAT inclusive).");
    if (!(Number.isInteger(Number(eta)) && Number(eta) >= 5)) return setErr("Enter the time to reach the pickup location, in minutes.");
    const ok = await act(r.id, { action: "bid", price: Number(price), etaMinutes: Number(eta), pickupAt: pickupAt ? new Date(`${pickupAt}:00+04:00`).toISOString() : undefined, terms }, live ? "Offer updated." : "Offer sent to the customer.");
    if (ok) setOpen(false);
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-neutral-900">{r.serviceLabel}</p>
          <p className="font-mono text-[11px] text-neutral-400">{r.code}{r.bidsCloseAt && ` · bids close ${dt(r.bidsCloseAt)}`}</p>
        </div>
        {live ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Your offer: {aed(r.myBid!.priceFils)} · {r.myBid!.etaMinutes} min</span> : <StatusBadge status="open" />}
      </div>
      <Details r={r} />
      {!open ? (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setOpen(true)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">{live ? "Update offer" : "Submit bid"}</button>
          {live && <button onClick={() => void act(r.id, { action: "withdraw" }, "Offer withdrawn.")} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700">Withdraw</button>}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-neutral-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Towing price — AED, VAT inclusive" required>
              <input type="number" min={10} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="e.g. 175" />
            </Field>
            <Field label="Time to reach pickup (minutes)" required hint="ETA to arrive at the pickup — not the whole journey.">
              <input type="number" min={5} step={5} value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} placeholder="e.g. 30" />
            </Field>
            <Field label="Pickup slot you can do (optional)">
              <input type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Service terms (optional)">
              <input value={terms} onChange={(e) => setTerms(e.target.value)} className={inputCls} placeholder="e.g. Flatbed, insured, no extra charges" maxLength={400} />
            </Field>
          </div>
          {err && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => void submit()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">{live ? "Save offer" : "Send offer"}</button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ r, act }: { r: Req; act: (id: string, body: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [eta, setEta] = useState(String(r.etaMinutes ?? ""));
  const [collected, setCollected] = useState(r.priceFils != null ? String(r.priceFils / 100) : "");
  return (
    <div className={`rounded-2xl border bg-white p-4 ${r.needsEtaConfirm ? "border-red-300 ring-2 ring-red-100" : "border-neutral-200"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-neutral-900">{r.serviceLabel}</p>
          <p className="font-mono text-[11px] text-neutral-400">{r.code}</p>
        </div>
        <div className="flex items-center gap-2">
          {r.priceFils != null && <span className="text-sm font-bold">{aed(r.priceFils)}</span>}
          <StatusBadge status={r.status} />
        </div>
      </div>
      <Details r={r} />
      {r.customer && (
        <p className="mt-2 text-sm">
          <span className="text-neutral-400">Customer:</span> {r.customer.name} · <a href={`tel:${r.customer.mobile}`} className="font-semibold text-red-700 underline">{r.customer.mobile}</a>
        </p>
      )}
      {r.needsEtaConfirm && (
        <div className="mt-3 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">You won this job — reconfirm your arrival time</p>
          <p className="text-xs text-red-700">Keep {r.etaMinutes} min to confirm at once. If you change it, the customer must approve first.</p>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={5} value={eta} onChange={(e) => setEta(e.target.value)} className={`${inputCls} w-28`} aria-label="ETA minutes" />
            <span className="text-sm text-neutral-600">minutes</span>
            <button onClick={() => void act(r.id, { action: "confirm_eta", etaMinutes: Number(eta) }, "Arrival time confirmed — the booking is confirmed.")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Confirm</button>
          </div>
        </div>
      )}
      {r.etaChangePending && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Waiting for the customer to approve your new arrival time ({r.etaMinutes} min).</p>}
      {r.kind === "towing" && r.paymentStatus === "paid" && <p className="mt-2 text-xs font-medium text-green-700">✓ Customer paid {aed(r.paidFils)} online to Wheeler Dealers.</p>}
      {r.kind === "roadside" && r.paymentStatus === "pay_on_site" && <p className="mt-2 text-xs font-medium text-blue-700">Collect payment from the customer on site after the service{r.priceFils != null ? ` (agreed: ${aed(r.priceFils)})` : ""}.</p>}
      {r.paymentStatus === "collected_on_site" && <p className="mt-2 text-xs font-medium text-green-700">✓ {aed(r.paidFils)} collected on site.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status === "assigned" && <ActBtn onClick={() => void act(r.id, { action: "en_route" }, "Marked as on the way.")}>On the way</ActBtn>}
        {r.status === "confirmed" && <ActBtn onClick={() => void act(r.id, { action: "start" }, "Towing started.")}>Start towing</ActBtn>}
        {r.status === "in_progress" && <ActBtn onClick={() => void act(r.id, { action: "complete" }, "Job completed.")}>Mark completed</ActBtn>}
        {r.status === "en_route" && r.kind === "roadside" && (
          <span className="flex items-center gap-2">
            <input type="number" min={0} step="0.01" value={collected} onChange={(e) => setCollected(e.target.value)} className={`${inputCls} w-32`} placeholder="AED collected" aria-label="Amount collected (AED)" />
            <ActBtn onClick={() => void act(r.id, { action: "complete", collected: Number(collected) }, "Job completed — payment recorded.")}>Completed &amp; paid</ActBtn>
          </span>
        )}
      </div>
    </div>
  );
}

const ActBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">{children}</button>
);

function PartnerLogin({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    // Same partner sign-in as inspection companies; non-Care accounts are sent to their own portal.
    const r = await fetch("/api/partner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Sign-in failed.");
    if (d.redirect && d.redirect !== "/care/partner") return window.location.assign(d.redirect);
    onIn();
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-center"><BrandLogo /></div>
        <h1 className="text-center text-lg font-bold text-neutral-900">Care Partner Portal</h1>
        <p className="mb-5 text-center text-xs text-neutral-500">Towing &amp; roadside partners of The Wheeler Dealers</p>
        <div className="space-y-3">
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="username" required /></Field>
          <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" required /></Field>
        </div>
        {err && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button disabled={busy} className="mt-4 w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
        <p className="mt-4 text-center text-xs text-neutral-400">New partner? <Link href="/company?register=1" className="underline">Register</Link> and choose &quot;Towing &amp; Roadside&quot;.</p>
      </form>
    </main>
  );
}
