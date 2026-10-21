import crypto from "node:crypto";
import { getBaseUrl } from "./inspection";

/**
 * ----------------------------------------------------------------------------
 * Online payments — provider-ready Stripe Checkout (dependency-free, REST).
 * ----------------------------------------------------------------------------
 * When STRIPE_SECRET_KEY is configured, bookings redirect to a hosted Stripe
 * Checkout page and the webhook marks the job paid. When it is NOT configured
 * (local dev / pre-launch), payment is auto-approved so the marketplace flow
 * keeps working end-to-end.
 *
 * Required env for live payments:
 *   STRIPE_SECRET_KEY      sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET  whsec_...   (from the webhook endpoint config)
 * ----------------------------------------------------------------------------
 */

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Creates a Stripe Checkout session for an inspection job. Returns the hosted
 * payment URL, or null if Stripe isn't configured or the call fails (callers
 * fall back to dev auto-approval).
 */
export async function createCheckoutSession(job: {
  id: string;
  jobCode: string;
  fee: number;
  currency: string;
  customerEmail: string;
}): Promise<{ url: string; sessionId: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const base = getBaseUrl();
  const params = new URLSearchParams({
    mode: "payment",
    // Card only: stops Stripe defaulting to a Link one-time-code prompt.
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": job.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(job.fee * 100)),
    "line_items[0][price_data][product_data][name]": `Vehicle Inspection — ${job.jobCode}`,
    "line_items[0][quantity]": "1",
    customer_email: job.customerEmail,
    client_reference_id: job.id,
    "metadata[jobId]": job.id,
    "metadata[jobCode]": job.jobCode,
    success_url: `${base}/inspection/book?paid=1&job=${encodeURIComponent(job.jobCode)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/inspection/book?cancelled=1&job=${encodeURIComponent(job.jobCode)}`,
  });

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Stripe substitutes {CHECKOUT_SESSION_ID} only when the braces are literal.
      body: params.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
    });
    if (!res.ok) {
      console.error("Stripe checkout session failed:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { id: string; url: string };
    return { url: data.url, sessionId: data.id };
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    return null;
  }
}

/**
 * Retrieves a Checkout session directly from Stripe. Used as a webhook-race
 * fallback when the customer returns before the webhook has landed. Returns
 * null when Stripe is unconfigured, the id is malformed or the call fails.
 */
export async function retrieveCheckoutSession(sessionId: string): Promise<{
  id: string;
  payment_status?: string;
  metadata?: { jobId?: string };
} | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    return (await res.json()) as { id: string; payment_status?: string; metadata?: { jobId?: string } };
  } catch {
    return null;
  }
}

/**
 * Verifies a Stripe webhook signature (Stripe-Signature header) against the
 * raw request body. Returns the parsed event on success, null otherwise.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
): { type: string; data: { object: Record<string, unknown> } } | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return null;

  // Reject stale events (>5 min) to prevent replay.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
