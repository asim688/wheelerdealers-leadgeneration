import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhook } from "@/lib/payments";
import { releasePaidJob } from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * POST /api/inspection/pay/webhook
 * ---------------------------------------------------------------------------
 * Stripe webhook: on checkout.session.completed, marks the inspection job
 * paid and releases it to the marketplace ("available"), then notifies the
 * customer (booking confirmed) and all approved inspection companies
 * (new job available).
 *
 * Configure in Stripe Dashboard → Webhooks with event
 * `checkout.session.completed` and set STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const event = verifyStripeWebhook(rawBody, req.headers.get("stripe-signature"));
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as {
    id?: string;
    client_reference_id?: string;
    metadata?: { jobId?: string };
    payment_status?: string;
  };
  const jobId = session.metadata?.jobId || session.client_reference_id;
  if (!jobId || session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  // Atomic, idempotent release shared with the checkout-return page.
  await releasePaidJob(jobId, session.id);

  return NextResponse.json({ received: true });
}
