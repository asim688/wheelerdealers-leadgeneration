"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CustomerOtpModal from "../CustomerOtpModal";
import { CareFooter, CareHeader, ROADSIDE_STEPS, StatusBadge, StepTracker, TOWING_STEPS, aed } from "./careUi";

interface Detail {
  request: {
    id: string;
    code: string;
    kind: "roadside" | "towing";
    serviceLabel: string;
    status: string;
    displayStatus: string;
    vehicle: string;
    condition: string | null;
    issue: string | null;
    pickupAddress: string;
    pickupEmirate: string | null;
    destAddress: string | null;
    fuelType: string | null;
    fuelLitres: number | null;
    scheduledAt: string | null;
    flexible: boolean;
    bidsCloseAt: string | null;
    biddingOpen: boolean;
    priceFils: number | null;
    etaMinutes: number | null;
    etaChangePending: boolean;
    acceptedBidId: string | null;
    partner: { name: string; phone: string | null } | null;
    paymentStatus: string;
    paidFils: number | null;
    paymentProvider: string | null;
    paymentPending: boolean;
    refundStatus: string;
    refundFils: number;
    cancelReason: string | null;
    createdAt: string;
  };
  bids: Array<{ id: string; partner: string; priceFils: number; etaMinutes: number; pickupAt: string | null; terms: string | null; status: string }>;
  events: Array<{ type: string; by: string | null; detail: string | null; at: string }>;
}

const dt = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function useLogin(load: () => Promise<number>) {
  const [needLogin, setNeedLogin] = useState(false);
  const run = useCallback(async () => setNeedLogin((await load()) === 401), [load]);
  useEffect(() => {
    void run();
  }, [run]);
  const modal = needLogin ? <CustomerOtpModal onClose={() => setNeedLogin(false)} onVerified={() => { setNeedLogin(false); void run(); }} /> : null;
  return { needLogin, modal, reload: run };
}

/** /care/requests — the customer's Care requests and product orders. */
export function CareRequestsList() {
  const [requests, setRequests] = useState<Array<{ id: string; code: string; serviceLabel: string; status: string; bids: number; vehicle: string; pickupAddress: string; priceFils: number | null; createdAt: string }> | null>(null);
  const [orders, setOrders] = useState<Array<{ id: string; code: string; status: string; totalFils: number; items: Array<{ name: string; qty: number }>; createdAt: string }>>([]);
  const load = useCallback(async () => {
    const [r, o] = await Promise.all([fetch("/api/care/requests", { cache: "no-store" }), fetch("/api/care/orders", { cache: "no-store" })]);
    if (r.status === 401) return 401;
    setRequests((await r.json()).requests ?? []);
    if (o.ok) setOrders((await o.json()).orders ?? []);
    return 200;
  }, []);
  const { needLogin, modal } = useLogin(load);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <CareHeader />
      {modal}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">My Care requests</h1>
        {needLogin ? (
          <p className="mt-4 text-sm text-neutral-600">Verify your mobile number to see your requests.</p>
        ) : requests === null ? (
          <p className="mt-6 text-sm text-neutral-400">Loading…</p>
        ) : (
          <>
            {requests.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
                <p className="font-medium text-neutral-800">No requests yet</p>
                <Link href="/care" className="mt-3 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">Open Care</Link>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/care/requests/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 hover:border-red-300">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-neutral-900">{r.serviceLabel}</p>
                        <p className="truncate text-sm text-neutral-500">{r.vehicle} · {r.pickupAddress}</p>
                        <p className="font-mono text-[11px] text-neutral-400">{r.code} · {dt(r.createdAt)}</p>
                      </div>
                      {r.status === "bids_received" && <span className="text-xs font-semibold text-amber-700">{r.bids} offer{r.bids === 1 ? "" : "s"}</span>}
                      {r.priceFils != null && <span className="text-sm font-semibold">{aed(r.priceFils)}</span>}
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {orders.length > 0 && (
              <>
                <h2 className="mt-10 text-lg font-bold text-neutral-900">Product orders</h2>
                <ul className="mt-3 space-y-3">
                  {orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-neutral-900">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                        <p className="font-mono text-[11px] text-neutral-400">{o.code} · {dt(o.createdAt)}</p>
                      </div>
                      <span className="text-sm font-semibold">{aed(o.totalFils)}</span>
                      <StatusBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
      <CareFooter />
    </div>
  );
}

/** /care/requests/[id] — status, partner offers (price + ETA) and actions. */
export function CareRequestDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sort, setSort] = useState<"price" | "eta">("price");
  const [busy, setBusy] = useState(false);
  const [confirmBid, setConfirmBid] = useState<Detail["bids"][number] | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/care/requests/${id}`, { cache: "no-store" });
    if (r.status === 401) return 401;
    const data = await r.json();
    if (!r.ok) setError(data.error || "Could not load the request.");
    else setD(data);
    return r.status;
  }, [id]);
  const { needLogin, modal, reload } = useLogin(load);
  const [pay, setPay] = useState<{ card: boolean; tamara: boolean; tamaraInstalments: number[]; devAuto: boolean } | null>(null);

  useEffect(() => {
    const t = setInterval(() => void load(), 15_000); // live: new offers / status updates
    return () => clearInterval(t);
  }, [load]);

  // Back from the payment page: verify with the gateway (in case the webhook is slower).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const provider = q.get("provider");
    if (q.get("cancelled") === "1") setNotice("Payment was not completed — the offer is still available if you want to try again.");
    if (q.get("paid") !== "1" || !provider) return;
    setNotice("Confirming your payment…");
    void fetch(`/api/care/requests/${id}/pay/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, sessionId: q.get("session_id") ?? undefined, orderId: q.get("orderId") ?? undefined }),
    })
      .then((r) => r.json())
      .then((d) => {
        setNotice(d.result === "accepted" || d.paymentStatus === "paid" ? "Payment received — the partner will now reconfirm the arrival time." : d.result === "refund_due" ? "Payment received, but the offer was no longer available. Our team will refund you." : "We are still waiting for the payment confirmation. This page updates automatically.");
        window.history.replaceState(null, "", `/care/requests/${id}`);
        void reload();
      });
  }, [id, reload]);

  useEffect(() => {
    if (!confirmBid) return setPay(null);
    void fetch(`/api/care/requests/${id}/pay?bidId=${confirmBid.id}`).then(async (r) => r.ok && setPay(await r.json()));
  }, [confirmBid, id]);

  const startPayment = async (method: "card" | "tamara") => {
    if (!confirmBid) return;
    setBusy(true);
    const r = await fetch(`/api/care/requests/${id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidId: confirmBid.id, method }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) {
      window.location.href = d.url;
      return;
    }
    setBusy(false);
    setConfirmBid(null);
    setNotice(r.ok && d.paid ? "Offer accepted and paid — the partner will now reconfirm the arrival time." : d.error || "Payment could not be started.");
    void reload();
  };

  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setNotice(null);
    const r = await fetch(`/api/care/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    setConfirmBid(null);
    setNotice(r.ok ? ok : data.error || "Something went wrong.");
    void reload();
  };

  const bids = useMemo(() => {
    const list = (d?.bids ?? []).filter((b) => b.status === "active");
    return [...list].sort((a, b) => (sort === "price" ? a.priceFils - b.priceFils || a.etaMinutes - b.etaMinutes : a.etaMinutes - b.etaMinutes || a.priceFils - b.priceFils));
  }, [d, sort]);

  const r = d?.request;
  const canCancel = r && ["submitted", "reviewing", "open", "offer_accepted"].includes(r.status);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <CareHeader />
      {modal}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <Link href="/care/requests" className="text-sm text-neutral-500 hover:text-neutral-800">← My requests</Link>
        {needLogin ? (
          <p className="mt-4 text-sm text-neutral-600">Verify your mobile number to view this request.</p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-700">{error}</p>
        ) : !r ? (
          <p className="mt-6 text-sm text-neutral-400">Loading…</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">{r.serviceLabel}</h1>
                <p className="font-mono text-xs text-neutral-400">{r.code} · {dt(r.createdAt)}</p>
              </div>
              <StatusBadge status={r.displayStatus} />
            </div>
            {r.status !== "cancelled" && (
              <div className="mt-4">
                <StepTracker steps={r.kind === "towing" ? TOWING_STEPS : ROADSIDE_STEPS} current={r.displayStatus} />
              </div>
            )}
            {notice && <p className="mt-4 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">{notice}</p>}
            {r.paymentStatus === "pay_on_site" && r.status !== "cancelled" && (
              <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">💳 No online payment: you pay the partner on the spot once the service is done. The charge is confirmed with you before dispatch.</p>
            )}
            {r.paymentStatus === "collected_on_site" && <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">Paid on site: {aed(r.paidFils)}.</p>}
            {r.refundStatus === "due" && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Refund of {aed(r.refundFils)} is being processed by Wheeler Dealers.</p>}
            {r.refundStatus === "refunded" && <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">Refunded: {aed(r.refundFils)}.</p>}

            {r.etaChangePending && (
              <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900">Arrival time changed</p>
                <p className="mt-1 text-sm text-amber-900">
                  {r.partner?.name} updated the time to reach your pickup to <b>{r.etaMinutes} minutes</b> (price stays {aed(r.priceFils)}). Approve to confirm, or choose another offer.
                </p>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy} onClick={() => void act({ action: "approve_eta" }, "Booking confirmed.")} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Approve new time</button>
                  <button disabled={busy} onClick={() => void act({ action: "reject_eta" }, "Request reopened — choose another offer.")} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Choose another offer</button>
                </div>
              </div>
            )}

            {r.partner && !r.etaChangePending && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                <p className="font-semibold">{r.status === "offer_accepted" ? "Waiting for the partner to reconfirm the arrival time" : "Your partner"}</p>
                <p className="mt-1">
                  {r.partner.name}
                  {r.priceFils != null && <> · {aed(r.priceFils)} incl. VAT{r.paymentStatus === "paid" && " (paid)"}</>}
                  {r.etaMinutes != null && <> · arrives in ~{r.etaMinutes} min</>}
                  {r.partner.phone && <> · <a href={`tel:${r.partner.phone}`} className="font-semibold underline">{r.partner.phone}</a></>}
                </p>
              </div>
            )}

            {r.kind === "towing" && r.status === "open" && (
              <section className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-neutral-900">Partner offers {bids.length > 0 && <span className="text-neutral-400">({bids.length})</span>}</h2>
                  {bids.length > 1 && (
                    <div className="flex rounded-lg border border-neutral-300 bg-white p-0.5 text-xs font-semibold">
                      <button onClick={() => setSort("price")} className={`rounded-md px-3 py-1.5 ${sort === "price" ? "bg-red-600 text-white" : "text-neutral-600"}`}>Lowest Price</button>
                      <button onClick={() => setSort("eta")} className={`rounded-md px-3 py-1.5 ${sort === "eta" ? "bg-red-600 text-white" : "text-neutral-600"}`}>Fastest Arrival</button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {r.biddingOpen ? `Partners can send offers until ${r.bidsCloseAt ? dt(r.bidsCloseAt) : "you choose one"} (15 minutes). This page updates automatically.` : "Bidding has closed."} ETA = time to reach your pickup location. You pay when you accept an offer.
                </p>
                {r.paymentPending && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">A payment you started is still open. If you closed the payment page, you can choose an offer again.</p>}
                {!r.biddingOpen && (
                  <button disabled={busy} onClick={() => void act({ action: "reopen" }, "Bidding reopened for 15 minutes — partners have been notified.")} className="mt-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                    Ask partners for offers again (15 min)
                  </button>
                )}
                {bids.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">Waiting for offers from approved towing partners…</div>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500 sm:grid">
                      <span>Partner</span><span>Total price (incl. VAT)</span><span>ETA to pickup</span><span />
                    </div>
                    {bids.map((b) => (
                      <div key={b.id} className="grid grid-cols-2 items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                        <div className="col-span-2 sm:col-span-1">
                          <p className="font-semibold text-neutral-900">{b.partner}</p>
                          {b.pickupAt && <p className="text-xs text-neutral-500">Pickup slot: {dt(b.pickupAt)}</p>}
                          {b.terms && <p className="text-xs text-neutral-500">{b.terms}</p>}
                        </div>
                        <p className="text-lg font-bold text-red-700">{aed(b.priceFils)}</p>
                        <p className="text-sm font-semibold text-neutral-800">⏱ {b.etaMinutes} minutes</p>
                        <button onClick={() => setConfirmBid(b)} className="col-span-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 sm:col-span-1">Accept &amp; pay</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="mt-6 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
              <Info label="Vehicle" value={r.vehicle} />
              <Info label={r.kind === "towing" || r.serviceLabel.includes("Tow") ? "Pickup" : "Location"} value={`${r.pickupAddress}${r.pickupEmirate ? `, ${r.pickupEmirate}` : ""}`} />
              {r.destAddress && <Info label="Destination" value={r.destAddress} />}
              {r.scheduledAt && <Info label="Preferred pickup" value={r.flexible ? `${new Date(r.scheduledAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" })} · flexible time` : dt(r.scheduledAt)} />}
              {r.fuelType && <Info label="Fuel" value={`${r.fuelType.replace("_", " ")} · ${r.fuelLitres} L`} />}
              {r.issue && <Info label="Notes" value={r.issue} />}
              {r.cancelReason && <Info label="Cancelled" value={r.cancelReason} />}
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">History</h2>
              <ol className="mt-2 space-y-2 border-l-2 border-neutral-200 pl-4">
                {d!.events.map((e, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="font-medium capitalize text-neutral-800">{e.type.replace(/_/g, " ")}</span>
                    {e.detail && <span className="text-neutral-600"> — {e.detail}</span>}
                    <span className="block text-[11px] text-neutral-400">{e.by ?? "System"} · {dt(e.at)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {canCancel && (
              <button
                disabled={busy}
                onClick={() => window.confirm("Cancel this request?") && void act({ action: "cancel" }, "Request cancelled.")}
                className="mt-6 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel request
              </button>
            )}
          </>
        )}
      </main>
      {confirmBid && r && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmBid(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900">Accept this offer</h3>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-neutral-500">Partner</dt><dd className="font-medium">{confirmBid.partner}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Total (incl. VAT)</dt><dd className="font-bold text-red-700">{aed(confirmBid.priceFils)}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">ETA to pickup</dt><dd className="font-medium">{confirmBid.etaMinutes} min</dd></div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">Pay now to book this partner. They then reconfirm the arrival time — if it changes you can approve it, or choose another offer and get a refund.</p>
            <div className="mt-4 space-y-2">
              {!pay ? (
                <p className="text-center text-xs text-neutral-400">Loading payment options…</p>
              ) : (
                <>
                  {pay.card && (
                    <button disabled={busy} onClick={() => void startPayment("card")} className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      {busy ? "Please wait…" : pay.devAuto ? `Pay ${aed(confirmBid.priceFils)} (test mode)` : `Pay ${aed(confirmBid.priceFils)} by card`}
                    </button>
                  )}
                  {pay.tamara && (
                    <button disabled={busy} onClick={() => void startPayment("tamara")} className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50">
                      <span className="rounded bg-[#3bffc4] px-1.5 text-[11px] font-extrabold lowercase">tamara</span>
                      Split in {pay.tamaraInstalments.join(", ").replace(/, (\d+)$/, " or $1")} payments
                    </button>
                  )}
                  {!pay.card && !pay.tamara && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Online payment is temporarily unavailable.</p>}
                </>
              )}
              <button onClick={() => setConfirmBid(null)} className="w-full rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Back</button>
            </div>
          </div>
        </div>
      )}
      <CareFooter />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="break-words text-neutral-800">{value}</p>
    </div>
  );
}
