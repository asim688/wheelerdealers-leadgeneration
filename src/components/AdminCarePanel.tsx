"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EMIRATES, StatusBadge, aed } from "./care/careUi";
import { CreateDialog } from "./AdminUsersPanel";

type Sub = "roadside" | "towing" | "orders" | "products" | "partners";

const SERVICE_OPTIONS = [
  { id: "jump_start", label: "Jump start" },
  { id: "emergency_tow", label: "Emergency towing" },
  { id: "fuel_delivery", label: "Fuel delivery" },
  { id: "scheduled_tow", label: "Scheduled towing (bidding)" },
];

const inp = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";
const dt = (s: string | Date) => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Admin "Care" section: roadside dispatch queue, scheduled-tow bidding, orders, catalogue and partners. */
export default function AdminCarePanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [sub, setSub] = useState<Sub>("roadside");
  const tabs: { id: Sub; label: string }[] = [
    { id: "roadside", label: "Roadside queue" },
    { id: "towing", label: "Scheduled towing" },
    { id: "orders", label: "Product orders" },
    { id: "products", label: "Products" },
    { id: "partners", label: "Care partners" },
  ];
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold text-neutral-900">Care</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${sub === t.id ? "bg-red-600 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {(sub === "roadside" || sub === "towing") && <RequestsTab key={sub} kind={sub} onUnauthorized={onUnauthorized} />}
      {sub === "orders" && <OrdersTab onUnauthorized={onUnauthorized} />}
      {sub === "products" && <ProductsTab onUnauthorized={onUnauthorized} />}
      {sub === "partners" && <PartnersTab onUnauthorized={onUnauthorized} />}
    </div>
  );
}

function useAdminFetch(onUnauthorized: () => void) {
  return useCallback(
    async (url: string, init?: RequestInit) => {
      const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
      if (r.status === 401) onUnauthorized();
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, d };
    },
    [onUnauthorized],
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// --- Roadside + towing requests ----------------------------------------------------

interface ReqRow {
  id: string;
  code: string;
  serviceLabel: string;
  status: string;
  displayStatus: string;
  customerName: string;
  customerMobile: string;
  vehicle: string;
  pickupAddress: string;
  pickupEmirate: string | null;
  destAddress: string | null;
  scheduledAt: string | null;
  bids: number;
  partner: string | null;
  priceFils: number | null;
  etaMinutes: number | null;
  paymentStatus: string;
  paidFils: number | null;
  refundStatus: string;
  refundFils: number;
  createdAt: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  none: "Not paid",
  pending: "Payment started",
  paid: "Paid online",
  pay_on_site: "Pay on site",
  collected_on_site: "Collected on site",
};
const PAYMENT_STYLE: Record<string, string> = { paid: "text-green-700", collected_on_site: "text-green-700" };

const STATUS_FILTERS: Record<"roadside" | "towing", string[]> = {
  roadside: ["", "submitted", "reviewing", "assigned", "en_route", "completed", "cancelled"],
  towing: ["", "open", "offer_accepted", "confirmed", "in_progress", "completed", "cancelled"],
};

function RequestsTab({ kind, onUnauthorized }: { kind: "roadside" | "towing"; onUnauthorized: () => void }) {
  const api = useAdminFetch(onUnauthorized);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<ReqRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { ok, d } = await api(`/api/admin/care/requests?kind=${kind}${status ? `&status=${status}` : ""}`);
    if (ok) {
      setRows(d.requests);
      setCounts(d.counts ?? {});
    }
  }, [api, kind, status]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <p className="mb-3 text-sm text-neutral-500">
        {kind === "roadside" ? "Emergency requests: WD reviews, assigns an available partner and sets the charge / ETA." : "Scheduled towing: approved partners bid with price (incl. VAT) and ETA; the customer chooses."}
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_FILTERS[kind].map((s) => (
          <button key={s || "all"} onClick={() => setStatus(s)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${status === s ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"}`}>
            {s ? s.replace(/_/g, " ") : "All"} ({s ? counts[s] ?? 0 : total})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Request</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">{kind === "towing" ? "Route" : "Location"}</th>
              <th className="px-3 py-2">{kind === "towing" ? "Offers / partner" : "Partner"}</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows === null ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">No requests.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} className={`cursor-pointer hover:bg-red-50/40 ${r.status === "submitted" ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-neutral-900">{r.serviceLabel}</p>
                    <p className="font-mono text-[11px] text-neutral-400">{r.code} · {dt(r.createdAt)}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p>{r.customerName}</p>
                    <p className="text-xs text-neutral-500">{r.customerMobile} · {r.vehicle}</p>
                  </td>
                  <td className="max-w-[240px] px-3 py-2.5 text-xs text-neutral-600">
                    <p className="truncate">{r.pickupAddress}{r.pickupEmirate ? `, ${r.pickupEmirate}` : ""}</p>
                    {r.destAddress && <p className="truncate">→ {r.destAddress}</p>}
                    {r.scheduledAt && <p className="text-neutral-400">{dt(r.scheduledAt)}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.partner ? (
                      <>
                        <p className="font-medium text-neutral-800">{r.partner}</p>
                        <p className="text-neutral-500">{aed(r.priceFils)}{r.etaMinutes != null ? ` · ${r.etaMinutes} min` : ""}</p>
                      </>
                    ) : kind === "towing" ? (
                      <span>{r.bids} offer{r.bids === 1 ? "" : "s"}</span>
                    ) : (
                      <span className="text-neutral-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.displayStatus} />
                    <p className={`mt-1 text-[11px] ${PAYMENT_STYLE[r.paymentStatus] ?? "text-neutral-400"}`}>{PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}{r.paidFils != null ? ` · ${aed(r.paidFils)}` : ""}</p>
                    {r.refundStatus === "due" && <p className="text-[11px] font-semibold text-red-600">Refund due · {aed(r.refundFils)}</p>}
                    {r.refundStatus === "refunded" && <p className="text-[11px] text-neutral-500">Refunded · {aed(r.refundFils)}</p>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {open && <RequestDialog id={open} api={api} onClose={() => setOpen(null)} onChanged={() => void load()} />}
    </>
  );
}

interface AdminDetail {
  request: {
    id: string; code: string; kind: string; serviceLabel: string; status: string; customerName: string; customerMobile: string; customerEmail: string | null;
    make: string | null; model: string | null; year: number | null; conditionLabel: string | null; issue: string | null; pickupAddress: string; pickupEmirate: string | null;
    pickupLat: number | null; pickupLng: number | null; destAddress: string | null; fuelLabel: string | null; fuelLitres: number | null; scheduledAt: string | null; flexible: boolean;
    bidsCloseAt: string | null; priceFils: number | null; etaMinutes: number | null; etaChangePending: boolean; adminNote: string | null; cancelReason: string | null;
    paymentStatus: string; paymentProvider: string | null; paymentRef: string | null; paidFils: number | null; paidAt: string | null;
    refundStatus: string; refundFils: number; refundRef: string | null;
    assignedPartner: { id: string; name: string; phone: string } | null;
  };
  bids: Array<{ id: string; partner: string; phone: string; priceFils: number; etaMinutes: number; confirmedEtaMinutes: number | null; pickupAt: string | null; terms: string | null; status: string; createdAt: string }>;
  events: Array<{ id: string; type: string; actorName: string | null; actorRole: string | null; detail: string | null; createdAt: string }>;
  eligiblePartners: Array<{ id: string; name: string; phone: string }>;
}

function RequestDialog({ id, api, onClose, onChanged }: { id: string; api: ReturnType<typeof useAdminFetch>; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<AdminDetail | null>(null);
  const [assign, setAssign] = useState({ partnerId: "", price: "", eta: "" });
  const [reason, setReason] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { ok, d } = await api(`/api/admin/care/requests/${id}`);
    if (ok) {
      setD(d);
      setNote(d.request.adminNote ?? "");
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (body: Record<string, unknown>, ok: string) => {
    const r = await api(`/api/admin/care/requests/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setMsg(r.ok ? ok : r.d.error || "Failed");
    if (r.ok) {
      onChanged();
      void load();
    }
  };
  const r = d?.request;
  const closed = r && ["completed", "cancelled"].includes(r.status);

  return (
    <Modal title={r ? `${r.serviceLabel} · ${r.code}` : "Loading…"} onClose={onClose}>
      {!r ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2"><StatusBadge status={r.status} />{r.etaChangePending && <span className="text-xs text-amber-700">ETA change waiting for customer</span>}</div>
          {msg && <p className="rounded-md bg-neutral-900 px-3 py-2 text-white">{msg}</p>}
          <div className="grid gap-2 rounded-xl bg-neutral-50 p-3 sm:grid-cols-2">
            <p><b>Customer:</b> {r.customerName} · <a className="text-red-700 underline" href={`tel:${r.customerMobile}`}>{r.customerMobile}</a></p>
            <p><b>Vehicle:</b> {[r.year, r.make, r.model].filter(Boolean).join(" ")}{r.conditionLabel ? ` · ${r.conditionLabel}` : ""}</p>
            <p className="sm:col-span-2"><b>Pickup:</b> {r.pickupAddress}{r.pickupEmirate ? `, ${r.pickupEmirate}` : ""}{r.pickupLat != null && <> · <a className="text-red-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.pickupLat},${r.pickupLng}`}>map</a></>}</p>
            {r.destAddress && <p className="sm:col-span-2"><b>Destination:</b> {r.destAddress}</p>}
            {r.fuelLabel && <p><b>Fuel:</b> {r.fuelLabel} · {r.fuelLitres} L</p>}
            {r.scheduledAt && <p><b>Pickup time:</b> {r.flexible ? `${new Date(r.scheduledAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })} (flexible)` : dt(r.scheduledAt)}</p>}
            {r.issue && <p className="sm:col-span-2"><b>Notes:</b> {r.issue}</p>}
            {r.assignedPartner && <p className="sm:col-span-2"><b>Partner:</b> {r.assignedPartner.name} · {r.assignedPartner.phone} · {aed(r.priceFils)}{r.etaMinutes != null ? ` · ETA ${r.etaMinutes} min` : ""}</p>}
            {r.cancelReason && <p className="sm:col-span-2"><b>Cancelled:</b> {r.cancelReason}</p>}
            <p className="sm:col-span-2"><b>Payment:</b> <span className={PAYMENT_STYLE[r.paymentStatus] ?? ""}>{PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}</span>{r.paidFils != null && ` · ${aed(r.paidFils)}`}{r.paymentProvider && ` · ${r.paymentProvider}`}{r.paymentRef && <span className="font-mono text-[11px] text-neutral-400"> · {r.paymentRef}</span>}</p>
          </div>

          {r.refundStatus === "refunded" && <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">Refunded {aed(r.refundFils)} · ref {r.refundRef}</p>}
          {r.refundStatus === "due" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="font-semibold text-red-800">Refund due: {aed(r.refundFils)}</p>
              <p className="text-xs text-red-700">Refund it in the {r.paymentProvider === "tamara" ? "Tamara Partner Portal" : "Stripe dashboard"}, then record the reference here.</p>
              <div className="mt-2 flex gap-2">
                <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} placeholder="Refund reference" className={inp} />
                <button onClick={() => void act({ action: "refunded", note: refundRef }, "Refund recorded.")} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Mark refunded</button>
              </div>
            </div>
          )}

          {r.kind === "roadside" && !closed && (
            <div className="rounded-xl border border-neutral-200 p-3">
              <p className="mb-2 font-semibold text-neutral-800">Dispatch</p>
              {r.status === "submitted" && <button onClick={() => void act({ action: "review" }, "Marked as reviewing.")} className="mb-3 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">Start reviewing</button>}
              {["submitted", "reviewing", "assigned"].includes(r.status) && (
                <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <select value={assign.partnerId} onChange={(e) => setAssign({ ...assign, partnerId: e.target.value })} className={inp}>
                    <option value="">{d!.eligiblePartners.length ? "Choose partner…" : "No eligible partner — add one in Care partners"}</option>
                    {d!.eligiblePartners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
                  </select>
                  <input value={assign.price} onChange={(e) => setAssign({ ...assign, price: e.target.value })} placeholder="Charge AED (incl. VAT)" className={inp} inputMode="decimal" />
                  <input value={assign.eta} onChange={(e) => setAssign({ ...assign, eta: e.target.value })} placeholder="ETA min" className={inp} inputMode="numeric" />
                  <button onClick={() => void act({ action: "assign", partnerId: assign.partnerId, price: assign.price, etaMinutes: assign.eta ? Number(assign.eta) : "" }, "Partner assigned.")} className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white">Assign</button>
                </div>
              )}
              <p className="mt-1 text-[11px] text-neutral-400">Charge and ETA are shown to the customer only once you enter them.</p>
            </div>
          )}

          {r.kind === "towing" && (
            <div>
              <p className="mb-2 font-semibold text-neutral-800">Bids ({d!.bids.length}){r.bidsCloseAt && <span className="font-normal text-neutral-400"> · close {dt(r.bidsCloseAt)}</span>}</p>
              {d!.bids.length === 0 ? (
                <p className="text-neutral-400">No bids yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-left text-neutral-400"><tr><th className="py-1">Partner</th><th>Price</th><th>ETA</th><th>Reconfirmed</th><th>Status</th></tr></thead>
                  <tbody>
                    {d!.bids.map((b) => (
                      <tr key={b.id} className="border-t border-neutral-100">
                        <td className="py-1.5">{b.partner}<span className="block text-neutral-400">{b.terms}</span></td>
                        <td className="font-semibold">{aed(b.priceFils)}</td>
                        <td>{b.etaMinutes} min</td>
                        <td>{b.confirmedEtaMinutes != null ? `${b.confirmedEtaMinutes} min` : "—"}</td>
                        <td className="capitalize">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {!closed && (
            <div className="flex flex-wrap items-center gap-2">
              {r.status === "assigned" && <button onClick={() => void act({ action: "en_route" }, "Marked on the way.")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Mark on the way</button>}
              {["assigned", "en_route", "confirmed", "in_progress"].includes(r.status) && <button onClick={() => void act({ action: "complete" }, "Marked completed.")} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Mark completed</button>}
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancel reason" className={`${inp} max-w-[220px]`} />
              <button onClick={() => void act({ action: "cancel", reason }, "Request cancelled.")} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel request</button>
            </div>
          )}

          <div>
            <p className="mb-1 font-semibold text-neutral-800">Internal note</p>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} placeholder="Visible to WD staff only" />
              <button onClick={() => void act({ action: "note", note }, "Note saved.")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs">Save</button>
            </div>
          </div>

          <div>
            <p className="mb-1 font-semibold text-neutral-800">History</p>
            <ol className="space-y-1 border-l-2 border-neutral-200 pl-3 text-xs">
              {d!.events.map((e) => (
                <li key={e.id}><span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span>{e.detail && ` — ${e.detail}`} <span className="text-neutral-400">· {e.actorName ?? "System"} ({e.actorRole}) · {dt(e.createdAt)}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

// --- Orders ---------------------------------------------------------------------------

function OrdersTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const api = useAdminFetch(onUnauthorized);
  const [orders, setOrders] = useState<Array<{ id: string; code: string; customerName: string; customerMobile: string; items: Array<{ name: string; qty: number }>; fulfilment: string; address: string; emirate: string | null; vehicle: string | null; totalFils: number; status: string; createdAt: string }> | null>(null);
  const load = useCallback(async () => {
    const { ok, d } = await api("/api/admin/care/orders");
    if (ok) setOrders(d.orders);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const setStatus = async (id: string, status: string) => {
    await api(`/api/admin/care/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    void load();
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
          <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Items</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {orders === null ? (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">Loading…</td></tr>
          ) : orders.length === 0 ? (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">No orders yet.</td></tr>
          ) : (
            orders.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2.5"><p className="font-mono text-xs">{o.code}</p><p className="text-[11px] text-neutral-400">{dt(o.createdAt)}</p></td>
                <td className="px-3 py-2.5"><p>{o.customerName}</p><p className="text-xs text-neutral-500">{o.customerMobile}</p><p className="text-xs text-neutral-400">{o.address}{o.emirate ? `, ${o.emirate}` : ""}</p></td>
                <td className="px-3 py-2.5 text-xs">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}<p className="text-neutral-400">{o.fulfilment}{o.vehicle ? ` · ${o.vehicle}` : ""}</p></td>
                <td className="px-3 py-2.5 font-semibold">{aed(o.totalFils)}</td>
                <td className="px-3 py-2.5">
                  <select value={o.status} onChange={(e) => void setStatus(o.id, e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                    {["placed", "confirmed", "out_for_delivery", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// --- Products --------------------------------------------------------------------------

interface Product {
  id: string; category: string; name: string; brand: string | null; description: string | null; imageUrl: string | null;
  priceFils: number; installFils: number | null; deliveryFils: number | null; compatibility: string | null; inStock: boolean; active: boolean; sample: boolean;
}

const emptyProduct = { category: "battery", name: "", brand: "", description: "", imageUrl: "", price: "", install: "", delivery: "", compatibility: "" };

function ProductsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const api = useAdminFetch(onUnauthorized);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; v: typeof emptyProduct } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { ok, d } = await api("/api/admin/care/products");
    if (ok) setProducts(d.products);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const hasSample = products?.some((p) => p.sample);
  const toAed = (f: number | null) => (f == null ? "" : String(f / 100));

  const save = async () => {
    const { id, v } = edit!;
    const r = await api(id ? `/api/admin/care/products/${id}` : "/api/admin/care/products", { method: id ? "PATCH" : "POST", body: JSON.stringify(v) });
    setMsg(r.ok ? "Saved." : r.d.error || "Failed");
    if (r.ok) {
      setEdit(null);
      void load();
    }
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/admin/care/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    void load();
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setEdit({ v: { ...emptyProduct } })} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white">+ Add product</button>
        {hasSample ? (
          <button onClick={async () => { if (window.confirm("Remove all sample products?")) { await api("/api/admin/care/products/sample", { method: "DELETE" }); void load(); } }} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm">Remove sample products</button>
        ) : (
          <button onClick={async () => { const r = await api("/api/admin/care/products/sample", { method: "POST" }); setMsg(r.ok ? `Loaded ${r.d.count} sample products.` : r.d.error); void load(); }} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm">Load sample catalogue</button>
        )}
        <span className="text-xs text-neutral-500">Prices in AED, VAT inclusive. Compatibility: one vehicle per line, e.g. &quot;Toyota Camry 2015-2022&quot; — leave empty to fit all cars.</span>
      </div>
      {msg && <p className="mb-3 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Fits</th><th className="px-3 py-2">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(products ?? []).map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="px-3 py-2.5"><p className="font-medium">{p.name}</p><p className="text-xs text-neutral-500">{p.brand}{p.sample && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">SAMPLE</span>}</p></td>
                <td className="px-3 py-2.5 capitalize">{p.category}</td>
                <td className="px-3 py-2.5 text-xs"><b>{aed(p.priceFils)}</b>{p.installFils != null && <p>+ install {aed(p.installFils)}</p>}{p.deliveryFils != null && <p>delivery {aed(p.deliveryFils)}</p>}</td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-neutral-500">{p.compatibility?.split("\n").join(", ") || "All vehicles"}</td>
                <td className="px-3 py-2.5 text-xs">
                  <label className="mr-2"><input type="checkbox" checked={p.active} onChange={(e) => void patch(p.id, { active: e.target.checked })} /> Active</label>
                  <label><input type="checkbox" checked={p.inStock} onChange={(e) => void patch(p.id, { inStock: e.target.checked })} /> In stock</label>
                </td>
                <td className="px-3 py-2.5 text-right text-xs">
                  <button onClick={() => setEdit({ id: p.id, v: { category: p.category, name: p.name, brand: p.brand ?? "", description: p.description ?? "", imageUrl: p.imageUrl ?? "", price: toAed(p.priceFils), install: toAed(p.installFils), delivery: toAed(p.deliveryFils), compatibility: p.compatibility ?? "" } })} className="mr-2 underline">Edit</button>
                  <button onClick={async () => { if (window.confirm(`Delete ${p.name}?`)) { await api(`/api/admin/care/products/${p.id}`, { method: "DELETE" }); void load(); } }} className="text-red-600 underline">Delete</button>
                </td>
              </tr>
            ))}
            {products?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400">No products yet. Add one or load the sample catalogue.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? "Edit product" : "Add product"} onClose={() => setEdit(null)}>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <label>Category<select value={edit.v.category} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, category: e.target.value } })} className={inp}><option value="battery">Car Batteries</option><option value="oil">Oil &amp; Filters</option><option value="accessory">Accessories</option></select></label>
            <label>Brand<input value={edit.v.brand} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, brand: e.target.value } })} className={inp} /></label>
            <label className="sm:col-span-2">Name *<input value={edit.v.name} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, name: e.target.value } })} className={inp} /></label>
            <label className="sm:col-span-2">Description<textarea rows={2} value={edit.v.description} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, description: e.target.value } })} className={inp} /></label>
            <label>Price AED (incl. VAT) *<input value={edit.v.price} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, price: e.target.value } })} className={inp} inputMode="decimal" /></label>
            <label>Installation AED<input value={edit.v.install} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, install: e.target.value } })} className={inp} inputMode="decimal" placeholder="empty = not offered" /></label>
            <label>Delivery AED<input value={edit.v.delivery} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, delivery: e.target.value } })} className={inp} inputMode="decimal" placeholder="empty = free" /></label>
            <label>Image URL<input value={edit.v.imageUrl} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, imageUrl: e.target.value } })} className={inp} placeholder="https://…" /></label>
            <label className="sm:col-span-2">Compatible vehicles (one per line)<textarea rows={4} value={edit.v.compatibility} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, compatibility: e.target.value } })} className={inp} placeholder={"Toyota Camry 2015-2022\nNissan Patrol"} /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">Cancel</button>
            <button onClick={() => void save()} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// --- Partners ---------------------------------------------------------------------------

interface Partner { id: string; name: string; contactName: string | null; email: string; phone: string | null; services: string[]; emirates: string[]; active: boolean; approvalStatus: string; bids: number; jobs: number }

function PartnersTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const api = useAdminFetch(onUnauthorized);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<{ id: string; services: string[]; emirates: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { ok, d } = await api("/api/admin/care/partners");
    if (ok) setPartners(d.partners);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const saveEdit = async () => {
    const r = await api(`/api/admin/care/partners/${edit!.id}`, { method: "PATCH", body: JSON.stringify({ careServices: edit!.services, careEmirates: edit!.emirates }) });
    setMsg(r.ok ? "Coverage updated." : r.d.error || "Failed");
    if (r.ok) {
      setEdit(null);
      void load();
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setCreate(true)} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white">+ Add Care partner</button>
        <span className="text-xs text-neutral-500">
          Care partners register through the normal partner sign-up (Partner type: Towing &amp; Roadside) and are approved in <b>2. Manage Companies</b> like any partner. They sign in at /manage-inspections.
        </span>
      </div>
      {msg && <p className="mb-3 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr><th className="px-3 py-2">Partner</th><th className="px-3 py-2">Services</th><th className="px-3 py-2">Emirates</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(partners ?? []).map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="px-3 py-2.5"><a href={`/admin/inspections/companies/${p.id}`} className="font-medium hover:text-red-600 hover:underline">{p.name}</a><p className="text-xs text-neutral-500">{p.email} · {p.phone}</p></td>
                <td className="px-3 py-2.5 text-xs">{p.services.map((s) => SERVICE_OPTIONS.find((o) => o.id === s)?.label ?? s).join(", ")}</td>
                <td className="px-3 py-2.5 text-xs">{p.emirates.length ? p.emirates.join(", ") : "All emirates"}</td>
                <td className="px-3 py-2.5 text-xs"><StatusBadge status={p.approvalStatus === "approved" ? (p.active ? "confirmed" : "cancelled") : "submitted"} /><p className="mt-1 text-neutral-500">{p.approvalStatus}{!p.active && " · inactive"} · {p.bids} bids · {p.jobs} jobs</p></td>
                <td className="px-3 py-2.5 text-right text-xs">
                  <button onClick={() => setEdit({ id: p.id, services: p.services, emirates: p.emirates })} className="mr-2 underline">Edit coverage</button>
                  <a href={`/admin/inspections/companies/${p.id}`} className="underline">Approve / manage</a>
                </td>
              </tr>
            ))}
            {partners?.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">No Care partners yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {create && (
        <CreateDialog
          companies={[]}
          defaultRole="company"
          defaultPartnerType="care"
          onClose={() => setCreate(false)}
          onUnauthorized={onUnauthorized}
          onCreated={async (m) => {
            setCreate(false);
            setMsg(m);
            await load();
          }}
        />
      )}
      {edit && (
        <Modal title="Care coverage" onClose={() => setEdit(null)}>
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Services</p>
            <div className="flex flex-wrap gap-3">{SERVICE_OPTIONS.map((s) => <label key={s.id} className="text-xs"><input type="checkbox" checked={edit.services.includes(s.id)} onChange={() => setEdit({ ...edit, services: toggle(edit.services, s.id) })} /> {s.label}</label>)}</div>
            <p className="font-semibold">Emirates <span className="font-normal text-neutral-400">(none = all)</span></p>
            <div className="flex flex-wrap gap-3">{EMIRATES.map((e) => <label key={e} className="text-xs"><input type="checkbox" checked={edit.emirates.includes(e)} onChange={() => setEdit({ ...edit, emirates: toggle(edit.emirates, e) })} /> {e}</label>)}</div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">Cancel</button>
            <button onClick={() => void saveEdit()} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}
