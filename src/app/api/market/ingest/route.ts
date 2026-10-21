import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Ingest endpoint for the market-data collector (scripts/scrape_dubai.py).
 *
 * The collector posts aggregated price stats per make/model/year here; we upsert
 * them into the MarketPrice cache. Because the cache is read for valuations and
 * only refreshed every ~3 months, this endpoint is hit rarely.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`.
 */
interface IngestItem {
  make: string;
  model: string;
  year: number;
  samples?: number[]; // raw asking prices (preferred)
  avgPrice?: number; // or pre-aggregated stats
  minPrice?: number;
  maxPrice?: number;
  sampleCount?: number;
  currency?: string;
  source?: string;
}

const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);

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

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  let body: { items?: IngestItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const defaultCurrency = process.env.NEXT_PUBLIC_CURRENCY || "USD";
  let upserted = 0;
  let skipped = 0;

  for (const item of items) {
    const make = (item.make ?? "").trim();
    const model = (item.model ?? "").trim();
    const year = Math.round(Number(item.year));
    if (!make || !model || !Number.isFinite(year) || year < 1900 || year > 2100) {
      skipped++;
      continue;
    }

    let stats: {
      sampleCount: number;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
    } | null = null;

    if (Array.isArray(item.samples) && item.samples.length > 0) {
      stats = aggregate(item.samples);
    } else if (
      Number.isFinite(Number(item.avgPrice)) &&
      Number(item.avgPrice) > 0
    ) {
      const avg = round100(Number(item.avgPrice));
      stats = {
        sampleCount: Math.max(1, Math.round(Number(item.sampleCount) || 1)),
        avgPrice: avg,
        minPrice: round100(Number(item.minPrice) || avg),
        maxPrice: round100(Number(item.maxPrice) || avg),
      };
    }

    if (!stats) {
      skipped++;
      continue;
    }

    const currency = (item.currency ?? defaultCurrency).trim() || defaultCurrency;
    const source = (item.source ?? "ingest").trim() || "ingest";

    try {
      await prisma.marketPrice.upsert({
        where: { make_model_year: { make, model, year } },
        create: { make, model, year, ...stats, currency, source },
        update: { ...stats, currency, source, fetchedAt: new Date() },
      });
      upserted++;
    } catch (err) {
      console.error("MarketPrice upsert failed for", make, model, year, err);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, upserted, skipped });
}
