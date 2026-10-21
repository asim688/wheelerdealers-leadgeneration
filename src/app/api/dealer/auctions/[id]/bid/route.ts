import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDealerId } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Minimum increment a new bid must exceed the current highest bid by. */
const MIN_INCREMENT = 100;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Throttle bidding to deter abuse / bid spam.
  const rl = rateLimitRequest(req, "bid", 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many bids. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const dealerId = getDealerId(req);
  if (!dealerId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Only verified/approved dealers may place bids.
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { approved: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!dealer.approved) {
    return NextResponse.json(
      { error: "Your dealer account is pending approval. Bidding is disabled until then." },
      { status: 403 },
    );
  }

  const { id: auctionId } = await params;

  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a valid bid amount." },
      { status: 400 },
    );
  }

  // Validate + create atomically so two concurrent bids can't both beat the
  // same "current high" (race condition / lost-update). Serializable isolation
  // is only supported on real databases (Postgres); SQLite serializes writes
  // itself, so we omit the option there to avoid a runtime error.
  const isSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:");
  const txOptions = isSqlite
    ? undefined
    : ({ isolationLevel: "Serializable" } as const);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
      });

      if (!auction) return { error: "Auction not found.", status: 404 } as const;
      if (auction.status !== "open")
        return { error: "This auction is closed.", status: 409 } as const;
      if (auction.endsAt && auction.endsAt.getTime() < Date.now())
        return { error: "This auction has ended.", status: 409 } as const;

      const currentHigh = auction.bids.length ? auction.bids[0].amount : 0;
      if (amount < currentHigh + MIN_INCREMENT) {
        return {
          error: `Your bid must be at least ${currentHigh + MIN_INCREMENT} (current high is ${currentHigh}).`,
          status: 400,
        } as const;
      }

      await tx.bid.create({ data: { auctionId, dealerId, amount } });
      return { ok: true as const, amount };
    }, txOptions);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, amount, highestBid: amount });
  } catch {
    // A serialization failure means a competing bid won the race; ask to retry.
    return NextResponse.json(
      { error: "Another bid arrived first. Please review the current high and try again." },
      { status: 409 },
    );
  }
}
