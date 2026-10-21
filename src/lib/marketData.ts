import { prisma } from "./prisma";
import { fetchMarketSamples } from "./marketSource";

/**
 * ----------------------------------------------------------------------------
 * Market price cache with a 3-month refresh policy.
 * ----------------------------------------------------------------------------
 * We deliberately do NOT fetch external data on every valuation. Instead we
 * cache aggregated price stats per make/model/year and only re-fetch when the
 * cached row is older than REFRESH_INTERVAL (≈3 months). This keeps the app
 * fast, cheap and low-risk while staying reasonably current.
 * ----------------------------------------------------------------------------
 */

export const REFRESH_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000; // ~3 months

export interface MarketStats {
  make: string;
  model: string;
  year: number;
  sampleCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  currency: string;
  fetchedAt: Date;
  stale: boolean;
}

const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);

function isStale(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() > REFRESH_INTERVAL_MS;
}

function normalise(make?: string, model?: string, year?: number) {
  return {
    make: (make ?? "").trim(),
    model: (model ?? "").trim(),
    year: Number(year) || 0,
  };
}

/** Aggregates raw samples into the cached statistics shape. */
function aggregate(samples: number[]) {
  const clean = samples.filter((n) => Number.isFinite(n) && n > 0);
  if (clean.length === 0) return null;
  const sum = clean.reduce((a, b) => a + b, 0);
  return {
    sampleCount: clean.length,
    avgPrice: round100(sum / clean.length),
    minPrice: round100(Math.min(...clean)),
    maxPrice: round100(Math.max(...clean)),
  };
}

/**
 * Fetches fresh samples from the source adapter and upserts the cached row.
 * Returns the new stats, or null if the source returned nothing usable.
 */
export async function refreshMarketPrice(
  make: string,
  model: string,
  year: number,
): Promise<MarketStats | null> {
  const key = normalise(make, model, year);
  if (!key.make || !key.model || !key.year) return null;

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";
  const result = await fetchMarketSamples(key.make, key.model, key.year);
  if (!result) return null;

  const stats = aggregate(result.samples);
  if (!stats) return null;

  const row = await prisma.marketPrice.upsert({
    where: {
      make_model_year: { make: key.make, model: key.model, year: key.year },
    },
    create: { ...key, ...stats, currency, source: result.source },
    update: { ...stats, currency, source: result.source, fetchedAt: new Date() },
  });

  return { ...row, stale: false };
}

/**
 * Returns cached market stats for a vehicle, refreshing from the source only if
 * the cache is missing or older than ~3 months. On a refresh failure it falls
 * back to any existing (stale) cached row.
 */
export async function getMarketPrice(
  make?: string,
  model?: string,
  year?: number,
): Promise<MarketStats | null> {
  const key = normalise(make, model, year);
  if (!key.make || !key.model || !key.year) return null;

  let cached: Awaited<ReturnType<typeof prisma.marketPrice.findUnique>> = null;
  try {
    cached = await prisma.marketPrice.findUnique({
      where: {
        make_model_year: { make: key.make, model: key.model, year: key.year },
      },
    });
  } catch (err) {
    console.error("MarketPrice lookup failed:", err);
  }

  // Fresh cache hit — use it without touching the external source.
  if (cached && !isStale(cached.fetchedAt)) {
    return { ...cached, stale: false };
  }

  // Missing or older than 3 months — refresh once, then cache for 3 months.
  try {
    const refreshed = await refreshMarketPrice(key.make, key.model, key.year);
    if (refreshed) return refreshed;
  } catch (err) {
    console.error("MarketPrice refresh failed:", err);
  }

  // Refresh failed but we still have an old row — better than nothing.
  if (cached) return { ...cached, stale: true };
  return null;
}

/**
 * Batch refresh used by the scheduled job (npm run market:refresh). Refreshes
 * every distinct vehicle that appears in leads and whose cache is stale.
 */
export async function refreshStaleMarketPrices(): Promise<{
  refreshed: number;
  skipped: number;
}> {
  const leads = await prisma.lead.findMany({
    where: { make: { not: null }, model: { not: null }, year: { not: null } },
    select: { make: true, model: true, year: true },
    distinct: ["make", "model", "year"],
  });

  let refreshed = 0;
  let skipped = 0;

  for (const lead of leads) {
    const key = normalise(lead.make ?? "", lead.model ?? "", lead.year ?? 0);
    if (!key.make || !key.model || !key.year) {
      skipped++;
      continue;
    }
    const existing = await prisma.marketPrice.findUnique({
      where: {
        make_model_year: { make: key.make, model: key.model, year: key.year },
      },
    });
    if (existing && !isStale(existing.fetchedAt)) {
      skipped++;
      continue;
    }
    const r = await refreshMarketPrice(key.make, key.model, key.year);
    if (r) refreshed++;
    else skipped++;
  }

  return { refreshed, skipped };
}
