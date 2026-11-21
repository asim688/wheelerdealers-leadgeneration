import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import {
  BID_WINDOW_MINUTES,
  CARE_SERVICES,
  CONDITIONS,
  FUEL_TYPES,
  displayStatus,
  generateCareCode,
  isCareService,
  logCareEvent,
  notifyPartnersNewTowRequest,
} from "@/lib/care";

export const runtime = "nodejs";

const str = (v: unknown, max = 300) => {
  const s = (v ?? "").toString().trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** GET /api/care/requests — the signed-in customer's care requests (newest first). */
export async function GET(req: NextRequest) {
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Not authenticated", loginRequired: true }, { status: 401 });
  const rows = await prisma.careRequest.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { bids: { where: { status: "active" } } } } },
  });
  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind,
      service: r.service,
      serviceLabel: CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? r.service,
      status: displayStatus(r.status, r._count.bids),
      bids: r._count.bids,
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle",
      pickupAddress: r.pickupAddress,
      priceFils: r.priceFils,
      etaMinutes: r.etaMinutes,
      etaChangePending: r.etaChangePending,
      paymentStatus: r.paymentStatus,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/care/requests — create a roadside request (WD assigns a partner) or a
 * scheduled-tow request (approved partners bid with price + ETA).
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "care-request", 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Please verify your mobile number to send the request.", loginRequired: true }, { status: 401 });
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return NextResponse.json({ error: "Please sign in again.", loginRequired: true }, { status: 401 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isCareService(b.service)) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  const service = b.service;
  const kind = CARE_SERVICES[service].kind;

  const name = str(b.customerName, 120) ?? customer.name;
  const make = str(b.make, 60);
  const model = str(b.model, 60);
  const year = num(b.year);
  const pickupAddress = str(b.pickupAddress, 400);
  const pickupEmirate = str(b.pickupEmirate, 40);
  const condition = str(b.condition, 30);
  const issue = str(b.issue, 600);
  const missing: string[] = [];
  if (!name) missing.push("your name");
  if (!make || !model) missing.push("vehicle make and model");
  if (year != null && (year < 1950 || year > new Date().getFullYear() + 1)) missing.push("a valid year");
  if (!pickupAddress) missing.push(service === "scheduled_tow" || service === "emergency_tow" ? "pickup location" : "location");
  if (!pickupEmirate) missing.push("emirate");
  if (condition && !(condition in CONDITIONS)) missing.push("vehicle condition");

  let fuelType: string | null = null;
  let fuelLitres: number | null = null;
  if (service === "fuel_delivery") {
    fuelType = str(b.fuelType, 30);
    fuelLitres = num(b.fuelLitres);
    if (!fuelType || !(fuelType in FUEL_TYPES)) missing.push("fuel type");
    if (!fuelLitres || fuelLitres < 5 || fuelLitres > 100) missing.push("fuel quantity (5–100 litres)");
  }
  if (service === "jump_start" && !issue) missing.push("a short description of the problem");

  let destAddress: string | null = null;
  let scheduledAt: Date | null = null;
  let flexible = false;
  let bidsCloseAt: Date | null = null;
  if (service === "scheduled_tow") {
    destAddress = str(b.destAddress, 400);
    if (!destAddress) missing.push("destination");
    flexible = b.flexible === true;
    const date = str(b.date, 10);
    const time = str(b.time, 5) ?? (flexible ? "12:00" : null);
    if (!date) missing.push("preferred date");
    else if (!time || !/^\d{2}:\d{2}$/.test(time)) missing.push("preferred time");
    else {
      scheduledAt = new Date(`${date}T${time}:00+04:00`);
      if (Number.isNaN(scheduledAt.getTime())) missing.push("a valid date");
      else if (scheduledAt.getTime() < Date.now() + 30 * 60_000) return NextResponse.json({ error: "Please choose a pickup time at least 30 minutes from now." }, { status: 400 });
      else if (scheduledAt.getTime() > Date.now() + 60 * 86_400_000) return NextResponse.json({ error: "Please choose a date within the next 60 days." }, { status: 400 });
    }
  }
  if (missing.length) return NextResponse.json({ error: `Please add ${missing.join(", ")}.` }, { status: 400 });

  if (kind === "towing") bidsCloseAt = new Date(Date.now() + BID_WINDOW_MINUTES * 60_000);

  const code = await generateCareCode("CARE");
  const request = await prisma.careRequest.create({
    data: {
      code,
      kind,
      service,
      status: kind === "roadside" ? "submitted" : "open",
      customerId,
      customerName: name!,
      customerMobile: customer.mobile,
      customerEmail: customer.emailVerifiedAt ? customer.email : str(b.customerEmail, 160),
      make,
      model,
      year,
      condition,
      issue,
      pickupAddress: pickupAddress!,
      pickupEmirate,
      pickupLat: num(b.pickupLat),
      pickupLng: num(b.pickupLng),
      destAddress,
      destEmirate: str(b.destEmirate, 40),
      destLat: num(b.destLat),
      destLng: num(b.destLng),
      fuelType,
      fuelLitres,
      scheduledAt,
      flexible,
      bidsCloseAt,
      // Roadside is paid to the partner on the spot once the service is delivered.
      paymentStatus: kind === "roadside" ? "pay_on_site" : "none",
    },
  });
  if (!customer.name && name) await prisma.customer.update({ where: { id: customerId }, data: { name } }).catch(() => {});
  await logCareEvent(request.id, "created", { name, role: "customer" }, `${CARE_SERVICES[service].label} requested`);

  let partnersNotified = 0;
  if (kind === "towing") partnersNotified = await notifyPartnersNewTowRequest(request);

  return NextResponse.json({ ok: true, id: request.id, code: request.code, kind, partnersNotified });
}
