import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import { createCheckoutSession, isStripeConfigured } from "@/lib/payments";
import { createTamaraCheckout, getTamaraInstalmentOptions, isTamaraConfigured } from "@/lib/tamara";
import { CARE_SERVICES, PAYMENT_HOLD_MINUTES, logCareEvent, releaseCarePayment } from "@/lib/care";
import { careReturnUrl, careTamaraJob, careTamaraRef } from "@/lib/careBilling";

export const runtime = "nodejs";

async function load(req: NextRequest, id: string) {
  const customerId = getCustomerId(req);
  if (!customerId) return { error: NextResponse.json({ error: "Not authenticated", loginRequired: true }, { status: 401 }) };
  const r = await prisma.careRequest.findFirst({ where: { id, customerId } });
  if (!r) return { error: NextResponse.json({ error: "Request not found." }, { status: 404 }) };
  return { r };
}

/** GET /api/care/requests/[id]/pay?bidId=… — payment methods available for this offer. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await load(req, id);
  if ("error" in res) return res.error;
  const bid = await prisma.careBid.findFirst({ where: { id: req.nextUrl.searchParams.get("bidId") ?? "", requestId: id, status: "active" } });
  const amount = bid ? bid.priceFils / 100 : 0;
  const tamara = bid && isTamaraConfigured() ? await getTamaraInstalmentOptions(amount, "AED") : [];
  const devAuto = !isStripeConfigured() && !isTamaraConfigured();
  return NextResponse.json({ card: isStripeConfigured() || devAuto, tamara: tamara.length > 0, tamaraInstalments: tamara.map((t) => t.instalments), devAuto });
}

/**
 * POST /api/care/requests/[id]/pay { bidId, method: "card" | "tamara" }
 * The customer pays when accepting a towing offer. Starts the hosted checkout and
 * holds the offer; the bid is accepted only once the gateway confirms the payment.
 * Without any gateway configured (local dev) the payment is auto-approved.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimitRequest(req, "care-pay", 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  const { id } = await params;
  const res = await load(req, id);
  if ("error" in res) return res.error;
  const r = res.r;
  let b: { bidId?: string; method?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (r.kind !== "towing" || r.status !== "open") return NextResponse.json({ error: "Offers can only be accepted while the request is open." }, { status: 409 });
  if (r.paymentStatus === "paid") return NextResponse.json({ error: "This request is already paid." }, { status: 409 });
  const bid = await prisma.careBid.findFirst({ where: { id: b.bidId ?? "", requestId: r.id, status: "active" }, include: { partner: { select: { name: true } } } });
  if (!bid) return NextResponse.json({ error: "This offer is no longer available." }, { status: 404 });

  const hold = { pendingBidId: bid.id, pendingSince: new Date(), paymentStatus: "pending" };
  const label = CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? "Vehicle towing";

  if (!isStripeConfigured() && !isTamaraConfigured()) {
    await prisma.careRequest.update({ where: { id: r.id }, data: { ...hold, paymentProvider: "dev-auto", paymentRef: null } });
    await releaseCarePayment(r.id, "dev-auto", null);
    return NextResponse.json({ ok: true, paid: true });
  }

  if (b.method === "tamara") {
    if (!isTamaraConfigured()) return NextResponse.json({ error: "Tamara is not available right now." }, { status: 503 });
    const ref = careTamaraRef(r.id, Date.now().toString(36));
    const session = await createTamaraCheckout(careTamaraJob(r, { priceFils: bid.priceFils, partnerName: bid.partner.name }, ref));
    if (!session) return NextResponse.json({ error: "Tamara could not start the payment. Please try again or pay by card." }, { status: 502 });
    await prisma.careRequest.update({ where: { id: r.id }, data: { ...hold, paymentProvider: "tamara", paymentRef: session.orderId } });
    await logCareEvent(r.id, "payment_started", { name: r.customerName, role: "customer" }, `Tamara · ${bid.partner.name} · hold ${PAYMENT_HOLD_MINUTES} min`);
    return NextResponse.json({ url: session.url });
  }

  if (b.method === "card") {
    if (!isStripeConfigured()) return NextResponse.json({ error: "Card payment is not available right now." }, { status: 503 });
    const session = await createCheckoutSession(
      { id: r.id, jobCode: r.code, fee: bid.priceFils / 100, currency: "AED", customerEmail: r.customerEmail },
      {
        productName: `${label} ${r.code} — ${bid.partner.name}`,
        successUrl: careReturnUrl(r.id, "paid", "stripe"),
        cancelUrl: careReturnUrl(r.id, "cancelled", "stripe"),
        metadata: { careRequestId: r.id, careBidId: bid.id, code: r.code },
      },
    );
    if (!session) return NextResponse.json({ error: "Card payment could not start. Please try again." }, { status: 502 });
    await prisma.careRequest.update({ where: { id: r.id }, data: { ...hold, paymentProvider: "stripe", paymentRef: session.sessionId } });
    await logCareEvent(r.id, "payment_started", { name: r.customerName, role: "customer" }, `Card · ${bid.partner.name} · hold ${PAYMENT_HOLD_MINUTES} min`);
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Choose a payment method." }, { status: 400 });
}
