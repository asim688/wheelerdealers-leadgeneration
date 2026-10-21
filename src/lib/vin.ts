import { createHash } from "crypto";
import type { VinDecodeResult } from "./types";
import { decodeVinAI } from "./gemini";

/**
 * ----------------------------------------------------------------------------
 * VIN decoder — Vincario (primary) + NHTSA vPIC (fallback).
 * ----------------------------------------------------------------------------
 * We try Vincario FIRST because it has global / GCC coverage and returns the
 * full model for UAE-spec cars (e.g. "Toyota RAV4 2016"). If Vincario is not
 * configured, out of credits, or fails, we fall back to the free NHTSA vPIC
 * API (US-focused: reliably returns make + year, but model is often blank for
 * Gulf cars). If neither fully identifies the car, the UI lets the customer
 * confirm / correct the details manually ("No, let me update").
 *
 * Vincario auth: control sum = first 10 chars of SHA1("VIN|ID|API_KEY|SECRET").
 * Keys live in env: VINCARIO_API_KEY / VINCARIO_SECRET_KEY.
 * ----------------------------------------------------------------------------
 */

const NHTSA_ENDPOINT = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const VINCARIO_BASE = "https://api.vincario.com/3.2";

/** Basic VIN sanity check. Real VINs are 17 chars and exclude I, O, Q. */
export function isPlausibleVin(vin: string): boolean {
  const v = vin.trim().toUpperCase();
  // Allow 11-17 so partial VINs still attempt a decode, but reject junk.
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v);
}

export function normaliseVin(vin: string): string {
  return vin.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Decodes a VIN. Never throws — always returns a VinDecodeResult so the UI can
 * gracefully fall back to manual entry. Tries Vincario, then NHTSA.
 */
export async function decodeVin(rawVin: string): Promise<VinDecodeResult> {
  const vin = normaliseVin(rawVin);

  if (!isPlausibleVin(vin)) {
    return failed(vin, "That doesn't look like a valid chassis number (VIN).");
  }

  // 1) Primary: Vincario (global / GCC coverage). TODO: currently DISABLED
  //    (returns null unless VINCARIO_ENABLED=1) — the Sell flow reads the
  //    Mulkiya card via AI instead. Falls through to NHTSA below meanwhile.
  const vincario = await decodeVinVincario(vin);
  let result: VinDecodeResult;
  if (vincario && vincario.decoded) {
    result = vincario;
  } else {
    // 2) Fallback: NHTSA vPIC (free, US-focused).
    result = await decodeVinNhtsa(vin);
  }

  // 3) OPTIONAL AI assist (OFF by default). A VIN does not reliably encode the
  //    exact model for GCC-spec cars, so an AI guess can be wrong (different
  //    engines return conflicting models). Vincario is authoritative; when it
  //    lacks the model we leave it blank for the customer to confirm. Set
  //    VIN_AI_MODEL=1 to enable a best-effort, web-grounded AI model suggestion.
  const aiModelEnabled =
    process.env.VIN_AI_MODEL === "1" || process.env.VIN_AI_MODEL === "true";
  if (aiModelEnabled && vin.length === 17 && (!result.decoded || !result.model)) {
    result = await fillModelWithAI(vin, result);
  }

  return result;
}

/**
 * Uses the Gemini VIN decoder to fill in a missing model (or fully decode when
 * the API decoders failed). Returns the original result on any error/low
 * confidence, so this never makes the decode worse.
 */
async function fillModelWithAI(
  vin: string,
  base: VinDecodeResult,
): Promise<VinDecodeResult> {
  try {
    const ai = await decodeVinAI(vin);
    if (!ai || !ai.confident || !ai.model) return base;
    return {
      vin,
      decoded: true,
      make: base.make || ai.make,
      model: ai.model,
      year: base.year ?? ai.year,
      bodyClass: base.bodyClass || ai.bodyClass || "",
      trim: base.trim || ai.trim,
      transmission: base.transmission,
      fuelType: base.fuelType,
      partial: false,
      source: base.decoded ? base.source : "ai",
      aiAssisted: true,
      message: "",
    };
  } catch (err) {
    console.error("AI VIN fallback failed:", err);
    return base;
  }
}

/**
 * Vincario decode. Returns a VinDecodeResult when it produces make+year, or
 * null when the service is not configured or fails (so the caller falls back).
 */
async function decodeVinVincario(vin: string): Promise<VinDecodeResult | null> {
  // TODO: Vincario VIN decoding is DISABLED for now. The Sell flow reads the
  // vehicle details from the uploaded Mulkiya (registration card) via Gemini
  // vision instead (see /api/sell/mulkiya), so we no longer spend Vincario
  // credits here. Re-enable later by setting VINCARIO_ENABLED=1 in the env.
  if (process.env.VINCARIO_ENABLED !== "1") return null;

  const apiKey = process.env.VINCARIO_API_KEY;
  const secret = process.env.VINCARIO_SECRET_KEY;
  if (!apiKey || !secret) return null; // not configured -> fall back to NHTSA

  const id = "decode";
  const controlSum = createHash("sha1")
    .update(`${vin}|${id}|${apiKey}|${secret}`)
    .digest("hex")
    .slice(0, 10);
  const url = `${VINCARIO_BASE}/${apiKey}/${controlSum}/decode/${vin}.json`;

  // Retry once — the first server-side call can be slow (cold start) or hit a
  // transient socket error. Without a retry a single slow call would fall back
  // to NHTSA (make+year only), hiding the model for GCC cars.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.error("Vincario returned", res.status);
        // 5xx may be transient -> retry; other codes won't improve on retry.
        if (res.status >= 500 && attempt === 0) continue;
        return null;
      }

      const json = (await res.json()) as {
        decode?: Array<{ label?: string; value?: unknown }>;
      };
      const rows = json.decode;
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const map = new Map<string, string>();
      for (const r of rows) {
        if (r.label) map.set(r.label, r.value == null ? "" : String(r.value).trim());
      }

      const make = titleCase(map.get("Make"));
      // Vincario already formats the model well (e.g. "CX-5", "GT-R"); use as-is.
      const model = (map.get("Model") || "").trim();
      const year = toYear(map.get("Model Year"));
      const bodyClass = map.get("Body") || "";
      const trim = (map.get("Series") || map.get("Trim") || "").trim();
      const transmission = (map.get("Transmission") || "").trim();
      const fuelType = (map.get("Fuel Type - Primary") || "").trim();

      if (!make || !year) return null; // couldn't identify -> fall back

      return {
        vin,
        decoded: true,
        make,
        model,
        year,
        bodyClass,
        trim,
        transmission,
        fuelType,
        partial: !model,
        source: "vincario",
        message: model
          ? ""
          : "We identified the make and year, but please confirm the model.",
      };
    } catch (err) {
      // Timeout / network error — retry once, then fall back to NHTSA.
      console.error("Vincario decode error (attempt", attempt + 1, "):", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null; // all attempts failed -> caller falls back to NHTSA
}

/**
 * NHTSA vPIC decode (free fallback). Retries once — the first server-side call
 * can be slow (cold start) or hit a transient socket error.
 */
async function decodeVinNhtsa(vin: string): Promise<VinDecodeResult> {
  const url = `${NHTSA_ENDPOINT}/${encodeURIComponent(vin)}?format=json`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        return failed(vin, `VIN service returned ${res.status}.`);
      }

      const json = (await res.json()) as { Results?: Array<Record<string, string>> };
      const row = json.Results?.[0];
      if (!row) {
        return failed(vin, "VIN service returned no data.");
      }

      const make = titleCase(row.Make);
      const model = titleCase(row.Model);
      const year = toYear(row.ModelYear);
      const bodyClass = row.BodyClass?.trim() || "";
      const errorCode = (row.ErrorCode || "").split(/[,\s]/)[0];

      const hasCore = Boolean(make && year);
      if (!hasCore) {
        return failed(
          vin,
          "We couldn't identify this VIN automatically. Please enter the details yourself.",
        );
      }

      return {
        vin,
        decoded: true,
        make,
        model,
        year,
        bodyClass,
        // Model frequently missing for GCC cars — flag partial decodes.
        partial: !model,
        errorCode,
        source: "nhtsa",
        message: model
          ? ""
          : "We identified the make and year, but please confirm the model.",
      };
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timeout);
    }
  }

  const aborted = lastErr instanceof Error && lastErr.name === "AbortError";
  console.error("NHTSA VIN decode failed:", lastErr);
  return failed(
    vin,
    aborted
      ? "VIN lookup timed out. Please try again or enter details manually."
      : "VIN lookup failed. Please enter details manually.",
  );
}

function failed(vin: string, message: string): VinDecodeResult {
  return { vin, decoded: false, make: "", model: "", year: undefined, bodyClass: "", message };
}

function titleCase(v?: string): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function toYear(v?: string): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

