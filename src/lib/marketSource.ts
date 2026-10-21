import crypto from "crypto";

/**
 * ----------------------------------------------------------------------------
 * Market data SOURCE adapter (the only place that talks to an external feed).
 * ----------------------------------------------------------------------------
 * `fetchMarketSamples` returns a set of asking-price samples for a given
 * make/model/year. The caller (src/lib/marketData.ts) aggregates and CACHES the
 * result, refreshing at most once every ~3 months — so this adapter is hit
 * rarely, never on every valuation request.
 *
 * ⚠️  INTEGRATION / COMPLIANCE NOTE
 * --------------------------------------------------------------------------
 * This default implementation returns synthetic-but-stable samples so the app
 * works end-to-end in development. To use real market data, replace the body of
 * `fetchMarketSamples` with ONE of:
 *
 *   1. A licensed vehicle-valuation / market-data API (recommended — reliable,
 *      legal, supported). e.g. fetch(`https://api.provider.com/...`).
 *   2. Your own compliant data pipeline.
 *
 * If you aggregate from classified platforms, you MUST respect each site's
 * Terms of Service and robots.txt, throttle politely, and prefer an official
 * API/data licence. Because this runs only once per quarter per vehicle, a
 * low-volume, cache-first approach is both cheaper and lower-risk.
 * --------------------------------------------------------------------------
 */

export interface MarketSampleResult {
  samples: number[]; // asking prices in the display currency
  source: string; // label describing where the data came from
}

const CURRENCY = () => process.env.NEXT_PUBLIC_CURRENCY || "USD";

// Rough baseline values per make (display currency) for a recent model.
const BASELINE: Record<string, number> = {
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

/** Deterministic pseudo-random in [0,1) seeded by a string. */
function seeded(key: string): () => number {
  let h = parseInt(
    crypto.createHash("sha256").update(key).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    // xorshift32
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/**
 * Returns market price samples for a vehicle. Replace the body with a real data
 * source for production (see compliance note above).
 */
export async function fetchMarketSamples(
  make: string,
  model: string,
  year: number,
): Promise<MarketSampleResult | null> {
  const key = `${make}|${model}|${year}`.toLowerCase();
  const rand = seeded(key);

  const now = new Date().getFullYear();
  const base = BASELINE[make.toLowerCase()] ?? BASELINE.default;

  // Depreciate the baseline to the vehicle's model year.
  const age = Math.max(0, now - (year || now));
  const center = Math.max(1500, base * Math.pow(0.86, age));

  // Produce a spread of realistic asking prices around that center.
  const count = 8 + Math.floor(rand() * 10); // 8–17 samples
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const variance = 0.82 + rand() * 0.36; // ±~18%
    samples.push(Math.round((center * variance) / 100) * 100);
  }

  return { samples, source: `synthetic:${CURRENCY()}` };
}
