"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import BrandLogo from "../BrandLogo";
import LocationPicker from "../LocationPicker";
import type { SelectedLocation } from "@/lib/types";

export const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

export const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-red-500 focus:ring-2 focus:ring-red-100";

export const aed = (f: number | null | undefined) =>
  f == null ? "—" : `AED ${(f / 100).toLocaleString("en-AE", { minimumFractionDigits: f % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function matchEmirate(raw?: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const r = norm(raw ?? "");
  return r ? EMIRATES.find((e) => r.includes(norm(e))) ?? "" : "";
}

export interface AddressValue {
  address: string;
  emirate: string;
  lat?: number;
  lng?: number;
}

/** Search-as-you-type address, "use my location" (GPS) and a manual fallback. */
export function AddressField({ label, value, onChange, placeholder }: { label: string; value: AddressValue; onChange: (v: AddressValue) => void; placeholder?: string }) {
  const [gps, setGps] = useState<"idle" | "busy" | "denied">("idle");
  const pick = useCallback(
    (loc: SelectedLocation) => onChange({ address: loc.formattedAddress, emirate: matchEmirate(loc.emirate) || value.emirate, lat: loc.lat, lng: loc.lng }),
    [onChange, value.emirate],
  );
  const useGps = () => {
    if (!navigator.geolocation) return setGps("denied");
    setGps("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Number(p.coords.latitude.toFixed(6));
        const lng = Number(p.coords.longitude.toFixed(6));
        onChange({ ...value, lat, lng, address: value.address || `Pinned location (${lat}, ${lng}) — https://www.google.com/maps?q=${lat},${lng}` });
        setGps("idle");
      },
      () => setGps("denied"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-800">
          {label} <span className="text-red-500">*</span>
        </span>
        <button type="button" onClick={useGps} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
          {gps === "busy" ? "Locating…" : "📍 Use my location"}
        </button>
      </div>
      {gps === "denied" && <p className="text-xs text-amber-700">Location permission is off — type the address instead.</p>}
      {value.lat != null && <p className="text-xs text-green-700">GPS pin saved ({value.lat}, {value.lng}).</p>}
      <LocationPicker onSelect={pick} />
      <textarea
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder={placeholder ?? "Building / street / area / landmark"}
        rows={2}
        className={inputCls}
      />
      <select value={value.emirate} onChange={(e) => onChange({ ...value, emirate: e.target.value })} className={inputCls} aria-label="Emirate">
        <option value="">Emirate…</option>
        {EMIRATES.map((e) => (
          <option key={e}>{e}</option>
        ))}
      </select>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800",
  reviewing: "bg-amber-100 text-amber-800",
  assigned: "bg-blue-100 text-blue-800",
  en_route: "bg-indigo-100 text-indigo-800",
  open: "bg-neutral-100 text-neutral-700",
  bids_received: "bg-amber-100 text-amber-800",
  offer_accepted: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-neutral-200 text-neutral-500",
  placed: "bg-amber-100 text-amber-800",
  out_for_delivery: "bg-indigo-100 text-indigo-800",
};

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "WD Reviewing",
  assigned: "Partner Assigned",
  en_route: "En Route",
  open: "Request Open",
  bids_received: "Bids Received",
  offer_accepted: "Offer Accepted",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  placed: "Order Placed",
  out_for_delivery: "Out for Delivery",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-neutral-100 text-neutral-600"}`}>{STATUS_LABEL[status] ?? status.replace(/_/g, " ")}</span>;
}

/** Ordered steps for the progress tracker. */
export const ROADSIDE_STEPS = ["submitted", "reviewing", "assigned", "en_route", "completed"];
export const TOWING_STEPS = ["open", "bids_received", "offer_accepted", "confirmed", "in_progress", "completed"];

export function StepTracker({ steps, current }: { steps: string[]; current: string }) {
  const idx = steps.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] font-medium">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 ${i < idx ? "bg-green-100 text-green-700" : i === idx ? "bg-red-600 text-white" : "bg-neutral-100 text-neutral-400"}`}>{STATUS_LABEL[s]}</span>
          {i < steps.length - 1 && <span className="text-neutral-300">›</span>}
        </li>
      ))}
    </ol>
  );
}

export function CareHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2.5">
        <Link href="/" aria-label="Home">
          <BrandLogo size="sm" />
        </Link>
        <div className="flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/care" className="rounded-md px-2.5 py-2 font-medium text-neutral-700 hover:bg-neutral-100 sm:px-3">
            Care
          </Link>
          <Link href="/care/requests" className="rounded-md px-2.5 py-2 font-medium text-neutral-700 hover:bg-neutral-100 sm:px-3">
            My requests
          </Link>
          {right}
        </div>
      </div>
    </header>
  );
}

export function CareFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-500">
      © {new Date().getFullYear()} The Wheeler Dealers. All rights reserved.
      <p className="mt-1 text-neutral-400">Operated By Novasynergy Business Solutions Fzco</p>
    </footer>
  );
}
