import { NextRequest, NextResponse } from "next/server";
import { getSellValuation } from "@/lib/pricing";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createAuctionForLead } from "@/lib/auctions";
import { rateLimitRequest } from "@/lib/rateLimit";
import type { Estimate, InspectionAnalysis, SellSubmit } from "@/lib/types";

// Prisma requires the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Valuation may fall back to a live Google-grounded market search (and then a
// Gemini knowledge estimate), so allow well beyond Vercel's short default.
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/sell  (VIN-first structured submit)
 * ---------------------------------------------------------------------------
 * The Sell journey collects the car (via VIN decode + confirm) and contact
 * details on the client, then posts everything here once. We value the car
 * against the real CarListing dataset, persist the lead, open a dealer auction
 * and return the estimated market value to reveal to the customer.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "sell", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: Partial<SellSubmit>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: SellSubmit = {
    vin: clean(body.vin),
    engineNo: clean(body.engineNo),
    make: clean(body.make) ?? "",
    model: clean(body.model) ?? "",
    trim: clean(body.trim),
    year: toYear(body.year) ?? 0,
    mileage: toMileage(body.mileage) ?? 0,
    condition: clean(body.condition) ?? "good",
    accident: clean(body.accident),
    serviceHistory: clean(body.serviceHistory),
    previousOwners: toOwners(body.previousOwners),
    warranty: clean(body.warranty),
    keys: clean(body.keys),
    modifications: clean(body.modifications),
    inspection: sanitizeInspection(body.inspection),
    name: clean(body.name) ?? "",
    mobile: clean(body.mobile) ?? "",
    email: clean(body.email) ?? "",
  };

  // Validate required fields.
  const missing: string[] = [];
  if (!data.make) missing.push("make");
  if (!data.year) missing.push("year");
  if (!data.mileage) missing.push("mileage");
  if (!data.name) missing.push("name");
  if (!data.mobile) missing.push("mobile");
  if (!data.email || !EMAIL_RE.test(data.email)) missing.push("email");
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing or invalid: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // Value the car against the real UAE listings dataset. Passing the full
  // questionnaire lets the V2 engine reason about positive/negative factors.
  const estimate: Estimate = await getSellValuation({
    make: data.make,
    model: data.model,
    trim: data.trim,
    year: data.year,
    mileage: data.mileage,
    condition: data.condition,
    accident: data.accident,
    serviceHistory: data.serviceHistory,
    previousOwners: data.previousOwners,
    warranty: data.warranty,
    keys: data.keys,
    modifications: data.modifications,
    inspection: data.inspection,
  });

  let leadId: string | null = null;
  try {
    const lead = await prisma.lead.create({
      data: {
        intent: "sell",
        vin: data.vin ?? null,
        engineNo: data.engineNo ?? null,
        make: data.make,
        model: data.model || null,
        trim: data.trim ?? null,
        year: data.year,
        mileage: data.mileage,
        condition: data.condition,
        accident: data.accident ?? null,
        serviceHistory: data.serviceHistory ?? null,
        previousOwners: data.previousOwners ?? null,
        warranty: data.warranty ?? null,
        keys: data.keys ?? null,
        modifications: data.modifications ?? null,
        hasInspectionReport: !!data.inspection?.hasReport,
        inspectionReportScore: data.inspection?.overallScore ?? null,
        inspectionReportSource: data.inspection?.source ?? null,
        inspectionReportSummary: data.inspection?.summary ?? null,
        name: data.name,
        mobile: data.mobile,
        email: data.email,
        estimateMin: estimate.min,
        estimateMax: estimate.max,
        currency: estimate.currency,
      },
    });
    await createAuctionForLead(lead.id);
    leadId = lead.id;
  } catch (err) {
    console.error("Failed to save sell lead:", err);
  }

  const range = `${formatCurrency(estimate.min, estimate.currency)} – ${formatCurrency(
    estimate.max,
    estimate.currency,
  )}`;

  return NextResponse.json({ ok: true, leadId, estimate, range });
}

function clean(v?: unknown): string | undefined {
  const s = (v ?? "").toString().trim();
  return s.length ? s : undefined;
}

function toYear(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

function toMileage(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function toOwners(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/**
 * Trusts only the shape (not the values) of the inspection analysis the client
 * relays back from POST /api/sell/inspection-report. Coerces types, clamps the
 * score and caps list/string lengths so a tampered payload can't bloat storage.
 */
function sanitizeInspection(v: unknown): InspectionAnalysis | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const str = (x: unknown): string | undefined => {
    const s = (x ?? "").toString().trim();
    return s.length ? s.slice(0, 200) : undefined;
  };
  const num = (x: unknown, max: number): number | undefined => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
  };
  const list = (x: unknown): string[] | undefined => {
    if (!Array.isArray(x)) return undefined;
    const items = x
      .map((i) => (i ?? "").toString().trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 8);
    return items.length ? items : undefined;
  };
  return {
    hasReport: true,
    source: str(o.source) ?? "Uploaded report",
    mileage: num(o.mileage, 2_000_000),
    serviceHistory: str(o.serviceHistory),
    keys: str(o.keys),
    accident: str(o.accident),
    condition: str(o.condition),
    overallScore: num(o.overallScore, 10),
    positives: list(o.positives),
    negatives: list(o.negatives),
    summary: str(o.summary),
  };
}

