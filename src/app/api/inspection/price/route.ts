import { NextResponse } from "next/server";
import { getInspectionPricing } from "@/lib/inspection";

export const dynamic = "force-dynamic";

/** GET /api/inspection/price — public customer fee, the same value Stripe charges. */
export async function GET() {
  try {
    const { customerPrice, currency } = await getInspectionPricing();
    return NextResponse.json({ price: customerPrice, currency });
  } catch {
    return NextResponse.json({ error: "Price unavailable" }, { status: 503 });
  }
}
