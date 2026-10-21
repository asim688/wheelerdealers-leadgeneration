import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import type { AdminAuction } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Lists all auctions (open and closed) for the platform operator, including the
 * seller's contact details and the full bid history so deals can be finalised.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

  const auctions = await prisma.auction.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      lead: true,
      bids: {
        orderBy: { amount: "desc" },
        include: { dealer: { select: { name: true, email: true } } },
      },
    },
  });

  const result: AdminAuction[] = auctions.map((a) => ({
    id: a.id,
    status: a.status,
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    leadType: a.lead.intent,
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
    seller: {
      name: a.lead.name ?? "",
      mobile: a.lead.mobile ?? "",
      email: a.lead.email ?? "",
    },
    bids: a.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      createdAt: b.createdAt.toISOString(),
      dealerName: b.dealer.name,
      dealerEmail: b.dealer.email,
    })),
    highestBid: a.bids.length ? a.bids[0].amount : null,
    winningBidId: a.winningBidId,
  }));

  return NextResponse.json({ auctions: result, currency });
}
