import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { BID_WINDOW_MINUTES, CARE_SERVICES, PAYMENT_HOLD_MINUTES, addCareRefund, displayStatus, logCareEvent, notifyPartner, notifyPartnersNewTowRequest, partnerPhone } from "@/lib/care";

export const runtime = "nodejs";

async function load(req: NextRequest, id: string) {
  const customerId = getCustomerId(req);
  if (!customerId) return { error: NextResponse.json({ error: "Not authenticated", loginRequired: true }, { status: 401 }) };
  const r = await prisma.careRequest.findFirst({
    where: { id, customerId },
    include: {
      bids: { where: { status: { in: ["active", "accepted"] } }, include: { partner: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      assignedPartner: { select: { name: true, phone: true, pocMobile: true } },
    },
  });
  if (!r) return { error: NextResponse.json({ error: "Request not found." }, { status: 404 }) };
  return { r };
}

/** GET /api/care/requests/[id] — request detail with the partner offers (price + ETA). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await load(req, id);
  if ("error" in res) return res.error;
  const r = res.r;
  const activeBids = r.bids.filter((b) => b.status === "active").length;
  const contactVisible = ["assigned", "en_route", "confirmed", "in_progress"].includes(r.status);
  return NextResponse.json({
    request: {
      id: r.id,
      code: r.code,
      kind: r.kind,
      service: r.service,
      serviceLabel: CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? r.service,
      status: r.status,
      displayStatus: displayStatus(r.status, activeBids),
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(" ") || "Vehicle",
      condition: r.condition,
      issue: r.issue,
      pickupAddress: r.pickupAddress,
      pickupEmirate: r.pickupEmirate,
      destAddress: r.destAddress,
      fuelType: r.fuelType,
      fuelLitres: r.fuelLitres,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      flexible: r.flexible,
      bidsCloseAt: r.bidsCloseAt?.toISOString() ?? null,
      biddingOpen: r.status === "open" && (!r.bidsCloseAt || r.bidsCloseAt > new Date()),
      priceFils: r.priceFils,
      etaMinutes: r.etaMinutes,
      etaChangePending: r.etaChangePending,
      acceptedBidId: r.acceptedBidId,
      partner: r.assignedPartner ? { name: r.assignedPartner.name, phone: contactVisible ? partnerPhone(r.assignedPartner) : null } : null,
      paymentStatus: r.paymentStatus,
      paidFils: r.paidFils,
      paymentProvider: r.paymentProvider,
      refundStatus: r.refundStatus,
      refundFils: r.refundFils,
      paymentPending: r.paymentStatus === "pending" && !!r.pendingSince && r.pendingSince.getTime() > Date.now() - PAYMENT_HOLD_MINUTES * 60_000,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
    },
    bids: r.bids.map((b) => ({
      id: b.id,
      partner: b.partner.name,
      priceFils: b.priceFils,
      etaMinutes: b.etaMinutes,
      pickupAt: b.pickupAt?.toISOString() ?? null,
      terms: b.terms,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
    events: r.events.map((e) => ({ type: e.type, by: e.actorName, role: e.actorRole, detail: e.detail, at: e.createdAt.toISOString() })),
  });
}

/**
 * POST /api/care/requests/[id]
 *   (accepting an offer = paying for it: POST /api/care/requests/[id]/pay)
 *   { action: "reopen" }             bidding closed → collect offers for another 15 minutes
 *   { action: "approve_eta" }        accept the partner's changed ETA → confirmed
 *   { action: "reject_eta" }         decline the changed ETA → request reopens for other offers
 *   { action: "cancel", reason? }    before a partner is confirmed / dispatched
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await load(req, id);
  if ("error" in res) return res.error;
  const r = res.r;
  let body: { action?: string; bidId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const actor = { name: r.customerName, role: "customer" as const };

  if (body.action === "reopen") {
    if (r.kind !== "towing" || r.status !== "open") return NextResponse.json({ error: "Only open towing requests can collect more offers." }, { status: 409 });
    if (r.bidsCloseAt && r.bidsCloseAt > new Date()) return NextResponse.json({ error: "Bidding is still open." }, { status: 409 });
    await prisma.careRequest.update({ where: { id: r.id }, data: { bidsCloseAt: new Date(Date.now() + BID_WINDOW_MINUTES * 60_000) } });
    await logCareEvent(r.id, "reopened", actor, `Bidding reopened for ${BID_WINDOW_MINUTES} minutes`);
    const fresh = await prisma.careRequest.findUnique({ where: { id: r.id } });
    if (fresh) await notifyPartnersNewTowRequest(fresh);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve_eta" || body.action === "reject_eta") {
    if (r.status !== "offer_accepted" || !r.etaChangePending) return NextResponse.json({ error: "There is no changed arrival time to review." }, { status: 409 });
    const partner = r.assignedPartnerId ? await prisma.inspectionCompany.findUnique({ where: { id: r.assignedPartnerId } }) : null;
    if (body.action === "approve_eta") {
      await prisma.careRequest.update({ where: { id: r.id }, data: { status: "confirmed", etaChangePending: false } });
      await logCareEvent(r.id, "confirmed", actor, `Customer accepted the new ETA (${r.etaMinutes} min)`);
      if (partner) await notifyPartner(partner, `Booking ${r.code} confirmed`, `The customer accepted your arrival time for ${r.code}. The booking is confirmed.`);
    } else {
      if (r.acceptedBidId) await prisma.careBid.update({ where: { id: r.acceptedBidId }, data: { status: "rejected" } });
      // The customer already paid for this offer: it is refunded (Admin) and they may pick another offer.
      await prisma.careRequest.update({
        where: { id: r.id },
        data: {
          status: "open",
          acceptedBidId: null,
          assignedPartnerId: null,
          priceFils: null,
          etaMinutes: null,
          etaChangePending: false,
          bidsCloseAt: new Date(Date.now() + BID_WINDOW_MINUTES * 60_000),
          ...(r.paymentStatus === "paid" ? { paymentStatus: "none", paidFils: null, paymentRef: null } : {}),
        },
      });
      if (r.paymentStatus === "paid") await addCareRefund(r.id, r.paidFils ?? 0, "Customer declined the changed arrival time", actor);
      await logCareEvent(r.id, "eta_rejected", actor, `Customer declined the changed ETA; refund due and request reopened for ${BID_WINDOW_MINUTES} minutes`);
      if (partner) await notifyPartner(partner, `Booking ${r.code} released`, `The customer did not accept the changed arrival time for ${r.code}.`);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "cancel") {
    if (!["submitted", "reviewing", "open", "offer_accepted"].includes(r.status)) {
      return NextResponse.json({ error: "A partner is already confirmed or on the way. Please contact Wheeler Dealers to cancel." }, { status: 409 });
    }
    await prisma.careRequest.update({
      where: { id: r.id },
      data: {
        status: "cancelled",
        cancelReason: (body.reason ?? "").slice(0, 300) || "Cancelled by customer",
        pendingBidId: null,
      },
    });
    if (r.paymentStatus === "paid") await addCareRefund(r.id, r.paidFils ?? 0, "Customer cancelled after paying", actor);
    await prisma.careBid.updateMany({ where: { requestId: r.id, status: { in: ["active", "accepted"] } }, data: { status: "rejected" } });
    await logCareEvent(r.id, "cancelled", actor, body.reason || "Cancelled by customer");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
