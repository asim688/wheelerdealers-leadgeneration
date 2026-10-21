import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitRequest } from "@/lib/rateLimit";
import {
  INSPECTION_CURRENCY,
  getInspectionPricing,
  getJobOpenHours,
  generateJobCode,
  sendBookingNotifications,
  notifyCompaniesNewJob,
} from "@/lib/inspection";
import { isStripeConfigured, createCheckoutSession } from "@/lib/payments";
import { getCustomerId } from "@/lib/auth";
import type { InspectionBookingInput, InspectionBookingResult } from "@/lib/types";

// Prisma requires the Node.js runtime (not Edge).
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/inspection/book
 * ---------------------------------------------------------------------------
 * Creates a vehicle inspection job from the public 6-step booking wizard.
 * Marketplace flow: the job starts as "payment_pending"; when Stripe is
 * configured the customer is redirected to hosted Checkout and the webhook
 * marks it paid → "available". Without Stripe (dev / pre-launch) payment is
 * auto-approved and the job goes straight to the marketplace pool.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "inspection-book", 15, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: Partial<InspectionBookingInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerName = clean(body.customerName);
  const customerMobile = clean(body.customerMobile);
  const customerEmail = clean(body.customerEmail);
  const address = clean(body.address);

  // Validate the required fields (customer + location).
  const missing: string[] = [];
  if (!customerName) missing.push("customerName");
  if (!customerMobile) missing.push("customerMobile");
  if (!customerEmail || !EMAIL_RE.test(customerEmail)) missing.push("customerEmail");
  if (!address) missing.push("address");
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing or invalid: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const scheduledAt = toDate(body.date, body.slot);

  // Customer login gate: booking requires an authenticated customer session
  // (mobile OTP). Can be disabled with REQUIRE_CUSTOMER_LOGIN=false for dev.
  const customerId = getCustomerId(req);
  const loginRequired = process.env.REQUIRE_CUSTOMER_LOGIN !== "false";
  if (loginRequired && !customerId) {
    return NextResponse.json(
      { error: "Please sign in with your mobile number before booking.", loginRequired: true },
      { status: 401 },
    );
  }

  try {
    const jobCode = await generateJobCode();
    const { customerPrice } = await getInspectionPricing();
    const job = await prisma.inspectionJob.create({
      data: {
        jobCode,
        status: "payment_pending",
        customerName: customerName!,
        customerMobile: customerMobile!,
        customerEmail: customerEmail!,
        vin: clean(body.vin) || null,
        make: clean(body.make) || null,
        model: clean(body.model) || null,
        year: toYear(body.year),
        bodyClass: clean(body.bodyClass) || null,
        trim: clean(body.trim) || null,
        transmission: clean(body.transmission) || null,
        fuelType: clean(body.fuelType) || null,
        notes: clean(body.notes) || null,
        address: address!,
        city: clean(body.city) || null,
        emirate: clean(body.emirate) || null,
        lat: toNum(body.lat),
        lng: toNum(body.lng),
        scheduledAt,
        scheduledSlot: clean(body.slot) || null,
        fee: customerPrice,
        currency: INSPECTION_CURRENCY,
        customerId: customerId ?? null,
      },
    });

    // --- Payment: Stripe Checkout when configured, dev auto-approval otherwise.
    let payUrl: string | null = null;
    if (isStripeConfigured()) {
      const session = await createCheckoutSession({
        id: job.id,
        jobCode: job.jobCode,
        fee: job.fee ?? customerPrice,
        currency: job.currency,
        customerEmail: job.customerEmail,
      });
      if (session) {
        payUrl = session.url;
        await prisma.inspectionJob.update({
          where: { id: job.id },
          data: { paymentProvider: "stripe", paymentRef: session.sessionId },
        });
      }
    }
    if (!payUrl) {
      // No gateway configured (or session failed): auto-approve so the
      // marketplace flow keeps working, and release the job to companies.
      const openHours = await getJobOpenHours();
      await prisma.inspectionJob.update({
        where: { id: job.id },
        data: {
          status: "available",
          paymentStatus: "paid",
          paymentProvider: "dev-auto",
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + openHours * 3_600_000),
        },
      });
      await Promise.allSettled([
        sendBookingNotifications(job),
        notifyCompaniesNewJob(job),
      ]);
    }

    const result: InspectionBookingResult = {
      ok: true,
      jobId: job.id,
      jobCode: job.jobCode,
      fee: job.fee ?? customerPrice,
      currency: job.currency,
      scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
      scheduledSlot: job.scheduledSlot,
      payUrl,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to create inspection booking:", err);
    return NextResponse.json(
      { error: "Could not create your booking. Please try again." },
      { status: 500 },
    );
  }
}

function clean(v?: unknown): string | undefined {
  const s = (v ?? "").toString().trim();
  return s.length ? s : undefined;
}

function toYear(v: unknown): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
  return n;
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Combines an ISO date (YYYY-MM-DD) and a slot label into a Date, if valid. */
function toDate(date?: unknown, slot?: unknown): Date | null {
  const d = (date ?? "").toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Best-effort: fold the slot's hour into the timestamp for ordering.
  const s = (slot ?? "").toString().trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m) {
    let hr = Number(m[1]) % 12;
    if (/pm/i.test(m[3] ?? "")) hr += 12;
    parsed.setHours(hr, Number(m[2]));
  }
  return parsed;
}
