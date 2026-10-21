import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

const TYPES = new Set(["home", "branch", "expert-chat"]);

/**
 * POST /api/sell/inspection
 * Body: { leadId, inspectionType: "home"|"branch"|"expert-chat", slot?: string }
 * Records the customer's free-inspection booking against their sell lead
 * (Sell journey steps 9-10).
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "sell-inspection", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { leadId?: string; inspectionType?: string; slot?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadId = (body.leadId ?? "").trim();
  const inspectionType = (body.inspectionType ?? "").trim();
  const slot = (body.slot ?? "").trim() || null;

  if (!leadId) {
    return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
  }
  if (!TYPES.has(inspectionType)) {
    return NextResponse.json({ error: "Invalid inspectionType" }, { status: 400 });
  }

  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        inspectionType,
        inspectionSlot: slot,
        inspectionAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Failed to save inspection booking:", err);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
