import { ACCESSORIES_MARK } from "./serviceType";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { getBaseUrl, sendEmail, sendSms } from "@/lib/inspection";

/**
 * Care module: roadside assistance (WD-managed dispatch), scheduled towing with
 * partner reverse bidding (price + ETA), and a VAT-inclusive car-care catalogue.
 */

export type CareService = "jump_start" | "emergency_tow" | "fuel_delivery" | "scheduled_tow";
export type CareKind = "roadside" | "towing";

export const CARE_SERVICES: Record<CareService, { kind: CareKind; label: string; short: string; keywords: string[] }> = {
  jump_start: { kind: "roadside", label: "Battery Jump Start", short: "Battery assistance", keywords: ["jump", "start", "battery", "dead", "boost", "won't start"] },
  emergency_tow: { kind: "roadside", label: "Emergency Vehicle Towing", short: "WD-managed dispatch", keywords: ["tow", "towing", "accident", "breakdown", "recovery", "emergency"] },
  fuel_delivery: { kind: "roadside", label: "Emergency Fuel Delivery", short: "Emergency supply", keywords: ["fuel", "petrol", "diesel", "gas", "empty"] },
  scheduled_tow: { kind: "towing", label: "Scheduled Vehicle Towing", short: "Get quotes from partners", keywords: ["tow", "towing", "transport", "move", "recovery", "flatbed", "quote"] },
};

export const isCareService = (s: unknown): s is CareService => typeof s === "string" && s in CARE_SERVICES;

export const ROADSIDE_STATUSES = ["submitted", "reviewing", "assigned", "en_route", "completed", "cancelled"] as const;
export const TOWING_STATUSES = ["open", "offer_accepted", "confirmed", "in_progress", "completed", "cancelled"] as const;

export const CARE_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "WD Reviewing",
  assigned: "Partner Assigned",
  en_route: "En Route",
  open: "Request Open",
  bids_received: "Bids Received",
  offer_accepted: "Offer Accepted",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** "Bids Received" is derived: an open towing request that already has offers. */
export const displayStatus = (status: string, activeBids: number): string =>
  status === "open" && activeBids > 0 ? "bids_received" : status;

export const CONDITIONS: Record<string, string> = {
  runs: "Drives normally",
  not_starting: "Won't start",
  accident: "Accident damage",
  flat_tyre: "Flat tyre",
  other: "Other",
};

export const FUEL_TYPES: Record<string, string> = {
  petrol_special: "Petrol (Special 95)",
  petrol_super: "Petrol (Super 98)",
  diesel: "Diesel",
};

/** How long a scheduled-tow request stays open for partner bids. */
export const BID_WINDOW_MINUTES = 15;
/** A started payment holds the chosen bid this long; after that the customer may pick again. */
export const PAYMENT_HOLD_MINUTES = 30;

export const fils = (aed: number): number => Math.round(aed * 100);
export const aed = (f: number | null | undefined): string =>
  f == null ? "—" : (f / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Per-day sequential code, e.g. WD-CARE-261120-0003 / WD-ORD-261120-0001. */
export async function generateCareCode(kind: "CARE" | "ORD"): Promise<string> {
  const d = new Date(Date.now() + 4 * 3_600_000); // Dubai date
  const prefix = `WD-${kind}-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-`;
  const last =
    kind === "CARE"
      ? await prisma.careRequest.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } })
      : await prisma.careOrder.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? parseInt(last.code.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

export async function logCareEvent(
  requestId: string,
  type: string,
  actor: { name?: string | null; role: "customer" | "admin" | "partner" | "system" },
  detail?: string | null,
) {
  await prisma.careEvent.create({
    data: { requestId, type, actorName: actor.name ?? null, actorRole: actor.role, detail: detail ? detail.slice(0, 500) : null },
  });
}

// --- Care partners = partner (company) accounts with partnerType "care" -------------
// They register through the same partner sign-up, are approved by Admin, sign in at
// /manage-inspections and land on /care/partner (company session cookie).

type PartnerLike = { careServices: string | null; careEmirates: string | null; active: boolean; approvalStatus: string; partnerType: string };

/** The signed-in, approved, active care partner, or null. */
export async function getCarePartner(req: NextRequest) {
  const id = getCompanyId(req);
  if (!id) return null;
  const p = await prisma.inspectionCompany.findUnique({ where: { id } });
  return p && p.active && p.approvalStatus === "approved" && p.partnerType === "care" ? p : null;
}

export const partnerServices = (p: { careServices: string | null }): CareService[] =>
  (p.careServices ?? "").split(",").map((s) => s.trim()).filter(isCareService);

export const partnerEmirates = (p: { careEmirates: string | null }): string[] =>
  (p.careEmirates ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Whether a partner may see/bid on a request: approved care partner offering the service and covering the emirate. */
export function partnerCovers(p: PartnerLike, r: { service: string; pickupEmirate: string | null }): boolean {
  if (!p.active || p.approvalStatus !== "approved" || p.partnerType !== "care") return false;
  if (!partnerServices(p).includes(r.service as CareService)) return false;
  const em = partnerEmirates(p);
  return em.length === 0 || !r.pickupEmirate || em.includes(r.pickupEmirate);
}

export const ALL_EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

/**
 * Validates the partner-type part of a registration / admin form:
 * { partnerType: "inspection" | "care", careServices?: string[], careEmirates?: string[] }.
 */
export function parseCarePartnerInput(b: Record<string, unknown>):
  | { ok: true; data: { partnerType: string; careServices: string | null; careEmirates: string | null } }
  | { ok: false; error: string } {
  const type = b.partnerType === "care" ? "care" : "inspection";
  if (type === "inspection") return { ok: true, data: { partnerType: "inspection", careServices: null, careEmirates: null } };
  const services = (Array.isArray(b.careServices) ? b.careServices : []).filter((x) => isCareService(x) || x === ACCESSORIES_MARK);
  if (!services.length) return { ok: false, error: "Choose the Service Type (towing, battery, fuel or accessories)." };
  const emirates = (Array.isArray(b.careEmirates) ? b.careEmirates : []).filter((e): e is string => typeof e === "string" && ALL_EMIRATES.includes(e));
  return {
    ok: true,
    data: {
      partnerType: "care",
      careServices: [...new Set(services)].join(","),
      careEmirates: emirates.length && emirates.length < ALL_EMIRATES.length ? emirates.join(",") : null, // null = all emirates
    },
  };
}

/** Phone used to reach a partner company (Point of Contact first). */
export const partnerPhone = (p: { pocMobile: string | null; phone: string | null }) => p.pocMobile || p.phone || "";

// --- Notifications (provider-ready: logged when email/SMS keys are absent) ----

export async function notifyPartnersNewTowRequest(r: { id: string; code: string; service: string; pickupEmirate: string | null; pickupAddress: string; destAddress: string | null; scheduledAt: Date | null }) {
  const partners = await prisma.inspectionCompany.findMany({ where: { active: true, approvalStatus: "approved", partnerType: "care" } });
  const eligible = partners.filter((p) => partnerCovers(p, r));
  const when = r.scheduledAt ? r.scheduledAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "flexible";
  const line = `New towing request ${r.code}: ${r.pickupAddress} → ${r.destAddress ?? "TBC"} (${when}). Submit your price and ETA: ${getBaseUrl()}/care/partner`;
  await Promise.allSettled(
    eligible.flatMap((p) => [
      sendEmail(p.pocEmail || p.email, `New towing request ${r.code} — submit your bid`, `<p>${line}</p>`),
      sendSms(partnerPhone(p), line),
    ]),
  );
  return eligible.length;
}

export async function notifyCustomer(r: { customerMobile: string; customerEmail: string | null; code: string }, subject: string, message: string) {
  const link = `${getBaseUrl()}/care/requests`;
  await Promise.allSettled([
    sendSms(r.customerMobile, `${message} (${r.code}) ${link}`),
    r.customerEmail ? sendEmail(r.customerEmail, `${subject} — ${r.code}`, `<p>${message}</p><p><a href="${link}">View your Care requests</a></p>`) : Promise.resolve(false),
  ]);
}

export async function notifyPartner(p: { email: string; pocEmail: string | null; pocMobile: string | null; phone: string | null }, subject: string, message: string) {
  await Promise.allSettled([
    sendEmail(p.pocEmail || p.email, subject, `<p>${message}</p><p><a href="${getBaseUrl()}/care/partner">Open partner portal</a></p>`),
    sendSms(partnerPhone(p), message),
  ]);
}

// --- Towing payment (customer pays when accepting a bid) ---------------------------

/** Records money WD owes back to the customer on a request (cumulative, never overwritten by later payments). */
export async function addCareRefund(requestId: string, amountFils: number, reason: string, actor: { name?: string | null; role: "customer" | "admin" | "partner" | "system" }) {
  await prisma.careRequest.update({ where: { id: requestId }, data: { refundStatus: "due", refundFils: { increment: Math.max(0, amountFils) } } });
  await logCareEvent(requestId, "refund_due", actor, `${reason} — refund AED ${aed(amountFils)}`);
}

/**
 * Called once the gateway confirms payment for the bid the customer chose. Atomically
 * accepts that bid (request → offer_accepted) and asks the partner to reconfirm the ETA.
 * If the request changed meanwhile (cancelled / another offer already accepted) or the
 * payment belongs to an earlier checkout attempt, the amount is recorded as a refund
 * owed to the customer. Idempotent per payment reference.
 */
export async function releaseCarePayment(requestId: string, provider: string, ref: string | null, amountFils?: number | null): Promise<"accepted" | "refund_due" | "noop"> {
  const r = await prisma.careRequest.findUnique({ where: { id: requestId } });
  if (!r) return "noop";
  // A paid, older checkout attempt (the customer re-started payment for another offer).
  if (provider !== "dev-auto" && ref && r.paymentRef && ref !== r.paymentRef) {
    const seen = await prisma.careEvent.findFirst({ where: { requestId: r.id, type: "refund_due", detail: { contains: ref } } });
    if (!seen) await addCareRefund(r.id, amountFils ?? 0, `Payment ${ref} (${provider}) was for an earlier checkout attempt`, { name: "System", role: "system" });
    return "refund_due";
  }
  if (!r.pendingBidId || r.paymentStatus !== "pending") return "noop";
  const bid = await prisma.careBid.findUnique({ where: { id: r.pendingBidId }, include: { partner: true } });
  const paidFils = amountFils ?? bid?.priceFils ?? 0;

  const accepted = bid && bid.status === "active" && r.status === "open"
    ? await prisma.careRequest.updateMany({
        where: { id: r.id, status: "open", paymentStatus: "pending", pendingBidId: bid.id },
        data: {
          status: "offer_accepted",
          paymentStatus: "paid",
          paymentProvider: provider,
          paymentRef: ref,
          paidFils,
          paidAt: new Date(),
          acceptedBidId: bid.id,
          assignedPartnerId: bid.partnerId,
          priceFils: bid.priceFils,
          etaMinutes: bid.etaMinutes,
          etaChangePending: false,
          pendingBidId: null,
          pendingSince: null,
        },
      })
    : { count: 0 };

  if (accepted.count === 1 && bid) {
    await prisma.careBid.update({ where: { id: bid.id }, data: { status: "accepted" } });
    await logCareEvent(r.id, "paid", { name: r.customerName, role: "customer" }, `Paid AED ${aed(paidFils)} via ${provider}${ref ? ` · ${ref}` : ""}`);
    await logCareEvent(r.id, "offer_accepted", { name: r.customerName, role: "customer" }, `${bid.partner.name}: AED ${aed(bid.priceFils)}, ETA ${bid.etaMinutes} min`);
    await notifyPartner(bid.partner, `You won towing request ${r.code}`, `Your offer for ${r.code} (AED ${aed(bid.priceFils)}) was selected and paid. Please reconfirm your arrival time in the partner portal.`);
    return "accepted";
  }

  const cleared = await prisma.careRequest.updateMany({
    where: { id: r.id, paymentStatus: "pending" },
    data: { paymentStatus: "none", pendingBidId: null, pendingSince: null },
  });
  if (!cleared.count) return "noop";
  await addCareRefund(r.id, paidFils, `Payment ${ref ?? ""} received but the offer could no longer be accepted`, { name: "System", role: "system" });
  return "refund_due";
}

// --- Product compatibility ----------------------------------------------------

interface CompatRule {
  make: string;
  model?: string;
  from?: number;
  to?: number;
}

/** Parses lines like "Toyota Corolla 2015-2022", "Nissan Patrol", "Honda". */
export function parseCompatibility(text: string | null | undefined): CompatRule[] {
  return (text ?? "")
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const years = l.match(/(\d{4})\s*(?:-|–|to)\s*(\d{4})|(\d{4})\+?$/);
      const words = l.replace(/(\d{4})\s*(?:-|–|to)\s*(\d{4})|(\d{4})\+?$/, "").trim().split(/\s+/);
      const rule: CompatRule = { make: words[0] ?? "" };
      if (words.length > 1) rule.model = words.slice(1).join(" ");
      if (years?.[1]) {
        rule.from = Number(years[1]);
        rule.to = Number(years[2]);
      } else if (years?.[3]) {
        rule.from = Number(years[3]);
      }
      return rule;
    })
    .filter((r) => r.make);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when the product fits the vehicle (or fits all vehicles, or no vehicle given). */
export function fitsVehicle(compatibility: string | null | undefined, v: { make?: string; model?: string; year?: number | null }): boolean {
  const rules = parseCompatibility(compatibility);
  if (rules.length === 0 || !v.make) return true;
  return rules.some((r) => {
    if (norm(r.make) !== norm(v.make!)) return false;
    if (r.model && v.model && !norm(v.model).startsWith(norm(r.model)) && !norm(r.model).startsWith(norm(v.model))) return false;
    if (v.year && r.from && v.year < r.from) return false;
    if (v.year && r.to && v.year > r.to) return false;
    return true;
  });
}

/** Demo catalogue so the module can be reviewed before the real product list arrives. */
export const SAMPLE_PRODUCTS: Array<{ category: string; name: string; brand: string; description: string; priceAed: number; installAed?: number; deliveryAed?: number; compatibility?: string }> = [
  { category: "battery", name: "70Ah Car Battery (DIN70)", brand: "Varta", description: "Maintenance-free battery for most sedans and SUVs. 2-year warranty.", priceAed: 420, installAed: 50, deliveryAed: 0, compatibility: "Toyota Camry 2012-2024\nToyota Corolla 2010-2024\nHonda Civic 2012-2024\nHonda Accord 2010-2024\nNissan Altima 2012-2024" },
  { category: "battery", name: "100Ah Heavy-Duty Battery", brand: "AC Delco", description: "High cold-cranking battery for large SUVs and 4x4s. 2-year warranty.", priceAed: 650, installAed: 50, deliveryAed: 0, compatibility: "Nissan Patrol 2010-2025\nToyota Land Cruiser 2008-2025\nChevrolet Tahoe 2012-2025\nGMC Yukon 2012-2025" },
  { category: "battery", name: "60Ah AGM Start-Stop Battery", brand: "Bosch", description: "AGM battery for vehicles with start-stop systems.", priceAed: 780, installAed: 80, deliveryAed: 0, compatibility: "BMW\nMercedes-Benz\nAudi\nVolkswagen 2014-2025" },
  { category: "oil", name: "Fully Synthetic 5W-30 (4L) + Oil Filter", brand: "Mobil 1", description: "Engine oil change kit: 4 litres plus a matching oil filter.", priceAed: 245, installAed: 60, deliveryAed: 15, compatibility: "Toyota\nHonda\nNissan\nHyundai\nKia" },
  { category: "oil", name: "Synthetic 0W-20 (4L) + Oil Filter", brand: "Castrol EDGE", description: "Low-viscosity oil kit for modern petrol engines.", priceAed: 265, installAed: 60, deliveryAed: 15, compatibility: "Toyota 2015-2025\nHonda 2015-2025\nLexus 2015-2025" },
  { category: "oil", name: "Cabin Air Filter", brand: "Bosch", description: "Fresh-air cabin filter, recommended every 15,000 km.", priceAed: 85, installAed: 30, deliveryAed: 15 },
  { category: "accessory", name: "Sunshade for Windscreen", brand: "WD Select", description: "Foldable reflective sunshade, fits most cars.", priceAed: 59, deliveryAed: 15 },
  { category: "accessory", name: "Dash Camera Full HD", brand: "70mai", description: "1080p front dash cam with night vision and G-sensor.", priceAed: 239, installAed: 75, deliveryAed: 15 },
  { category: "accessory", name: "Tyre Inflator (Portable)", brand: "Xiaomi", description: "Rechargeable digital tyre inflator with auto stop.", priceAed: 179, deliveryAed: 15 },
  { category: "accessory", name: "Emergency Kit (Jump Leads + Triangle)", brand: "WD Select", description: "Jump leads, warning triangle, gloves and torch in one bag.", priceAed: 129, deliveryAed: 15 },
];

export const CATEGORY_LABEL: Record<string, string> = { battery: "Car Batteries", oil: "Oil & Filters", accessory: "Accessories" };
