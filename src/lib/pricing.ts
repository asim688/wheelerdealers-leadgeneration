import type { Estimate, InspectionAnalysis, SellData } from "./types";
import { getMarketPrice } from "./marketData";
import {
  estimateMarketPriceAI,
  searchLivePricesAI,
  type AiPriceEstimate,
  type LivePriceResult,
} from "./gemini";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

/**
 * ----------------------------------------------------------------------------
 * Price estimator.
 * ----------------------------------------------------------------------------
 * `getEstimate` (preferred) uses CACHED market data for the make/model/year
 * when available — data that is refreshed at most once every ~3 months by
 * src/lib/marketData.ts, never on every request. When no market data exists it
 * falls back to the transparent rule-based `estimatePrice` below.
 *
 * The rule-based path remains a dependency-free baseline. For production you may
 * also plug a licensed valuation API into src/lib/marketSource.ts.
 * ----------------------------------------------------------------------------
 */

const BASE_VALUES: Record<string, number> = {
  toyota: 24000,
  honda: 23000,
  ford: 26000,
  chevrolet: 25000,
  bmw: 42000,
  "mercedes-benz": 45000,
  mercedes: 45000,
  audi: 40000,
  nissan: 22000,
  hyundai: 21000,
  kia: 20000,
  volkswagen: 24000,
  vw: 24000,
  lexus: 38000,
  tesla: 47000,
  jeep: 30000,
  dodge: 28000,
  ram: 34000,
  mazda: 22000,
  subaru: 24000,
  volvo: 35000,
  porsche: 75000,
  "land rover": 55000,
  jaguar: 45000,
  mini: 26000,
  mitsubishi: 20000,
  peugeot: 19000,
  renault: 18000,
  fiat: 16000,
  default: 25000,
};

function conditionFactor(condition?: string): number {
  switch ((condition ?? "").toLowerCase()) {
    case "excellent":
    case "like new":
      return 1.05;
    case "good":
      return 1.0;
    case "fair":
    case "average":
      return 0.9;
    case "poor":
    case "bad":
      return 0.78;
    default:
      return 1.0;
  }
}

const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);

export function estimatePrice(data: SellData): Estimate {
  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";
  const now = new Date().getFullYear();

  const base =
    BASE_VALUES[(data.make ?? "").toLowerCase()] ?? BASE_VALUES.default;

  // Age depreciation: ~14% lost per year, with a floor so old cars retain value.
  const age = Math.max(0, now - (data.year ?? now));
  const ageFactor = Math.max(0.15, Math.pow(0.86, age));

  // Mileage adjustment: penalise miles above an expected ~12k/year baseline.
  const expectedMiles = age * 12000;
  const excessMiles = Math.max(0, (data.mileage ?? expectedMiles) - expectedMiles);
  const mileageFactor = Math.max(0.4, 1 - excessMiles / 200000);

  const point = round100(base * ageFactor * mileageFactor * conditionFactor(data.condition));

  // Present a +/-10% range, which is more honest than a single number.
  return {
    point,
    min: round100(point * 0.9),
    max: round100(point * 1.1),
    currency,
  };
}

/**
 * Market-aware valuation (preferred). Looks up cached market data for the
 * vehicle (refreshed at most once every ~3 months). When found, the cached
 * average is adjusted for this car's mileage and condition; otherwise it falls
 * back to the rule-based `estimatePrice`.
 */
export async function getEstimate(data: SellData): Promise<Estimate> {
  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

  let market = null;
  try {
    market = await getMarketPrice(data.make, data.model, data.year);
  } catch (err) {
    console.error("Market price lookup failed, using rule-based estimate:", err);
  }

  if (!market || !market.avgPrice) {
    return estimatePrice(data);
  }

  const now = new Date().getFullYear();
  const age = Math.max(0, now - (data.year ?? now));

  // Adjust the market average for THIS car's mileage vs an expected baseline.
  const expectedMiles = age * 12000;
  const excessMiles = Math.max(0, (data.mileage ?? expectedMiles) - expectedMiles);
  const mileageFactor = Math.max(0.4, 1 - excessMiles / 200000);

  const point = round100(market.avgPrice * mileageFactor * conditionFactor(data.condition));

  // Bound the range by the observed market min/max where sensible.
  const min = round100(Math.max(market.minPrice * 0.9, point * 0.9));
  const max = round100(Math.min(market.maxPrice * 1.1, point * 1.12) || point * 1.1);

  return {
    point,
    min: Math.min(min, point),
    max: Math.max(max, point),
    currency: market.currency || currency,
  };
}

/**
 * ----------------------------------------------------------------------------
 * VIN-first Sell valuation (preferred for the new Sell journey).
 * ----------------------------------------------------------------------------
 * Searches the real `CarListing` dataset (35k+ UAE listings) for comparable
 * cars and derives a tight, outlier-resistant price band from them. Falls back
 * to `getEstimate` (MarketPrice cache / rule-based) when too few comparables
 * exist. The returned `sampleCount` tells the UI how much real data backs it.
 * ----------------------------------------------------------------------------
 */
const PRICE_FLOOR_AED = 1000; // ignore junk listings (e.g. AED 1 placeholders)

export async function getSellValuation(data: SellData): Promise<Estimate> {
  const currency = process.env.NEXT_PUBLIC_CURRENCY || "AED";
  const make = (data.make ?? "").trim();
  const model = (data.model ?? "").trim();
  const year = data.year ?? 0;

  // An uploaded inspection report is authoritative — let its findings override
  // the self-reported questionnaire answers for the valuation.
  const insp = data.inspection?.hasReport ? data.inspection : undefined;
  const resolved: SellData = insp
    ? {
        ...data,
        mileage: insp.mileage ?? data.mileage,
        condition: insp.condition || data.condition,
        accident: insp.accident || data.accident,
        serviceHistory: insp.serviceHistory || data.serviceHistory,
        keys: insp.keys || data.keys,
      }
    : data;

  const now = new Date().getFullYear();
  const age = Math.max(0, now - (year || now));
  const expectedKm = age * 20000; // ~20k km/year baseline for the UAE
  const { positives, negatives } = explainFactors(resolved, expectedKm);
  decorateWithInspection(insp, positives, negatives);
  const inspBoost = insp ? 14 : 0;

  if (!make || !year) {
    return {
      ...estimatePrice(resolved),
      currency,
      sampleCount: 0,
      confidence: 35 + inspBoost,
      marketStatus: "Low",
      positives,
      negatives,
      inspectionUsed: !!insp,
      valuationSource: "baseline",
    };
  }

  let rawPrices: number[] = [];
  try {
    rawPrices = await comparablePrices(make, model, year);
  } catch (err) {
    // Neon auto-suspends when idle; the first query after wake-up can fail.
    // One short retry usually recovers so the valuation stays DB-backed.
    console.error("Comparable listings lookup failed, retrying once:", err);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      rawPrices = await comparablePrices(make, model, year);
    } catch (err2) {
      console.error("Comparable listings retry failed:", err2);
    }
  }

  // AI data cleaning: drop statistical outliers (wrong trims/variants, extreme
  // mileage listings, mispriced entries) so we compare only similar vehicles.
  const prices = cleanOutliers(rawPrices);

  // Not enough clean comparables in our own scraped dataset — fall back.
  // Order: 1) LIVE Google-grounded search of the UAE marketplaces (real
  // current listings, with source sites as proof), 2) knowledge-based AI
  // estimate, 3) transparent rule-based estimator. No DB writes either way.
  if (prices.length < 3) {
    const carInput = {
      make,
      model,
      trim: data.trim,
      year,
      mileage: resolved.mileage,
      condition: resolved.condition,
      accident: resolved.accident,
      serviceHistory: resolved.serviceHistory,
    };

    // Both AI paths run in PARALLEL so the customer waits for one round-trip,
    // not two; the live result wins when it actually found listings.
    const [live, ai] = await Promise.all([
      searchLivePricesAI(carInput).catch((err): LivePriceResult | null => {
        console.error("Live price search failed:", err);
        return null;
      }),
      estimateMarketPriceAI(carInput).catch((err): AiPriceEstimate | null => {
        console.error("AI price fallback failed:", err);
        return null;
      }),
    ]);

    // Trust the live result only when Gemini actually found listings.
    if (live && (live.confidence ?? 0) >= 40) {
      const conf = Math.round(
        Math.max(45, Math.min(82, (live.confidence ?? 50) + inspBoost)),
      );
      const proof = live.sources?.length
        ? ` (${live.sources.join(", ")})`
        : "";
      return {
        point: live.point,
        min: Math.min(live.min, live.point),
        max: Math.max(live.max, live.point),
        currency,
        sampleCount: live.listingCount ?? 0,
        confidence: conf,
        marketStatus: "Low",
        positives: [
          ...positives,
          `Priced from live UAE marketplace listings${proof}.`,
        ],
        negatives: [
          ...negatives,
          "Few listings in our own dataset for this exact car — priced from a live UAE market search.",
        ],
        inspectionUsed: !!insp,
        valuationSource: "live-web",
        liveSources: live.sources,
      };
    }

    if (ai) {
      const conf = Math.round(
        Math.max(40, Math.min(72, (ai.confidence ?? 50) + inspBoost)),
      );
      return {
        point: ai.point,
        min: Math.min(ai.min, ai.point),
        max: Math.max(ai.max, ai.point),
        currency,
        sampleCount: prices.length,
        confidence: conf,
        marketStatus: "Low",
        positives,
        negatives: [
          ...negatives,
          "Few local listings for this exact car — estimate based on the wider UAE market.",
        ],
        inspectionUsed: !!insp,
        valuationSource: "ai-knowledge",
      };
    }

    return {
      ...estimatePrice(resolved),
      currency,
      sampleCount: prices.length,
      confidence: 38 + inspBoost,
      marketStatus: "Low",
      positives,
      negatives,
      inspectionUsed: !!insp,
      valuationSource: "baseline",
    };
  }

  const sorted = prices.slice().sort((a, b) => a - b);
  const p25 = percentile(sorted, 0.25);
  const p50 = percentile(sorted, 0.5);
  const p75 = percentile(sorted, 0.75);

  // Adjust the interquartile band for THIS car's mileage & condition.
  const excessKm = Math.max(0, (resolved.mileage ?? expectedKm) - expectedKm);
  const mileageFactor = Math.max(0.4, 1 - excessKm / 300000);
  const factor = mileageFactor * conditionFactor(resolved.condition);

  const point = round100(p50 * factor);
  const min = round100(p25 * factor);
  const max = round100(p75 * factor);

  // V2: confidence from sample size + price tightness (+ verified report).
  const spread = p50 > 0 ? (p75 - p25) / p50 : 1;
  let confidence = 45 + Math.min(42, prices.length * 1.3);
  confidence -= Math.min(28, spread * 55);
  confidence += inspBoost;
  confidence = Math.round(Math.max(45, Math.min(96, confidence)));

  // V2: market status from comparable supply (liquidity of similar cars).
  const marketStatus: "High" | "Medium" | "Low" =
    prices.length >= 20 ? "High" : prices.length >= 8 ? "Medium" : "Low";

  return {
    point,
    min: Math.min(min, point),
    max: Math.max(max, point),
    currency,
    sampleCount: prices.length,
    confidence,
    marketStatus,
    positives,
    negatives,
    inspectionUsed: !!insp,
    valuationSource: "database",
  };
}

/**
 * Tiered comparable search against CarListing. Widens the net until it finds a
 * usable sample, preferring exact model + tight year window for accuracy.
 * Model is normalised (lower-cased, spaces/hyphens stripped) so "Santa Fe",
 * "santa-fe" and "SantaFe" all match.
 */
async function comparablePrices(
  make: string,
  model: string,
  year: number,
): Promise<number[]> {
  const m = make.toLowerCase();
  const mdl = model.toLowerCase().replace(/[\s-]/g, "");

  const modelTiers = mdl
    ? [
        { dy: 1 }, // exact model, year ±1
        { dy: 3 }, // exact model, year ±3
        { dy: 100 }, // exact model, any year
      ]
    : [];

  for (const tier of modelTiers) {
    const rows = await prisma.$queryRaw<Array<{ priceAed: number }>>(Prisma.sql`
      SELECT "priceAed" FROM "CarListing"
      WHERE LOWER("make") = ${m}
        AND "year" BETWEEN ${year - tier.dy} AND ${year + tier.dy}
        AND REPLACE(REPLACE(LOWER("model"), ' ', ''), '-', '') = ${mdl}
        AND "priceAed" >= ${PRICE_FLOOR_AED}
    `);
    if (rows.length >= 3) return rows.map((r) => Number(r.priceAed));
  }

  // No model (partial VIN) or too few — fall back to make + tight year window.
  const rows = await prisma.$queryRaw<Array<{ priceAed: number }>>(Prisma.sql`
    SELECT "priceAed" FROM "CarListing"
    WHERE LOWER("make") = ${m}
      AND "year" BETWEEN ${year - 1} AND ${year + 1}
      AND "priceAed" >= ${PRICE_FLOOR_AED}
  `);
  return rows.map((r) => Number(r.priceAed));
}

/** Linear-interpolated percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * AI data-cleaning step: removes statistical outliers using Tukey's IQR fences
 * (Q1 - 1.5·IQR, Q3 + 1.5·IQR). This drops mispriced listings, wrong trims /
 * engine variants and extreme-mileage entries so only genuinely comparable
 * vehicles feed the valuation. Falls back to the raw set if it can't clean.
 */
function cleanOutliers(prices: number[]): number[] {
  const clean = prices.filter((p) => Number.isFinite(p) && p >= PRICE_FLOOR_AED);
  if (clean.length < 4) return clean;
  const sorted = clean.slice().sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const trimmed = sorted.filter((p) => p >= lo && p <= hi);
  // Never throw away so much that we're left with too little to reason on.
  return trimmed.length >= 3 ? trimmed : sorted;
}

/**
 * V2 reasoning: turns the seller's questionnaire answers into human-readable
 * positive and negative valuation factors (as in the client's spec).
 */
function explainFactors(
  data: SellData,
  expectedKm: number,
): { positives: string[]; negatives: string[] } {
  const positives: string[] = [];
  const negatives: string[] = [];

  const accident = (data.accident ?? "").trim();
  const service = (data.serviceHistory ?? "").trim();
  const owners = data.previousOwners;
  const warranty = (data.warranty ?? "").trim().toLowerCase();
  const keys = (data.keys ?? "").trim();
  const mods = (data.modifications ?? "").trim().toLowerCase();
  const condition = (data.condition ?? "").trim().toLowerCase();
  const mileage = data.mileage;

  // Accident
  if (accident === "No accident") positives.push("No accident history");
  else if (accident === "Not sure") negatives.push("Accident history unconfirmed");
  else if (accident) negatives.push(accident);

  // Service history
  if (service === "Agency" || service === "Authorized garage")
    positives.push("Full / authorised service history");
  else if (service === "No records" || service === "Self-maintained")
    negatives.push("Limited service records");
  else if (service === "Local garage")
    negatives.push("Serviced at a local garage");

  // Owners
  if (owners != null) {
    if (owners <= 0) positives.push("First owner");
    else if (owners === 1) positives.push("Single previous owner");
    else if (owners >= 3) negatives.push(`${owners} previous owners`);
  }

  // Warranty
  if (warranty === "yes") positives.push("Remaining warranty / service package");

  // Keys
  if (keys === "Two keys") positives.push("Both original keys available");
  else if (keys === "One key" || keys === "No keys")
    negatives.push("Missing original key(s)");

  // Modifications
  if (mods === "yes") negatives.push("Aftermarket modifications");

  // Mileage vs expected
  if (mileage != null && expectedKm > 0) {
    if (mileage <= expectedKm * 0.8) positives.push("Low mileage for its age");
    else if (mileage >= expectedKm * 1.3) negatives.push("Higher-than-average mileage");
  }

  // Condition
  if (condition === "excellent") positives.push("Excellent condition");
  else if (["fair", "average", "poor", "needs repairs"].includes(condition))
    negatives.push(`${title(condition)} condition`);

  return { positives, negatives };
}

function title(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Merges an inspection report's findings into the factor lists: adds a
 * "verified report" positive and folds in the report's own positives /
 * negatives (de-duplicated), keeping the lists a sensible length for the UI.
 */
function decorateWithInspection(
  insp: InspectionAnalysis | undefined,
  positives: string[],
  negatives: string[],
): void {
  if (!insp) return;
  const label = insp.overallScore
    ? `Verified inspection report (${insp.overallScore}/10)`
    : "Verified inspection report provided";
  positives.unshift(label);
  const has = (arr: string[], v: string) =>
    arr.some((x) => x.toLowerCase() === v.toLowerCase());
  for (const p of insp.positives ?? []) if (!has(positives, p)) positives.push(p);
  for (const n of insp.negatives ?? []) if (!has(negatives, n)) negatives.push(n);
  // Keep the reveal readable.
  positives.splice(7);
  negatives.splice(8);
}

