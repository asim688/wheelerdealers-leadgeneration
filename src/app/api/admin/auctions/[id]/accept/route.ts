import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Accepts a winning bid: closes the auction and records the winning bid. This
 * represents the platform taking the dealer's offer to the seller to finalise.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: auctionId } = await params;

  let body: { bidId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bidId = (body.bidId ?? "").trim();
  if (!bidId) {
    return NextResponse.json({ error: "A bidId is required." }, { status: 400 });
  }

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { bids: true },
  });

  if (!auction) {
    return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  }
  if (auction.status === "closed") {
    return NextResponse.json(
      { error: "This auction is already closed." },
      { status: 409 },
    );
  }

  const bid = auction.bids.find((b) => b.id === bidId);
  if (!bid) {
    return NextResponse.json(
      { error: "That bid does not belong to this auction." },
      { status: 400 },
    );
  }

  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "closed", winningBidId: bidId },
  });

  return NextResponse.json({ ok: true, winningBidId: bidId });
}
