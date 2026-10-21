import { NextRequest, NextResponse } from "next/server";
import { decodeVin } from "@/lib/vin";
import { rateLimitRequest } from "@/lib/rateLimit";

// External fetch to NHTSA — Node runtime.
export const runtime = "nodejs";
// The decode may fall back to a Gemini call (to fill a missing model), so allow
// more time than Vercel's short default.
export const maxDuration = 30;

/**
 * POST /api/sell/vin
 * Body: { vin: string }
 * Decodes a chassis number (VIN) via the NHTSA vPIC API and returns the
 * best-known make / model / year for the customer to confirm.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "sell-vin", 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { vin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const vin = (body.vin ?? "").trim();
  if (!vin) {
    return NextResponse.json({ error: "No VIN provided" }, { status: 400 });
  }

  const result = await decodeVin(vin);
  return NextResponse.json(result);
}
