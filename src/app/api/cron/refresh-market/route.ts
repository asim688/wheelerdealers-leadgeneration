import { NextRequest, NextResponse } from "next/server";
import { refreshStaleMarketPrices } from "@/lib/marketData";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
// Allow a generous window — refreshing many vehicles can take a while.
export const maxDuration = 60;

/**
 * Scheduled refresh of stale market price data (older than ~3 months).
 *
 * Trigger options:
 *   - A scheduler (e.g. Vercel Cron / system cron) sending:
 *       Authorization: Bearer <CRON_SECRET>
 *   - A signed-in admin (cookie session) hitting it manually.
 *
 * Schedule it to run daily; it only re-fetches vehicles whose cache has aged
 * past the 3-month window, so most runs are cheap no-ops.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const authorized =
    (secret && authHeader === `Bearer ${secret}`) || isAdmin(req);

  if (!authorized) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const result = await refreshStaleMarketPrices();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
