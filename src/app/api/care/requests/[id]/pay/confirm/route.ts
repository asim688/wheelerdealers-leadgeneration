import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { retrieveCheckoutSession } from "@/lib/payments";
import { getTamaraOrder, settleTamaraOrder } from "@/lib/tamara";
import { releaseCarePayment } from "@/lib/care";
import { careTamaraJob } from "@/lib/careBilling";

export const runtime = "nodejs";

/**
 * POST /api/care/requests/[id]/pay/confirm { provider, sessionId? , orderId? }
 * Called when the customer returns from the gateway (webhook race fallback).
 * The payment is re-verified with the gateway; the client's word is never trusted.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Not authenticated", loginRequired: true }, { status: 401 });
  const { id } = await params;
  const r = await prisma.careRequest.findFirst({ where: { id, customerId } });
  if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { provider?: string; sessionId?: string; orderId?: string };
  if (r.paymentStatus !== "pending") return NextResponse.json({ ok: true, paymentStatus: r.paymentStatus });

  if (b.provider === "stripe" && b.sessionId) {
    const s = await retrieveCheckoutSession(b.sessionId);
    if (s && s.payment_status === "paid" && s.metadata?.careRequestId === r.id) {
      const out = await releaseCarePayment(r.id, "stripe", s.id, s.amount_total ?? null);
      return NextResponse.json({ ok: true, result: out });
    }
  }

  if (b.provider === "tamara") {
    const orderId = b.orderId || r.paymentRef;
    const bid = r.pendingBidId ? await prisma.careBid.findUnique({ where: { id: r.pendingBidId }, include: { partner: { select: { name: true } } } }) : null;
    if (orderId && orderId === r.paymentRef && bid) {
      const reference = (await getTamaraOrder(orderId))?.order_reference_id;
      if (reference) {
        const status = await settleTamaraOrder(orderId, careTamaraJob(r, { priceFils: bid.priceFils, partnerName: bid.partner.name }, reference));
        if (status) {
          const out = await releaseCarePayment(r.id, "tamara", orderId);
          return NextResponse.json({ ok: true, result: out });
        }
      }
    }
  }

  return NextResponse.json({ ok: false, paymentStatus: "pending" });
}

