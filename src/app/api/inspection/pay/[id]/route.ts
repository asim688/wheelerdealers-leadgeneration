import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { createCheckoutSession, isStripeConfigured } from "@/lib/payments";
import { createTamaraCheckout, getTamaraInstalmentOptions, isTamaraConfigured } from "@/lib/tamara";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

const select = {
  id: true, jobCode: true, status: true, fee: true, currency: true, paymentStatus: true, paymentProvider: true,
  customerId: true, customerName: true, customerEmail: true, customerMobile: true,
  address: true, city: true, emirate: true, make: true, model: true, year: true, scheduledAt: true, scheduledSlot: true,
  customer: { select: { createdAt: true } },
} as const;

async function loadJob(req: NextRequest, id: string) {
  const job = await prisma.inspectionJob.findUnique({ where: { id }, select });
  if (!job) return { error: NextResponse.json({ error: "Booking not found." }, { status: 404 }) };
  // A booking made by a signed-in customer can only be paid from that customer's session.
  if (job.customerId && getCustomerId(req) !== job.customerId) {
    return { error: NextResponse.json({ error: "Please sign in to pay for this booking.", loginRequired: true }, { status: 401 }) };
  }
  return { job };
}

/** GET /api/inspection/pay/[id] — what the customer owes and which payment methods are available. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadJob(req, id);
  if ("error" in r) return r.error;
  const job = r.job;
  const fee = job.fee ?? 0;
  const paid = job.paymentStatus === "paid" || job.paymentStatus === "waived";
  const tamaraPlans = !paid && isTamaraConfigured() ? await getTamaraInstalmentOptions(fee, job.currency) : [];
  return NextResponse.json({
    job: {
      id: job.id,
      jobCode: job.jobCode,
      status: job.status,
      fee,
      currency: job.currency,
      paid,
      cancelled: job.status === "cancelled",
      vehicle: [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle",
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      scheduledSlot: job.scheduledSlot,
      email: job.customerEmail,
    },
    methods: {
      card: isStripeConfigured(),
      tamara: tamaraPlans.length > 0,
      tamaraInstalments: tamaraPlans.map((p) => p.instalments),
    },
  });
}

/** POST /api/inspection/pay/[id] { method: "card" | "tamara" } — starts the hosted checkout and returns its URL. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimitRequest(req, "inspection-pay", 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  const { id } = await params;
  const r = await loadJob(req, id);
  if ("error" in r) return r.error;
  const job = r.job;
  if (job.paymentStatus === "paid" || job.paymentStatus === "waived") return NextResponse.json({ error: "This booking is already paid.", paid: true }, { status: 409 });
  if (job.status !== "payment_pending") return NextResponse.json({ error: "This booking can no longer be paid online." }, { status: 409 });
  if (!job.fee || job.fee <= 0) return NextResponse.json({ error: "No amount is due for this booking." }, { status: 409 });

  let body: { method?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.method === "tamara") {
    if (!isTamaraConfigured()) return NextResponse.json({ error: "Tamara is not available right now." }, { status: 503 });
    const session = await createTamaraCheckout({ ...job, fee: job.fee, customerCreatedAt: job.customer?.createdAt ?? null });
    if (!session) return NextResponse.json({ error: "Tamara could not start the payment. Please try again or pay by card." }, { status: 502 });
    await prisma.inspectionJob.update({ where: { id: job.id }, data: { paymentProvider: "tamara", paymentRef: session.orderId } });
    return NextResponse.json({ url: session.url });
  }

  if (body.method === "card") {
    if (!isStripeConfigured()) return NextResponse.json({ error: "Card payment is not available right now." }, { status: 503 });
    const session = await createCheckoutSession({ id: job.id, jobCode: job.jobCode, fee: job.fee, currency: job.currency, customerEmail: job.customerEmail });
    if (!session) return NextResponse.json({ error: "Card payment could not start. Please try again." }, { status: 502 });
    await prisma.inspectionJob.update({ where: { id: job.id }, data: { paymentProvider: "stripe", paymentRef: session.sessionId } });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Choose a payment method." }, { status: 400 });
}
