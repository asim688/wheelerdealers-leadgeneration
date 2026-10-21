import { prisma } from "./prisma";

/** How long a new auction stays open for dealer bidding. */
const AUCTION_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Creates an open auction for a seller lead so dealers can bid on it.
 * Safe to call after creating a sell/trade lead — failures are swallowed and
 * logged so they never break the seller-facing flow.
 */
export async function createAuctionForLead(leadId: string): Promise<void> {
  try {
    await prisma.auction.create({
      data: {
        leadId,
        status: "open",
        endsAt: new Date(Date.now() + AUCTION_DURATION_MS),
      },
    });
  } catch (err) {
    console.error("Failed to create auction for lead", leadId, err);
  }
}
