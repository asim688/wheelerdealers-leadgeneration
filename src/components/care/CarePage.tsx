"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomerOtpModal from "../CustomerOtpModal";
import { AddressField, CareFooter, CareHeader, Field, aed, inputCls, type AddressValue } from "./careUi";
import { IconArrow, IconBag, IconBattery, IconCheck, IconClock, IconFuel, IconOil, IconPhone, IconPin, IconSearch, IconShield, IconSiren, IconTag, IconToolbox, IconTruck } from "./careIcons";

type Tab = "roadside" | "care";
type RoadsideService = "jump_start" | "emergency_tow" | "fuel_delivery";
type CareView = "battery" | "oil" | "accessory" | "towing";
type FormService = RoadsideService | "scheduled_tow";

type IconC = (p: { className?: string }) => React.JSX.Element;
interface ServiceDef { id: string; title: string; sub: string; blurb: string; Icon: IconC; badges: string[]; urgent?: boolean }

const ROADSIDE: (ServiceDef & { id: RoadsideService })[] = [
  { id: "emergency_tow", title: "Emergency Tow", sub: "WD-managed dispatch", blurb: "Breakdown or accident? WD assigns the nearest available recovery partner and keeps you updated until your car is safe.", Icon: IconSiren, badges: ["Urgent", "Pay on site"], urgent: true },
  { id: "jump_start", title: "Jump Start", sub: "Battery assistance", blurb: "Dead battery? A partner comes to you and gets the car running again.", Icon: IconBattery, badges: ["WD-managed", "Pay on site"] },
  { id: "fuel_delivery", title: "Fuel Delivery", sub: "Emergency supply", blurb: "Out of fuel? Petrol or diesel delivered to where you are.", Icon: IconFuel, badges: ["WD-managed", "Pay on site"] },
];

const CARE: (ServiceDef & { id: Exclude<CareView, "towing"> })[] = [
  { id: "battery", title: "Car Batteries", sub: "Compatible products + price", blurb: "Find the right battery for your car — delivered, or delivered and fitted.", Icon: IconBattery, badges: ["Fits your car", "VAT included"] },
  { id: "oil", title: "Oil & Filters", sub: "Product price + order", blurb: "Engine oil and filters matched to your vehicle.", Icon: IconOil, badges: ["Fits your car"] },
  { id: "accessory", title: "Accessories", sub: "Browse + purchase", blurb: "Dash cams, sunshades, inflators and more.", Icon: IconToolbox, badges: ["Browse & buy"] },
];

const QUICK: { label: string; tab: Tab; target: RoadsideService | CareView }[] = [
  { label: "Jump start", tab: "roadside", target: "jump_start" },
  { label: "Emergency tow", tab: "roadside", target: "emergency_tow" },
  { label: "Fuel", tab: "roadside", target: "fuel_delivery" },
  { label: "Battery", tab: "care", target: "battery" },
  { label: "Oil", tab: "care", target: "oil" },
  { label: "Towing quotes", tab: "care", target: "towing" },
];

const EMIRATES_STRIP = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

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

  const pick = (m: { tab: Tab; target: RoadsideService | CareView }) => {
    go(m);
    setQuery("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <CareHeader />
      <main className="flex-1">
        {/* Hero — Grid Pattern + soft glow, light */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="care-grid-bg absolute inset-0" />
          <div aria-hidden className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-red-200/50 blur-3xl" />
          <div aria-hidden className="absolute -left-32 top-40 h-72 w-72 rounded-full bg-rose-100/70 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-10 sm:pt-16 lg:grid-cols-[1.2fr_1fr] lg:pb-16">
            <div>
              <p className="care-pop inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                </span>
                The Wheeler Dealers / Care · All 7 emirates
              </p>
              <h1 className="care-pop mt-5 text-[2.75rem] font-extrabold leading-[1.02] tracking-tight text-neutral-900 [animation-delay:80ms] sm:text-6xl">
                Your Car.
                <br />
                <span className="care-gradient-text">Our Care.</span>
              </h1>
              <p className="care-pop mt-4 max-w-lg text-base text-neutral-600 [animation-delay:160ms] sm:text-lg">
                Roadside help, towing quotes and car-care products — in one place. How can we help with your car today?
              </p>

              <form onSubmit={submitSearch} className="care-pop relative mt-7 max-w-xl [animation-delay:240ms]">
                <div className="care-beam rounded-2xl bg-white shadow-xl shadow-red-900/5">
                  <IconSearch className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search jump start, towing, car batteries, fuel delivery, accessories..."
                    className="relative h-14 w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-28 text-[15px] text-neutral-900 outline-none text-ellipsis placeholder:text-neutral-400 focus:border-red-300"
                    aria-label="How can we help with your car today?"
                  />
                  <button type="submit" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600">
                    Search
                  </button>
                </div>
                {matches.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-800 shadow-2xl">
                    {matches.map((m) => (
                      <li key={m.label}>
                        <button type="button" onClick={() => pick(m)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-red-50">
                          <span className="font-medium">{m.label}</span>
                          <span className="text-xs text-neutral-400">{m.tab === "roadside" ? "Roadside Assistance" : "Car Care & Accessories"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </form>

              <div className="care-pop mt-4 flex flex-wrap gap-2 [animation-delay:320ms]" aria-label="Popular searches">
                {QUICK.map((q) => (
                  <button key={q.label} type="button" onClick={() => pick(q)} className="rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:-translate-y-px hover:border-red-300 hover:text-red-700">
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <LiveDemo />
          </div>
        </section>

        {/* Marquee — coverage + promises */}
        <div className="care-marquee overflow-hidden border-y border-neutral-100 bg-neutral-50/70 py-3">
          <div className="care-marquee-track flex w-max gap-8 pr-8">
            {[0, 1].map((k) => (
              <div key={k} aria-hidden={k === 1} className="flex shrink-0 items-center gap-8 text-sm font-medium text-neutral-500">
                {EMIRATES_STRIP.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5"><IconPin className="h-4 w-4 text-red-500" />{e}</span>
                ))}
                <span className="inline-flex items-center gap-1.5"><IconShield className="h-4 w-4 text-red-500" />Approved partners only</span>
                <span className="inline-flex items-center gap-1.5"><IconTag className="h-4 w-4 text-red-500" />VAT-inclusive prices</span>
                <span className="inline-flex items-center gap-1.5"><IconClock className="h-4 w-4 text-red-500" />Live status in My requests</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-20 pt-10">
          {/* Segmented tabs */}
          <div role="tablist" aria-label="Care categories" className="mx-auto grid max-w-xl grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1">
            {(["roadside", "care"] as Tab[]).map((t) => {
              const on = tab === t;
              const Icon = t === "roadside" ? IconSiren : IconBag;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={on}
                  aria-pressed={on}
                  onClick={() => setTab(t)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${on ? "bg-white text-red-700 shadow-sm ring-1 ring-black/5" : "text-neutral-600 hover:text-neutral-900"}`}
                >
                  <Icon className="h-4 w-4" />
                  {t === "roadside" ? "Roadside Assistance" : "Car Care & Accessories"}
                </button>
              );
            })}
          </div>

          <div id="care-content" className="scroll-mt-20 pt-8">
            {tab === "roadside" ? (
              <div key="roadside" className="care-pop">
                <SectionHead eyebrow="WD-managed" title="Roadside Assistance" text="WD coordinates the service; approved partners fulfil it. You pay the partner on site." />
                <div className="grid gap-4 md:grid-cols-2 md:grid-rows-2">
                  {ROADSIDE.map((s, i) => (
                    <ServiceCard key={s.id} def={s} big={i === 0} className={i === 0 ? "md:row-span-2" : ""} active={roadside === s.id} onClick={() => setRoadside(s.id)} />
                  ))}
                </div>
                <a href="tel:999" className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 transition-colors hover:border-red-200">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <IconPhone className="h-4 w-4" />
                  </span>
                  <span>
                    <b className="text-neutral-900">Anyone hurt or in danger? Call 999 first.</b>{" "}
                    <span className="text-neutral-500">Estimated arrival and charges are shown only once confirmed by WD or the partner.</span>
                  </span>
                </a>
                {roadside ? <RequestForm key={roadside} service={roadside} /> : <HowItWorks steps={ROADSIDE_STEPS} />}
              </div>
            ) : (
              <div key="care" className="care-pop">
                <SectionHead eyebrow="VAT-inclusive prices" title="Car Care & Accessories" text="Products that fit your car, plus scheduled towing with partner quotes." />
                <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
                  <TowingTile active={careView === "towing"} onClick={() => setCareView("towing")} />
                  {CARE.map((c, i) => (
                    <ServiceCard key={c.id} def={c} className={i === 0 ? "md:col-span-2" : ""} active={careView === c.id} onClick={() => setCareView(c.id)} />
                  ))}
                </div>
                {careView === "towing" && <RequestForm key="tow" service="scheduled_tow" />}
                {careView && careView !== "towing" && <Catalogue key={careView} category={careView} />}
                {!careView && <HowItWorks steps={CARE_STEPS} />}
              </div>
            )}
          </div>
        </div>
      </main>
      <CareFooter />
    </div>
  );
}

/** Animated List: an example request moving through its statuses. */
const DEMO_STEPS = [
  { Icon: IconPin, title: "Request received", text: "Jump start · Dubai Marina", tone: "bg-neutral-100 text-neutral-700" },
  { Icon: IconShield, title: "WD reviewing", text: "Finding an approved partner nearby", tone: "bg-amber-50 text-amber-700" },
  { Icon: IconCheck, title: "Partner assigned", text: "Charge and arrival time confirmed with you", tone: "bg-blue-50 text-blue-700" },
  { Icon: IconTruck, title: "On the way", text: "Track it live under My requests", tone: "bg-indigo-50 text-indigo-700" },
  { Icon: IconCheck, title: "Completed", text: "Pay the partner on site", tone: "bg-green-50 text-green-700" },
];

function LiveDemo() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(DEMO_STEPS.length - 1);
    const t = setInterval(() => setN((c) => (c + 1) % DEMO_STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-hidden className="relative mx-auto hidden w-full max-w-sm lg:block">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-red-100/60 via-white to-rose-50 blur-xl" />
      <div className="relative rounded-3xl border border-neutral-200 bg-white/90 p-4 shadow-2xl shadow-red-900/10 backdrop-blur">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Example request</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live updates
          </span>
        </div>
        <ul className="space-y-2">
          {DEMO_STEPS.map((s, i) => {
            const state = i < n ? "done" : i === n ? "now" : "next";
            return (
              <li
                key={s.title}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-all duration-500 ${state === "now" ? "care-pop border-red-200 bg-white shadow-md shadow-red-100" : state === "done" ? "border-neutral-100 bg-white" : "border-dashed border-neutral-200 bg-neutral-50/60 opacity-50"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${state === "next" ? "bg-neutral-100 text-neutral-400" : s.tone}`}>
                  <s.Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-900">{s.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{s.text}</span>
                </span>
                {state === "done" && <IconCheck className="h-4 w-4 shrink-0 text-green-600" />}
                {state === "now" && <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-red-500" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const ROADSIDE_STEPS = [
  { Icon: IconPin, title: "Tell us where you are", text: "Pick a service and send a short request with your location." },
  { Icon: IconShield, title: "WD assigns a partner", text: "We review it and confirm the charge and arrival time with you." },
  { Icon: IconCheck, title: "Pay when it's done", text: "You pay the partner on the spot after the service." },
];

const CARE_STEPS = [
  { Icon: IconSearch, title: "Choose what you need", text: "Batteries, oil, accessories — or request towing quotes." },
  { Icon: IconTag, title: "Compare clearly", text: "VAT-inclusive prices, compatibility and, for towing, price with arrival time." },
  { Icon: IconCheck, title: "Order or book", text: "Pay online by card or Tamara and track everything under My requests." },
];

const spotlight = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
};

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function HowItWorks({ steps }: { steps: { Icon: IconC; title: string; text: string }[] }) {
  return (
    <section className="mt-12">
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">How it works</p>
      <ol className="relative grid gap-6 sm:grid-cols-3">
        <span aria-hidden className="absolute left-[16%] right-[16%] top-6 hidden border-t-2 border-dashed border-red-200 sm:block" />
        {steps.map((s, i) => (
          <li key={s.title} className="relative text-center">
            <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-red-600 shadow-sm">
              <s.Icon className="h-5 w-5" />
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">{i + 1}</span>
            </span>
            <span className="mt-3 block text-sm font-bold text-neutral-900">{s.title}</span>
            <span className="mx-auto mt-1 block max-w-[16rem] text-xs leading-relaxed text-neutral-500">{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Magic Card + Bento tile. */
function ServiceCard({ def, active, onClick, big, className = "" }: { def: ServiceDef; active: boolean; onClick: () => void; big?: boolean; className?: string }) {
  const { Icon } = def;
  return (
    <button
      onClick={onClick}
      onMouseMove={spotlight}
      aria-pressed={active}
      className={`care-spot group flex flex-col overflow-hidden rounded-3xl border bg-white p-5 text-left transition-all duration-300 sm:p-6 ${active ? "border-red-300 shadow-lg shadow-red-100 ring-2 ring-red-500/30" : "border-neutral-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-xl hover:shadow-neutral-200/60"} ${className}`}
    >
      {big && <span aria-hidden className="care-grid-bg pointer-events-none absolute inset-0 -z-10 opacity-70 [mask-image:radial-gradient(ellipse_at_top_right,#000_15%,transparent_70%)]" />}
      <span className="flex items-start justify-between gap-3">
        <span className={`flex shrink-0 items-center justify-center rounded-2xl transition-colors ${big ? "h-16 w-16" : "h-12 w-12"} ${active ? "bg-red-600 text-white" : "bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white"}`}>
          <Icon className={big ? "h-8 w-8" : "h-6 w-6"} />
        </span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${active ? "border-red-600 bg-red-600 text-white" : "border-neutral-200 text-neutral-400 group-hover:border-red-600 group-hover:bg-red-600 group-hover:text-white"}`}>
          {active ? <IconCheck className="h-4 w-4" /> : <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </span>
      </span>
      {big && (
        <span aria-hidden className="mt-8 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          {["Submitted", "WD Reviewing", "Partner Assigned", "En Route", "Completed"].map((t, i, a) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 ${i === 0 ? "bg-red-600 text-white" : "border border-neutral-200 bg-white text-neutral-500"}`}>{t}</span>
              {i < a.length - 1 && <span className="text-neutral-300">›</span>}
            </span>
          ))}
        </span>
      )}
      <span className={`block ${big ? "mt-auto pt-8" : "mt-5"}`}>
        <span className="flex flex-wrap items-center gap-2">
          <span className={`font-bold tracking-tight text-neutral-900 ${big ? "text-2xl" : "text-lg"}`}>{def.title}</span>
          {def.urgent && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 ring-1 ring-red-200">Urgent</span>}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-neutral-500">{def.blurb}</span>
        <span className="mt-4 flex flex-wrap gap-1.5">
          {def.badges.filter((b) => b !== "Urgent").map((b) => (
            <span key={b} className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">{b}</span>
          ))}
        </span>
      </span>
    </button>
  );
}

/** Big bento tile for scheduled towing: Border Beam + Shimmer Button + mini bid comparison. */
function TowingTile({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseMove={spotlight}
      aria-pressed={active}
      className={`care-spot care-beam group flex flex-col overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-red-50/60 p-5 text-left transition-all sm:p-6 md:col-span-2 md:row-span-2 ${active ? "border-red-300 ring-2 ring-red-500/30" : "border-neutral-200 hover:shadow-xl hover:shadow-red-100/60"}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-200">
          <IconTruck className="h-7 w-7" />
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Reverse bidding · 15 min</span>
      </span>
      <span className="mt-5 block text-2xl font-bold tracking-tight text-neutral-900">Vehicle Towing — Get Quotes</span>
      <span className="mt-1 block text-sm leading-relaxed text-neutral-500">Scheduled transport. Approved partners bid — you compare price and arrival time side by side, then choose.</span>
      <span aria-hidden className="mt-5 block space-y-2">
        {[
          ["Partner A", "AED —", "ETA — min", "w-3/5"],
          ["Partner B", "AED —", "ETA — min", "w-4/5"],
        ].map(([p, a, e, w]) => (
          <span key={p} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white/90 px-3 py-2 text-xs">
            <span className="h-7 w-7 shrink-0 rounded-full bg-neutral-100" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-neutral-800">{p}</span>
              <span className={`mt-1 block h-1.5 rounded-full bg-red-100 ${w}`} />
            </span>
            <span className="text-right text-neutral-500">{a}<br />{e}</span>
          </span>
        ))}
      </span>
      <span className="care-shimmer mt-auto inline-flex w-fit items-center gap-2 self-start rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-colors group-hover:bg-red-700 [margin-top:1.25rem]">
        Get Quotes <IconArrow className="h-4 w-4" />
      </span>
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
    <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
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
      <div className="border-b border-neutral-100 bg-neutral-50 px-5 py-4 sm:px-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-neutral-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">{service === "scheduled_tow" || service === "emergency_tow" ? <IconTruck className="h-4 w-4" /> : service === "fuel_delivery" ? <IconFuel className="h-4 w-4" /> : <IconBattery className="h-4 w-4" />}</span>
        {FORM_TITLE[service]}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {tow
          ? "Tell us the pickup, destination and timing. For the next 15 minutes approved towing partners send their price (incl. VAT) and arrival time — you compare, choose and pay online (card or Tamara)."
          : "Send a short request. WD reviews it, assigns an available partner and confirms the charge and arrival time with you. You pay the partner on the spot once the service is done."}
      </p>
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <FormStep n={1} title="Your details" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" />
          </Field>
          <Field label="Contact number" hint="We verify it with a one-time code.">
            <input value={profile?.mobile ?? ""} readOnly placeholder="Verified when you send" className={`${inputCls} bg-neutral-50`} />
          </Field>
        </div>
        <FormStep n={2} title="Your vehicle" />
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

        <FormStep n={3} title="Location" />
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

        <FormStep n={4} title={tow ? "Notes" : "What happened"} />
        <Field label={service === "jump_start" ? "What's the problem?" : service === "emergency_tow" ? "Condition / safety notes" : "Notes"} required={service === "jump_start"}>
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} className={inputCls} placeholder={service === "jump_start" ? "e.g. Car won't start, lights are dim" : "Anything the partner should know"} />
        </Field>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="sticky bottom-3 z-10 -mx-1 rounded-xl bg-white/90 p-1 backdrop-blur sm:static sm:m-0 sm:bg-transparent sm:p-0">
          <button onClick={() => void submit()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-200 transition-colors hover:bg-red-700 disabled:opacity-50">
            {busy ? "Sending…" : tow ? "Request Partner Bids" : "Submit Request"} {!busy && <IconArrow className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormStep({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-neutral-100 pt-4 first:border-0 first:pt-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">{n}</span>
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">{title}</span>
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

const CAT_ICON: Record<string, IconC> = { battery: IconBattery, oil: IconOil, accessory: IconToolbox };

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
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : (() => { const Ico = CAT_ICON[p.category] ?? IconToolbox; return <Ico className="h-8 w-8 text-red-600" />; })()}
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
