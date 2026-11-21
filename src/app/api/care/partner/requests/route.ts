import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CARE_SERVICES, CONDITIONS, FUEL_TYPES, getCarePartner, partnerCovers, partnerEmirates, partnerServices } from "@/lib/care";

export const runtime = "nodejs";

/**
 * GET /api/care/partner/requests — for the signed-in partner:
 *   open: scheduled-tow requests they may bid on (service + emirate match, bidding window open)
 *   jobs: requests awarded / assigned to them
 * Partners only ever see their own bid, never competitors' offers.
 */
export async function GET(req: NextRequest) {
  const partner = await getCarePartner(req);
  if (!partner) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const now = new Date();

  const [openRows, jobRows] = await Promise.all([
    prisma.careRequest.findMany({
      where: { kind: "towing", status: "open", OR: [{ bidsCloseAt: null }, { bidsCloseAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { bids: { where: { partnerId: partner.id } } },
    }),
    prisma.careRequest.findMany({
      where: { assignedPartnerId: partner.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { bids: { where: { partnerId: partner.id } } },
    }),
  ]);

  const shape = (r: (typeof openRows)[number], withContact: boolean) => {
    const mine = r.bids[0];
    return {
      id: r.id,
      code: r.code,
      service: r.service,
      serviceLabel: CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? r.service,
      status: r.status,
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle",
      condition: r.condition ? CONDITIONS[r.condition] ?? r.condition : null,
      issue: r.issue,
      pickupAddress: r.pickupAddress,
      pickupEmirate: r.pickupEmirate,
      destAddress: r.destAddress,
      fuel: r.fuelType ? `${FUEL_TYPES[r.fuelType] ?? r.fuelType}${r.fuelLitres ? ` · ${r.fuelLitres} L` : ""}` : null,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      flexible: r.flexible,
      bidsCloseAt: r.bidsCloseAt?.toISOString() ?? null,
      priceFils: r.priceFils,
      etaMinutes: r.etaMinutes,
      etaChangePending: r.etaChangePending,
      needsEtaConfirm: r.status === "offer_accepted" && !r.etaChangePending && r.kind === "towing",
      kind: r.kind,
      paymentStatus: r.paymentStatus,
      paidFils: r.paidFils,
      customer: withContact ? { name: r.customerName, mobile: r.customerMobile } : null,
      myBid: mine ? { id: mine.id, priceFils: mine.priceFils, etaMinutes: mine.etaMinutes, pickupAt: mine.pickupAt?.toISOString() ?? null, terms: mine.terms, status: mine.status } : null,
    };
  };

  return NextResponse.json({
    partner: { name: partner.name, email: partner.email, services: partnerServices(partner), emirates: partnerEmirates(partner) },
    open: openRows.filter((r) => partnerCovers(partner, r)).map((r) => shape(r, false)),
    jobs: jobRows.map((r) => shape(r, ["assigned", "en_route", "confirmed", "in_progress", "completed"].includes(r.status))),
  });
}
