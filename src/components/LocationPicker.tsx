"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, googleMapsKey, type GAutocomplete } from "@/lib/googleMaps";
import type { SelectedLocation } from "@/lib/types";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

interface Suggestion {
  label: string;
  location: SelectedLocation;
}

type Mode = "loading" | "google" | "free";

/**
 * Address picker for the booking chat. Shows live suggestions as the user types:
 *  - With a Google Maps key → Google Places Autocomplete (UAE-restricted).
 *  - Without a key → free OpenStreetMap (Nominatim) suggestions (UAE only, no
 *    key/billing needed).
 * Emits a `SelectedLocation` (address + coordinates + emirate/city) on choose,
 * and always allows manual entry as a fallback.
 */
export default function LocationPicker({
  onSelect,
  disabled,
}: {
  onSelect: (loc: SelectedLocation) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<GAutocomplete | null>(null);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<Mode>(googleMapsKey() ? "loading" : "free");

  // Free (Nominatim) autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Google Places (when a key is configured) ─────────────────────────────
  useEffect(() => {
    if (mode !== "loading") return;
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled) return;
      if (!g || !inputRef.current) {
        setMode("free"); // key present but the script failed → free suggestions
        return;
      }
      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "address_components", "place_id"],
        componentRestrictions: { country: "ae" },
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place?.formatted_address) return;
        const comp = (type: string) =>
          place.address_components?.find((c) => c.types.includes(type))?.long_name;
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        setValue(place.formatted_address);
        onSelect({
          formattedAddress: place.formatted_address,
          lat,
          lng,
          city: comp("locality") || comp("administrative_area_level_2"),
          emirate: comp("administrative_area_level_1"),
          country: comp("country"),
          placeId: place.place_id,
          mapUrl:
            lat != null && lng != null
              ? `https://www.google.com/maps?q=${lat},${lng}`
              : undefined,
        });
      });
      acRef.current = ac;
      setMode("google");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, onSelect]);

  // ── Free suggestions (OpenStreetMap Nominatim) ───────────────────────────
  async function searchFree(q: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setOpen(true);
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ae" +
          `&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(q)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("search failed");
      const rows = (await res.json()) as NominatimResult[];
      const list: Suggestion[] = rows.map((r) => {
        const a = r.address ?? {};
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        return {
          label: r.display_name,
          location: {
            formattedAddress: r.display_name,
            lat: Number.isFinite(lat) ? lat : undefined,
            lng: Number.isFinite(lng) ? lng : undefined,
            city: a.city || a.town || a.village || a.suburb,
            emirate: a.state || a.region,
            country: a.country,
            mapUrl:
              Number.isFinite(lat) && Number.isFinite(lng)
                ? `https://www.google.com/maps?q=${lat},${lng}`
                : undefined,
          },
        };
      });
      setSuggestions(list);
      setNoResults(list.length === 0);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions([]);
        setNoResults(false);
      }
    } finally {
      setSearching(false);
    }
  }

  function onChange(v: string) {
    setValue(v);
    if (mode !== "free") return; // Google handles its own suggestions
    setNoResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const q = v.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => searchFree(q), 450);
  }

  function choose(s: Suggestion) {
    setValue(s.location.formattedAddress);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.location);
  }

  function submitManual() {
    const t = value.trim();
    if (!t || disabled) return;
    onSelect({ formattedAddress: t });
    setValue("");
    setSuggestions([]);
    setOpen(false);
  }

  const showDropdown =
    mode === "free" && open && (searching || suggestions.length > 0 || noResults);

  return (
    <div className="relative space-y-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode === "free") {
              e.preventDefault();
              if (suggestions[0]) choose(suggestions[0]);
              else submitManual();
            }
          }}
          placeholder="Search your address..."
          disabled={disabled || mode === "loading"}
          autoComplete="off"
          className="w-full rounded-md border border-neutral-300 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-red-500 disabled:opacity-60"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-red-500" />
          </span>
        )}
      </div>

      {/* Suggestions dropdown — opens upward (the input sits near the bottom). */}
      {showDropdown && (
        <ul className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {searching && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-neutral-400">Searching addresses…</li>
          )}
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                <svg className="mt-0.5 shrink-0 text-red-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>{s.label}</span>
              </button>
            </li>
          ))}
          {noResults && !searching && (
            <li className="px-3 py-2 text-xs text-neutral-400">
              No matches — type your full address and tap “Use address”.
            </li>
          )}
        </ul>
      )}

      {mode !== "google" && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-400">
            {mode === "loading"
              ? "Loading address search…"
              : "Pick a suggestion, or enter it manually."}
          </p>
          <button
            type="button"
            onClick={submitManual}
            disabled={disabled || !value.trim()}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Use address
          </button>
        </div>
      )}
    </div>
  );
}
