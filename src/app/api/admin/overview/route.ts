import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * A single snapshot of everything in the database for the admin overview:
 * counts across all tables plus a few useful breakdowns.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [
    leads,
    cars,
    carsSold,
    dealers,
    dealersApproved,
    auctions,
    auctionsOpen,
    bids,
    marketPrices,
    carListings,
    leadsByIntentRaw,
    inspectionsBooked,
    avgAgg,
    topMakesRaw,
    recent,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.car.count(),
    prisma.car.count({ where: { sold: true } }),
    prisma.dealer.count(),
    prisma.dealer.count({ where: { approved: true } }),
    prisma.auction.count(),
    prisma.auction.count({ where: { status: "open" } }),
    prisma.bid.count(),
    prisma.marketPrice.count(),
    prisma.carListing.count(),
    prisma.lead.groupBy({ by: ["intent"], _count: { _all: true } }),
    prisma.lead.count({ where: { inspectionType: { not: null } } }),
    prisma.lead.aggregate({
      _avg: { estimateMin: true, estimateMax: true },
    }),
    prisma.carListing.groupBy({
      by: ["make"],
      _count: { _all: true },
      orderBy: { _count: { make: "desc" } },
      take: 8,
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        intent: true,
        make: true,
        model: true,
        year: true,
        name: true,
        estimateMin: true,
        estimateMax: true,
        currency: true,
        createdAt: true,
      },
    }),
  ]);

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "AED";

  return NextResponse.json({
    counts: {
      leads,
      cars,
      carsSold,
      dealers,
      dealersApproved,
      dealersPending: dealers - dealersApproved,
      auctions,
      auctionsOpen,
      auctionsClosed: auctions - auctionsOpen,
      bids,
      marketPrices,
      carListings,
      inspectionsBooked,
    },
    leadsByIntent: leadsByIntentRaw.map((r) => ({
      intent: r.intent,
      count: r._count._all,
    })),
    avgEstimate: {
      min: Math.round(avgAgg._avg.estimateMin ?? 0),
      max: Math.round(avgAgg._avg.estimateMax ?? 0),
    },
    topMakes: topMakesRaw.map((r) => ({ make: r.make, count: r._count._all })),
    recentLeads: recent.map((l) => ({
      id: l.id,
      intent: l.intent,
      car: [l.year || "", l.make, l.model].filter(Boolean).join(" ").trim(),
      name: l.name ?? "",
      estimateMin: l.estimateMin,
      estimateMax: l.estimateMax,
      currency: l.currency ?? currency,
      createdAt: l.createdAt.toISOString(),
    })),
    currency,
  });
}
