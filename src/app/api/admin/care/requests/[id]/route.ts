import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { CARE_SERVICES, CONDITIONS, FUEL_TYPES, addCareRefund, aed, fils, logCareEvent, notifyCustomer, notifyPartner, partnerCovers, partnerPhone } from "@/lib/care";

export const runtime = "nodejs";

/** GET /api/admin/care/requests/[id] — full request: details, every bid (incl. withdrawn) and history. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const r = await prisma.careRequest.findUnique({
    where: { id },
    include: {
      bids: { include: { partner: { select: { name: true, phone: true, pocMobile: true } } }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      assignedPartner: { select: { id: true, name: true, phone: true, pocMobile: true } },
    },
  });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const partners = await prisma.inspectionCompany.findMany({ where: { active: true, approvalStatus: "approved", partnerType: "care" }, orderBy: { name: "asc" } });
  return NextResponse.json({
    request: {
      ...r,
      serviceLabel: CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? r.service,
      conditionLabel: r.condition ? CONDITIONS[r.condition] ?? r.condition : null,
      fuelLabel: r.fuelType ? FUEL_TYPES[r.fuelType] ?? r.fuelType : null,
      assignedPartner: r.assignedPartner ? { id: r.assignedPartner.id, name: r.assignedPartner.name, phone: partnerPhone(r.assignedPartner) } : null,
      bids: undefined,
      events: undefined,
    },
    bids: r.bids.map((b) => ({ id: b.id, partner: b.partner.name, phone: partnerPhone(b.partner), priceFils: b.priceFils, etaMinutes: b.etaMinutes, confirmedEtaMinutes: b.confirmedEtaMinutes, pickupAt: b.pickupAt, terms: b.terms, status: b.status, createdAt: b.createdAt })),
    events: r.events,
    eligiblePartners: partners.filter((p) => partnerCovers(p, r)).map((p) => ({ id: p.id, name: p.name, phone: partnerPhone(p) })),
  });
}

/**
 * PATCH /api/admin/care/requests/[id]
 *   { action: "review" }                                   roadside: submitted → reviewing
 *   { action: "assign", partnerId, price?, etaMinutes? }   roadside: WD assigns a partner (quote / ETA shown only once set)
 *   { action: "en_route" | "complete" }                    progress updates on behalf of the partner
 *   { action: "cancel", reason }                           any open request
 *   { action: "note", note }                               internal note
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const r = await prisma.careRequest.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let b: { action?: string; partnerId?: string; price?: unknown; etaMinutes?: unknown; reason?: string; note?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const actor = { name: who.name, role: "admin" as const };

  switch (b.action) {
    case "review": {
      if (r.status !== "submitted") return NextResponse.json({ error: "Already reviewed." }, { status: 409 });
      await prisma.careRequest.update({ where: { id }, data: { status: "reviewing" } });
      await logCareEvent(id, "reviewing", actor, "WD is reviewing the request");
      await notifyCustomer(r, "We're on it", "Wheeler Dealers received your request and is arranging a partner.");
      return NextResponse.json({ ok: true });
    }
    case "assign": {
      if (r.kind !== "roadside" || !["submitted", "reviewing", "assigned"].includes(r.status)) return NextResponse.json({ error: "Only open roadside requests can be assigned." }, { status: 409 });
      const p = await prisma.inspectionCompany.findFirst({ where: { id: b.partnerId ?? "", active: true, approvalStatus: "approved", partnerType: "care" } });
      if (!p || !partnerCovers(p, r)) return NextResponse.json({ error: "Choose an approved Care partner that offers this service." }, { status: 400 });
      const price = b.price === "" || b.price == null ? null : Number(b.price);
      const eta = b.etaMinutes === "" || b.etaMinutes == null ? null : Number(b.etaMinutes);
      if (price != null && (!Number.isFinite(price) || price < 0 || price > 50_000)) return NextResponse.json({ error: "Invalid price." }, { status: 400 });
      if (eta != null && (!Number.isInteger(eta) || eta < 1 || eta > 1440)) return NextResponse.json({ error: "Invalid ETA (minutes)." }, { status: 400 });
      await prisma.careRequest.update({ where: { id }, data: { status: "assigned", assignedPartnerId: p.id, priceFils: price == null ? null : fils(price), etaMinutes: eta } });
      const parts = [p.name, price != null ? `AED ${aed(fils(price))}` : null, eta != null ? `ETA ${eta} min` : null].filter(Boolean).join(" · ");
      await logCareEvent(id, "assigned", actor, parts);
      await notifyCustomer(r, "Partner assigned", `A partner has been assigned: ${parts}.`);
      await notifyPartner(p, `New ${r.code} assigned to you`, `Wheeler Dealers assigned ${r.code} to you. Pickup: ${r.pickupAddress}. Customer: ${r.customerName} ${r.customerMobile}. Collect payment on site after the service.`);
      return NextResponse.json({ ok: true });
    }
    case "en_route":
    case "complete": {
      const allowed = b.action === "en_route" ? ["assigned"] : ["assigned", "en_route", "confirmed", "in_progress"];
      if (!allowed.includes(r.status)) return NextResponse.json({ error: "Not possible at the current status." }, { status: 409 });
      const to = b.action === "en_route" ? "en_route" : "completed";
      await prisma.careRequest.update({ where: { id }, data: { status: to } });
      await logCareEvent(id, to, actor, b.action === "en_route" ? "Partner on the way (updated by WD)" : "Completed (recorded by WD)");
      return NextResponse.json({ ok: true });
    }
    case "cancel": {
      if (["completed", "cancelled"].includes(r.status)) return NextResponse.json({ error: "Already closed." }, { status: 409 });
      const reason = (b.reason ?? "").trim();
      if (reason.length < 3) return NextResponse.json({ error: "Write the reason." }, { status: 400 });
      await prisma.careRequest.update({
        where: { id },
        data: { status: "cancelled", cancelReason: reason.slice(0, 300), pendingBidId: null },
      });
      if (r.paymentStatus === "paid") await addCareRefund(id, r.paidFils ?? 0, "Cancelled by WD after payment", actor);
      await prisma.careBid.updateMany({ where: { requestId: id, status: { in: ["active", "accepted"] } }, data: { status: "rejected" } });
      await logCareEvent(id, "cancelled", actor, reason);
      await notifyCustomer(r, "Request cancelled", `Your request was cancelled: ${reason}`);
      return NextResponse.json({ ok: true });
    }
    case "refunded": {
      if (r.refundStatus !== "due") return NextResponse.json({ error: "No refund is due on this request." }, { status: 409 });
      const ref = (b.note ?? "").trim();
      if (ref.length < 3) return NextResponse.json({ error: "Enter the refund reference (gateway dashboard)." }, { status: 400 });
      await prisma.careRequest.update({ where: { id }, data: { refundStatus: "refunded", refundRef: ref.slice(0, 200) } });
      await logCareEvent(id, "refunded", actor, `Refund of AED ${aed(r.refundFils)} recorded · ${ref}`);
      await notifyCustomer(r, "Refund processed", `Your refund of AED ${aed(r.refundFils)} has been processed.`);
      return NextResponse.json({ ok: true });
    }
    case "note": {
      const note = (b.note ?? "").trim().slice(0, 1000);
      await prisma.careRequest.update({ where: { id }, data: { adminNote: note || null } });
      await logCareEvent(id, "note", actor, note || "Note cleared");
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
