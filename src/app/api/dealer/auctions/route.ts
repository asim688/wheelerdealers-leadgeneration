import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDealerId } from "@/lib/auth";
import type { AuctionListing } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Lists open auctions for the authenticated dealer. Returns car details and the
 * platform estimate, plus bidding state — but NEVER the seller's contact
 * information, which the platform keeps private.
 */
export async function GET(req: NextRequest) {
  const dealerId = getDealerId(req);
  if (!dealerId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

  const auctions = await prisma.auction.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    include: {
      lead: {
        select: {
          intent: true,
          make: true,
          model: true,
          year: true,
          mileage: true,
          condition: true,
          estimateMin: true,
          estimateMax: true,
          currency: true,
        },
      },
      bids: {
        orderBy: { amount: "desc" },
        select: { amount: true, dealerId: true },
      },
    },
  });

  const listings: AuctionListing[] = auctions.map((a) => {
    const highestBid = a.bids.length ? a.bids[0].amount : null;
    const yourBids = a.bids.filter((b) => b.dealerId === dealerId);
    const yourBid = yourBids.length
      ? Math.max(...yourBids.map((b) => b.amount))
      : null;

    return {
      id: a.id,
      status: a.status,
      endsAt: a.endsAt ? a.endsAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      car: {
        make: a.lead.make ?? "",
        model: a.lead.model ?? "",
        year: a.lead.year ?? 0,
        mileage: a.lead.mileage ?? 0,
        condition: a.lead.condition ?? "",
      },
      estimateMin: a.lead.estimateMin,
      estimateMax: a.lead.estimateMax,
      currency: a.lead.currency ?? currency,
      highestBid,
      bidCount: a.bids.length,
      yourBid,
      leadType: a.lead.intent,
    };
  });

  return NextResponse.json({ auctions: listings, currency });
}
