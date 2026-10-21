/**
 * Lazily loads the Google Maps JS API (Places library) on the client. Returns
 * `null` when no API key is configured (so callers can fall back to a plain text
 * address field). The script is injected once and shared across all callers.
 *
 * We keep our own minimal type shims for the small slice of the Places API we
 * use, to avoid pulling in the heavy `@types/google.maps` dependency.
 */

export interface GPlaceResult {
  formatted_address?: string;
  place_id?: string;
  geometry?: { location?: { lat(): number; lng(): number } };
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}

export interface GAutocomplete {
  addListener(event: string, handler: () => void): void;
  getPlace(): GPlaceResult;
}

export interface GoogleMapsApi {
  maps: {
    places: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts?: {
          fields?: string[];
          componentRestrictions?: { country: string | string[] };
          types?: string[];
        },
      ) => GAutocomplete;
    };
  };
}

/** The configured client-side Google Maps key, or undefined when not set. */
export function googleMapsKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

let loaderPromise: Promise<GoogleMapsApi | null> | null = null;

export function loadGoogleMaps(): Promise<GoogleMapsApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const key = googleMapsKey();
  if (!key) return Promise.resolve(null);

  const w = window as unknown as { google?: GoogleMapsApi; __wdGmapsCb?: () => void };
  if (w.google?.maps?.places) return Promise.resolve(w.google);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve) => {
    w.__wdGmapsCb = () => resolve(w.google ?? null);
    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      "&libraries=places&loading=async&callback=__wdGmapsCb";
    s.async = true;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loaderPromise;
}
