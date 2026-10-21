import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  getInspectionPricing,
  setInspectionPricing,
  getJobOpenHours,
  setJobOpenHours,
} from "@/lib/inspection";

export const runtime = "nodejs";

/**
 * GET /api/admin/settings — current marketplace pricing configuration.
 * Commission is derived: customerPrice − partnerPayout.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const pricing = await getInspectionPricing();
  const jobOpenHours = await getJobOpenHours();
  return NextResponse.json({
    ...pricing,
    commission: pricing.customerPrice - pricing.partnerPayout,
    jobOpenHours,
  });
}

/**
 * PATCH /api/admin/settings — update customer price, partner payout and/or
 * the job-live open window (hours). Body:
 * { customerPrice?: number, partnerPayout?: number, jobOpenHours?: number }
 */
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: { customerPrice?: number; partnerPayout?: number; jobOpenHours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates: { customerPrice?: number; partnerPayout?: number } = {};
  if (body.customerPrice !== undefined) {
    const v = Number(body.customerPrice);
    if (!Number.isFinite(v) || v <= 0 || v > 100_000) {
      return NextResponse.json({ error: "Invalid customer price." }, { status: 400 });
    }
    updates.customerPrice = Math.round(v);
  }
  if (body.partnerPayout !== undefined) {
    const v = Number(body.partnerPayout);
    if (!Number.isFinite(v) || v < 0 || v > 100_000) {
      return NextResponse.json({ error: "Invalid partner payout." }, { status: 400 });
    }
    updates.partnerPayout = Math.round(v);
  }

  if (body.jobOpenHours !== undefined) {
    const v = Number(body.jobOpenHours);
    if (!Number.isFinite(v) || v < 1 || v > 720) {
      return NextResponse.json(
        { error: "Job open window must be between 1 and 720 hours." },
        { status: 400 },
      );
    }
    await setJobOpenHours(Math.round(v));
  }

  const current = await getInspectionPricing();
  const nextPrice = updates.customerPrice ?? current.customerPrice;
  const nextPayout = updates.partnerPayout ?? current.partnerPayout;
  if (nextPayout > nextPrice) {
    return NextResponse.json(
      { error: "Partner payout cannot exceed the customer price." },
      { status: 400 },
    );
  }

  await setInspectionPricing(updates);
  const pricing = await getInspectionPricing();
  const jobOpenHours = await getJobOpenHours();
  return NextResponse.json({
    ok: true,
    ...pricing,
    commission: pricing.customerPrice - pricing.partnerPayout,
    jobOpenHours,
  });
}
