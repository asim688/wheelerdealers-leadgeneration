"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomerOtpModal from "../CustomerOtpModal";
import { AddressField, CareFooter, CareHeader, Field, aed, inputCls, type AddressValue } from "./careUi";

type Tab = "roadside" | "care";
type RoadsideService = "jump_start" | "emergency_tow" | "fuel_delivery";
type CareView = "battery" | "oil" | "accessory" | "towing";
type FormService = RoadsideService | "scheduled_tow";

const ROADSIDE: { id: RoadsideService; title: string; sub: string; icon: string }[] = [
  { id: "jump_start", title: "Jump Start", sub: "Battery assistance", icon: "🔋" },
  { id: "emergency_tow", title: "Emergency Tow", sub: "WD-managed dispatch", icon: "🚨" },
  { id: "fuel_delivery", title: "Fuel Delivery", sub: "Emergency supply", icon: "⛽" },
];

const CARE: { id: Exclude<CareView, "towing">; title: string; sub: string; icon: string }[] = [
  { id: "battery", title: "Car Batteries", sub: "Compatible products + price", icon: "🔋" },
  { id: "oil", title: "Oil & Filters", sub: "Product price + order", icon: "🛢️" },
  { id: "accessory", title: "Accessories", sub: "Browse + purchase", icon: "🧰" },
];

/** Search index: what the customer might type → where it leads. */
const SEARCH: { label: string; tab: Tab; target: RoadsideService | CareView; words: string[] }[] = [
  { label: "Battery jump start", tab: "roadside", target: "jump_start", words: ["jump", "start", "dead battery", "won't start", "boost", "flat battery"] },
  { label: "Emergency towing", tab: "roadside", target: "emergency_tow", words: ["emergency", "accident", "breakdown", "tow now", "stuck", "recovery"] },
  { label: "Emergency fuel delivery", tab: "roadside", target: "fuel_delivery", words: ["fuel", "petrol", "diesel", "empty tank", "gas"] },
  { label: "Scheduled towing — get quotes", tab: "care", target: "towing", words: ["tow", "towing", "transport", "move car", "flatbed", "quote", "workshop"] },
  { label: "Car batteries", tab: "care", target: "battery", words: ["battery", "batteries", "amp", "ah"] },
  { label: "Oil & filters", tab: "care", target: "oil", words: ["oil", "filter", "service", "5w", "0w", "engine oil"] },
  { label: "Accessories", tab: "care", target: "accessory", words: ["accessor", "dash cam", "sunshade", "inflator", "kit", "charger"] },
];

function searchMatches(q: string) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  return SEARCH.filter((e) => e.label.toLowerCase().includes(s) || e.words.some((w) => w.includes(s) || s.includes(w)));
}

export default function CarePage({ initialQuery = "" }: { initialQuery?: string }) {
  const [tab, setTab] = useState<Tab>("roadside");
  const [roadside, setRoadside] = useState<RoadsideService | null>(null);
  const [careView, setCareView] = useState<CareView | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const matches = useMemo(() => searchMatches(query), [query]);

  const go = (m: { tab: Tab; target: RoadsideService | CareView }) => {
    setTab(m.tab);
    if (m.tab === "roadside") {
      setRoadside(m.target as RoadsideService);
      setCareView(null);
    } else {
      setCareView(m.target as CareView);
      setRoadside(null);
    }
    setTimeout(() => document.getElementById("care-content")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    if (initialQuery) {
      const m = searchMatches(initialQuery)[0];
      if (m) go(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const m = matches[0];
    if (m) {
      go(m);
      setQuery("");
    } else if (query.trim()) {
      go({ tab: "care", target: "accessory" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <CareHeader />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-red-700 via-red-600 to-red-800 px-5 pb-16 pt-10 text-white">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-100">The Wheeler Dealers / Care</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Your Car. Our Care.</h1>
            <p className="mt-1 text-sm text-red-100">How can we help with your car today?</p>
            <form onSubmit={submitSearch} className="relative mt-5">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jump start, towing, car batteries, fuel delivery, accessories..."
                className="w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-sm text-neutral-900 shadow-lg outline-none ring-2 ring-transparent placeholder:text-neutral-400 focus:ring-red-200"
                aria-label="How can we help with your car today?"
              />
              {matches.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm text-neutral-800 shadow-xl">
                  {matches.map((m) => (
                    <li key={m.label}>
                      <button type="button" onClick={() => { go(m); setQuery(""); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-red-50">
                        <span>{m.label}</span>
                        <span className="text-xs text-neutral-400">{m.tab === "roadside" ? "Roadside Assistance" : "Car Care & Accessories"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </div>
        </section>

        <div className="mx-auto -mt-8 max-w-4xl px-5 pb-14">
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
            {(["roadside", "care"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-4 text-left transition-colors sm:px-6 ${tab === t ? "bg-white" : "bg-neutral-50 hover:bg-neutral-100"}`}
                aria-pressed={tab === t}
              >
                <span className={`block text-sm font-bold uppercase tracking-wide ${tab === t ? "text-red-700" : "text-neutral-700"}`}>
                  {t === "roadside" ? "Roadside Assistance" : "Car Care & Accessories"}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {t === "roadside" ? "Jump Start | Emergency Towing | Fuel" : "Batteries | Oil | Accessories | Towing"}
                </span>
                <span className={`mt-3 block h-0.5 rounded ${tab === t ? "bg-red-600" : "bg-transparent"}`} />
              </button>
            ))}
          </div>

          <div id="care-content" className="scroll-mt-20 pt-6">
            {tab === "roadside" ? (
              <>
                <p className="mb-3 text-sm text-neutral-600">WD coordinates the service; approved partners fulfil it.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ROADSIDE.map((s) => (
                    <ServiceCard key={s.id} icon={s.icon} title={s.title} sub={s.sub} active={roadside === s.id} onClick={() => setRoadside(s.id)} />
                  ))}
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  If anyone is hurt or in danger, call <b>999</b> first. Estimated arrival and charges are shown only once confirmed by WD or the partner.
                </p>
                {roadside && <RequestForm key={roadside} service={roadside} />}
                {!roadside && <p className="mt-6 text-center text-sm text-neutral-500">Select a service to send a request.</p>}
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-neutral-600">Visible VAT-inclusive prices, plus scheduled towing with partner quotes.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CARE.map((c) => (
                    <ServiceCard key={c.id} icon={c.icon} title={c.title} sub={c.sub} active={careView === c.id} onClick={() => setCareView(c.id)} />
                  ))}
                </div>
                <button
                  onClick={() => setCareView("towing")}
                  className={`mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${careView === "towing" ? "border-red-600 bg-red-50" : "border-red-200 bg-white hover:border-red-400"}`}
                >
                  <span>
                    <span className="block text-base font-bold text-neutral-900">🚛 Vehicle Towing — Get Quotes</span>
                    <span className="block text-xs text-neutral-500">Scheduled transport · Reverse bidding · Compare partner offers (price + arrival time)</span>
                  </span>
                  <span className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Get Quotes</span>
                </button>
                {careView === "towing" && <RequestForm key="tow" service="scheduled_tow" />}
                {careView && careView !== "towing" && <Catalogue key={careView} category={careView} />}
                {!careView && <p className="mt-6 text-center text-sm text-neutral-500">Select a category to view available products and services.</p>}
              </>
            )}
          </div>
        </div>
      </main>
      <CareFooter />
    </div>
  );
}

function ServiceCard({ icon, title, sub, active, onClick }: { icon: string; title: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border-2 bg-white p-4 text-left transition-colors ${active ? "border-red-600 bg-red-50/50" : "border-neutral-200 hover:border-red-300"}`}
    >
      <span className="text-2xl" aria-hidden>{icon}</span>
      <span className="mt-2 block text-sm font-bold uppercase tracking-wide text-neutral-900">{title}</span>
      <span className="block text-xs text-neutral-500">{sub}</span>
    </button>
  );
}

// --- Request forms (roadside + scheduled tow) ------------------------------------

const FORM_TITLE: Record<FormService, string> = {
  jump_start: "Battery Jump Start",
  emergency_tow: "Emergency Vehicle Towing",
  fuel_delivery: "Emergency Fuel Delivery",
  scheduled_tow: "Scheduled Vehicle Towing",
};

function useCustomerProfile() {
  const [profile, setProfile] = useState<{ name: string; mobile: string } | null>(null);
  useEffect(() => {
    fetch("/api/customer/me")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => d && setProfile({ name: d.customer?.name ?? "", mobile: d.customer?.mobile ?? "" }))
      .catch(() => undefined);
  }, []);
  return profile;
}

const emptyAddr: AddressValue = { address: "", emirate: "" };

function RequestForm({ service }: { service: FormService }) {
  const router = useRouter();
  const profile = useCustomerProfile();
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "" });
  const [pickup, setPickup] = useState<AddressValue>(emptyAddr);
  const [dest, setDest] = useState<AddressValue>(emptyAddr);
  const [condition, setCondition] = useState(service === "emergency_tow" ? "" : "runs");
  const [issue, setIssue] = useState("");
  const [fuel, setFuel] = useState({ type: "", litres: "20" });
  const [schedule, setSchedule] = useState({ date: "", time: "", flexible: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState(false);

  useEffect(() => {
    if (profile?.name && !name) setName(profile.name);
  }, [profile, name]);

  const tow = service === "scheduled_tow";
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/care/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          customerName: name,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year ? Number(vehicle.year) : undefined,
          condition: condition || undefined,
          issue: issue || undefined,
          pickupAddress: pickup.address,
          pickupEmirate: pickup.emirate,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          destAddress: dest.address || undefined,
          destEmirate: dest.emirate || undefined,
          destLat: dest.lat,
          destLng: dest.lng,
          fuelType: fuel.type || undefined,
          fuelLitres: service === "fuel_delivery" ? Number(fuel.litres) : undefined,
          date: schedule.date || undefined,
          time: schedule.flexible ? undefined : schedule.time || undefined,
          flexible: schedule.flexible,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401 && d.loginRequired) return setOtp(true);
      if (!res.ok) return setError(d.error || "Could not send the request.");
      router.push(`/care/requests/${d.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      {otp && (
        <CustomerOtpModal
          mobile={profile?.mobile}
          onClose={() => setOtp(false)}
          onVerified={() => {
            setOtp(false);
            void submit();
          }}
        />
      )}
      <h2 className="text-lg font-bold text-neutral-900">{FORM_TITLE[service]}</h2>
      <p className="mb-4 text-sm text-neutral-500">
        {tow
          ? "Tell us the pickup, destination and timing. For the next 15 minutes approved towing partners send their price (incl. VAT) and arrival time — you compare, choose and pay online (card or Tamara)."
          : "Send a short request. WD reviews it, assigns an available partner and confirms the charge and arrival time with you. You pay the partner on the spot once the service is done."}
      </p>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" />
          </Field>
          <Field label="Contact number" hint="We verify it with a one-time code.">
            <input value={profile?.mobile ?? ""} readOnly placeholder="Verified when you send" className={`${inputCls} bg-neutral-50`} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Make" required>
            <input value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} className={inputCls} placeholder="Toyota" />
          </Field>
          <Field label="Model" required>
            <input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} className={inputCls} placeholder="Camry" />
          </Field>
          <Field label="Year">
            <input value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={inputCls} placeholder="2020" inputMode="numeric" />
          </Field>
        </div>

        <AddressField label={tow || service === "emergency_tow" ? "Pickup location" : "Where is the car?"} value={pickup} onChange={setPickup} />

        {(tow || service === "emergency_tow") && (
          <Field label="Vehicle condition" required={service === "emergency_tow"}>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
              {service === "emergency_tow" && <option value="">Select…</option>}
              <option value="runs">Drives normally</option>
              <option value="not_starting">Won&apos;t start</option>
              <option value="accident">Accident damage</option>
              <option value="flat_tyre">Flat tyre</option>
              <option value="other">Other</option>
            </select>
          </Field>
        )}

        {tow && <AddressField label="Destination" value={dest} onChange={setDest} placeholder="Workshop / home / showroom address" />}
        {service === "emergency_tow" && (
          <Field label="Destination (if known)">
            <input value={dest.address} onChange={(e) => setDest({ ...dest, address: e.target.value })} className={inputCls} placeholder="e.g. Al Quoz workshop" />
          </Field>
        )}

        {service === "fuel_delivery" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fuel type" required>
              <select value={fuel.type} onChange={(e) => setFuel({ ...fuel, type: e.target.value })} className={inputCls}>
                <option value="">Select…</option>
                <option value="petrol_special">Petrol (Special 95)</option>
                <option value="petrol_super">Petrol (Super 98)</option>
                <option value="diesel">Diesel</option>
              </select>
            </Field>
            <Field label="Quantity (litres)" required hint="Availability is confirmed before dispatch.">
              <input type="number" min={5} max={100} value={fuel.litres} onChange={(e) => setFuel({ ...fuel, litres: e.target.value })} className={inputCls} />
            </Field>
          </div>
        )}

        {tow && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pickup date" required>
              <input type="date" min={today} value={schedule.date} onChange={(e) => setSchedule({ ...schedule, date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Pickup time" required={!schedule.flexible}>
              <input type="time" value={schedule.time} disabled={schedule.flexible} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} className={`${inputCls} disabled:bg-neutral-100`} />
            </Field>
            <label className="flex items-end gap-2 pb-3 text-sm text-neutral-700">
              <input type="checkbox" checked={schedule.flexible} onChange={(e) => setSchedule({ ...schedule, flexible: e.target.checked })} className="h-4 w-4 accent-red-600" />
              Flexible on time
            </label>
          </div>
        )}

        <Field label={service === "jump_start" ? "What's the problem?" : service === "emergency_tow" ? "Condition / safety notes" : "Notes"} required={service === "jump_start"}>
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} className={inputCls} placeholder={service === "jump_start" ? "e.g. Car won't start, lights are dim" : "Anything the partner should know"} />
        </Field>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button onClick={() => void submit()} disabled={busy} className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Sending…" : tow ? "Request Partner Bids" : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

// --- Product catalogue + cart -------------------------------------------------------

interface Product {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  priceFils: number;
  installFils: number | null;
  deliveryFils: number | null;
  compatibility: string | null;
  universal: boolean;
  inStock: boolean;
  sample: boolean;
}

interface CartLine {
  product: Product;
  qty: number;
}

const CAT_ICON: Record<string, string> = { battery: "🔋", oil: "🛢️", accessory: "🧰" };

function Catalogue({ category }: { category: Exclude<CareView, "towing"> }) {
  const profile = useCustomerProfile();
  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "" });
  const [applied, setApplied] = useState(vehicle);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placed, setPlaced] = useState<{ code: string; totalFils: number } | null>(null);
  const needsVehicle = category !== "accessory";

  useEffect(() => {
    const q = new URLSearchParams({ category });
    if (applied.make) q.set("make", applied.make);
    if (applied.model) q.set("model", applied.model);
    if (applied.year) q.set("year", applied.year);
    setProducts(null);
    let stale = false; // ignore a slower, older response (e.g. the unfiltered list)
    fetch(`/api/care/products?${q}`)
      .then((r) => r.json())
      .then((d) => !stale && setProducts(d.products ?? []))
      .catch(() => !stale && setProducts([]));
    return () => {
      stale = true;
    };
  }, [category, applied]);

  const add = (p: Product) => {
    setPlaced(null);
    setCart((c) => {
      const line = c.find((l) => l.product.id === p.id);
      return line ? c.map((l) => (l.product.id === p.id ? { ...l, qty: Math.min(10, l.qty + 1) } : l)) : [...c, { product: p, qty: 1 }];
    });
  };

  return (
    <div className="mt-5 space-y-4">
      {needsVehicle && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(vehicle);
          }}
          className="rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <p className="mb-2 text-sm font-semibold text-neutral-800">Find parts that fit your car</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} placeholder="Make (Toyota)" className={inputCls} />
            <input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} placeholder="Model (Camry)" className={inputCls} />
            <input value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Year" inputMode="numeric" className={inputCls} />
            <button className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">Show compatible</button>
          </div>
          {applied.make && (
            <p className="mt-2 text-xs text-neutral-500">
              Showing products for <b>{[applied.year, applied.make, applied.model].filter(Boolean).join(" ")}</b> ·{" "}
              <button type="button" onClick={() => { setVehicle({ make: "", model: "", year: "" }); setApplied({ make: "", model: "", year: "" }); }} className="underline">
                show all
              </button>
            </p>
          )}
        </form>
      )}

      {products === null ? (
        <p className="py-8 text-center text-sm text-neutral-400">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          {applied.make ? "No compatible products found for this vehicle yet." : "Products will appear here soon."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => (
            <div key={p.id} className="flex gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-3xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <span aria-hidden>{CAT_ICON[p.category]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {p.brand} {p.sample && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">SAMPLE</span>}
                </p>
                <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
                {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{p.description}</p>}
                <p className="mt-1 text-[11px] text-neutral-500">{p.universal ? "Fits most vehicles" : `Fits: ${p.compatibility!.split("\n").slice(0, 2).join(", ")}${p.compatibility!.split("\n").length > 2 ? "…" : ""}`}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span>
                    <span className="text-base font-bold text-red-700">{aed(p.priceFils)}</span>
                    <span className="ml-1 text-[10px] text-neutral-400">incl. VAT</span>
                    {p.installFils ? <span className="block text-[11px] text-neutral-500">+ {aed(p.installFils)} installation (optional)</span> : null}
                  </span>
                  <button disabled={!p.inStock} onClick={() => add(p)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-neutral-300">
                    {p.inStock ? "Add" : "Out of stock"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {placed ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
          <p className="text-base font-bold">Order placed — {placed.code}</p>
          <p className="mt-1">Total {aed(placed.totalFils)} incl. VAT. Our team will call you to confirm the delivery / installation time and payment.</p>
        </div>
      ) : (
        cart.length > 0 && (
          <Cart
            cart={cart}
            setCart={setCart}
            onPlaced={setPlaced}
            vehicle={[applied.year, applied.make, applied.model].filter(Boolean).join(" ")}
            defaultName={profile?.name ?? ""}
            mobile={profile?.mobile}
          />
        )
      )}
    </div>
  );
}

function Cart({ cart, setCart, onPlaced, vehicle, defaultName, mobile }: { cart: CartLine[]; setCart: (c: CartLine[]) => void; onPlaced: (p: { code: string; totalFils: number }) => void; vehicle: string; defaultName: string; mobile?: string }) {
  const canInstall = cart.some((l) => l.product.installFils);
  const [fulfilment, setFulfilment] = useState<"delivery" | "installation">("delivery");
  const [addr, setAddr] = useState<AddressValue>(emptyAddr);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState(false);
  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
  }, [defaultName, name]);

  const subtotal = cart.reduce((s, l) => s + l.product.priceFils * l.qty, 0);
  const install = fulfilment === "installation" ? cart.reduce((s, l) => s + (l.product.installFils ?? 0) * l.qty, 0) : 0;
  const delivery = fulfilment === "delivery" ? Math.max(0, ...cart.map((l) => l.product.deliveryFils ?? 0)) : 0;
  const total = subtotal + install + delivery;

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/care/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })), fulfilment, address: addr.address, emirate: addr.emirate, vehicle, customerName: name }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401 && d.loginRequired) return setOtp(true);
      if (!res.ok) return setError(d.error || "Could not place the order.");
      onPlaced({ code: d.code, totalFils: d.totalFils });
      setCart([]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-white p-5">
      {otp && (
        <CustomerOtpModal
          mobile={mobile}
          onClose={() => setOtp(false)}
          onVerified={() => {
            setOtp(false);
            void place();
          }}
        />
      )}
      <h3 className="text-base font-bold text-neutral-900">Your cart</h3>
      <ul className="mt-3 divide-y divide-neutral-100">
        {cart.map((l) => (
          <li key={l.product.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.product.name}</span>
            <span className="flex items-center gap-1">
              <button onClick={() => setCart(l.qty <= 1 ? cart.filter((c) => c !== l) : cart.map((c) => (c === l ? { ...c, qty: c.qty - 1 } : c)))} className="h-7 w-7 rounded border border-neutral-300">−</button>
              <span className="w-6 text-center">{l.qty}</span>
              <button onClick={() => setCart(cart.map((c) => (c === l ? { ...c, qty: Math.min(10, c.qty + 1) } : c)))} className="h-7 w-7 rounded border border-neutral-300">+</button>
            </span>
            <span className="w-24 text-right font-medium">{aed(l.product.priceFils * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2 text-sm">
        <label className={`flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 ${fulfilment === "delivery" ? "border-red-600 bg-red-50" : "border-neutral-200"}`}>
          <input type="radio" className="sr-only" checked={fulfilment === "delivery"} onChange={() => setFulfilment("delivery")} />
          🚚 Delivery
        </label>
        {canInstall && (
          <label className={`flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 ${fulfilment === "installation" ? "border-red-600 bg-red-50" : "border-neutral-200"}`}>
            <input type="radio" className="sr-only" checked={fulfilment === "installation"} onChange={() => setFulfilment("installation")} />
            🔧 Delivery + installation
          </label>
        )}
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Your name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <AddressField label={fulfilment === "installation" ? "Installation address" : "Delivery address"} value={addr} onChange={setAddr} />
      </div>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-neutral-500">Products</dt><dd>{aed(subtotal)}</dd></div>
        {install > 0 && <div className="flex justify-between"><dt className="text-neutral-500">Installation</dt><dd>{aed(install)}</dd></div>}
        <div className="flex justify-between"><dt className="text-neutral-500">Delivery</dt><dd>{delivery ? aed(delivery) : "Free"}</dd></div>
        <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold"><dt>Total (incl. VAT)</dt><dd className="text-red-700">{aed(total)}</dd></div>
      </dl>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button onClick={() => void place()} disabled={busy} className="mt-4 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
        {busy ? "Placing order…" : `Place order · ${aed(total)}`}
      </button>
      <p className="mt-2 text-center text-xs text-neutral-400">Online payment for Care orders will be added once the payment flow is confirmed. WD confirms each order by phone.</p>
    </div>
  );
}
