import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PAYMENT_HOLD_MINUTES, aed, fils, getCarePartner, logCareEvent, notifyCustomer, partnerCovers } from "@/lib/care";

export const runtime = "nodejs";

/**
 * POST /api/care/partner/requests/[id]
 *   { action: "bid", price, etaMinutes, pickupAt?, terms? }  submit / update an offer (price AED incl. VAT + ETA both required)
 *   { action: "withdraw" }                                    withdraw an active offer
 *   { action: "confirm_eta", etaMinutes }                     reconfirm arrival time after being selected
 *   { action: "en_route" | "start" | "complete" }             job progress
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const partner = await getCarePartner(req);
  if (!partner) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  let b: { action?: string; price?: unknown; etaMinutes?: unknown; pickupAt?: string; terms?: string; collected?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const r = await prisma.careRequest.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const actor = { name: partner.name, role: "partner" as const };

  // The customer is paying for this partner's offer right now: it cannot change under them.
  const heldForPayment = async () => {
    if (r.paymentStatus !== "pending" || !r.pendingBidId || !r.pendingSince) return false;
    if (r.pendingSince.getTime() < Date.now() - PAYMENT_HOLD_MINUTES * 60_000) return false;
    const held = await prisma.careBid.findUnique({ where: { id: r.pendingBidId }, select: { partnerId: true } });
    return held?.partnerId === partner.id;
  };

  const readEta = () => {
    const eta = Number(b.etaMinutes);
    return Number.isInteger(eta) && eta >= 5 && eta <= 1440 ? eta : null;
  };

  if (b.action === "bid") {
    if (r.kind !== "towing" || !partnerCovers(partner, r)) return NextResponse.json({ error: "You cannot bid on this request." }, { status: 403 });
    if (r.status !== "open" || (r.bidsCloseAt && r.bidsCloseAt <= new Date())) return NextResponse.json({ error: "Bidding for this request is closed." }, { status: 409 });
    const price = Number(b.price);
    const eta = readEta();
    if (!Number.isFinite(price) || price < 10 || price > 50_000) return NextResponse.json({ error: "Enter the total towing price in AED (VAT inclusive)." }, { status: 400 });
    if (eta == null) return NextResponse.json({ error: "Enter the time to reach the pickup location in minutes (5–1440)." }, { status: 400 });
    let pickupAt: Date | null = null;
    if (b.pickupAt) {
      pickupAt = new Date(b.pickupAt);
      if (Number.isNaN(pickupAt.getTime())) return NextResponse.json({ error: "Invalid pickup time." }, { status: 400 });
    }
    const terms = (b.terms ?? "").trim().slice(0, 400) || null;
    if (await heldForPayment()) return NextResponse.json({ error: "The customer is paying for your offer right now — it cannot be changed." }, { status: 409 });
    const existing = await prisma.careBid.findUnique({ where: { requestId_partnerId: { requestId: r.id, partnerId: partner.id } } });
    if (existing && !["active", "withdrawn"].includes(existing.status)) return NextResponse.json({ error: "Your offer can no longer be changed." }, { status: 409 });
    const bid = await prisma.careBid.upsert({
      where: { requestId_partnerId: { requestId: r.id, partnerId: partner.id } },
      create: { requestId: r.id, partnerId: partner.id, priceFils: fils(price), etaMinutes: eta, pickupAt, terms },
      update: { priceFils: fils(price), etaMinutes: eta, pickupAt, terms, status: "active" },
    });
    await logCareEvent(r.id, existing ? "bid_updated" : "bid", actor, `AED ${aed(bid.priceFils)} · ETA ${eta} min`);
    if (!existing) await notifyCustomer(r, "New towing offer", `You received a towing offer: AED ${aed(bid.priceFils)}, arrives in ${eta} min. Compare offers and choose one.`);
    return NextResponse.json({ ok: true, bidId: bid.id });
  }

  if (b.action === "withdraw") {
    if (await heldForPayment()) return NextResponse.json({ error: "The customer is paying for your offer right now — it cannot be withdrawn." }, { status: 409 });
    const done = await prisma.careBid.updateMany({ where: { requestId: r.id, partnerId: partner.id, status: "active" }, data: { status: "withdrawn" } });
    if (!done.count) return NextResponse.json({ error: "No active offer to withdraw." }, { status: 409 });
    await logCareEvent(r.id, "bid_withdrawn", actor);
    return NextResponse.json({ ok: true });
  }

  if (r.assignedPartnerId !== partner.id) return NextResponse.json({ error: "This job is not assigned to you." }, { status: 403 });

  if (b.action === "confirm_eta") {
    if (r.kind !== "towing" || r.status !== "offer_accepted" || r.etaChangePending) return NextResponse.json({ error: "Nothing to confirm for this job." }, { status: 409 });
    const eta = readEta();
    if (eta == null) return NextResponse.json({ error: "Enter your arrival time in minutes." }, { status: 400 });
    if (r.acceptedBidId) await prisma.careBid.update({ where: { id: r.acceptedBidId }, data: { confirmedEtaMinutes: eta } });
    if (eta === r.etaMinutes) {
      await prisma.careRequest.update({ where: { id: r.id }, data: { status: "confirmed" } });
      await logCareEvent(r.id, "confirmed", actor, `ETA reconfirmed: ${eta} min`);
      await notifyCustomer(r, "Towing confirmed", `Your towing booking is confirmed. ${partner.name} will reach the pickup in about ${eta} min.`);
    } else {
      await prisma.careRequest.update({ where: { id: r.id }, data: { etaMinutes: eta, etaChangePending: true } });
      await logCareEvent(r.id, "eta_changed", actor, `ETA changed from ${r.etaMinutes} to ${eta} min — waiting for customer`);
      await notifyCustomer(r, "Arrival time changed", `${partner.name} updated the arrival time to ${eta} min. Please approve or choose another offer.`);
    }
    return NextResponse.json({ ok: true, changed: eta !== r.etaMinutes });
  }

  const steps: Record<string, { from: string[]; to: string; label: string }> = {
    en_route: { from: ["assigned"], to: "en_route", label: "Partner is on the way" },
    start: { from: ["confirmed"], to: "in_progress", label: "Towing in progress" },
    complete: { from: ["en_route", "in_progress"], to: "completed", label: "Job completed" },
  };
  const step = steps[b.action ?? ""];
  if (!step) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!step.from.includes(r.status)) return NextResponse.json({ error: "This update is not possible at the current status." }, { status: 409 });
  // Roadside is paid on site: the partner records what the customer paid when finishing.
  const onSite = b.action === "complete" && r.kind === "roadside";
  let collectedFils: number | null = null;
  if (onSite) {
    const amount = Number(b.collected);
    if (!Number.isFinite(amount) || amount < 0 || amount > 50_000) return NextResponse.json({ error: "Enter the amount collected from the customer (AED)." }, { status: 400 });
    collectedFils = fils(amount);
  }
  await prisma.careRequest.update({
    where: { id: r.id },
    data: { status: step.to, ...(onSite ? { paymentStatus: "collected_on_site", paymentProvider: "on_site", paidFils: collectedFils, paidAt: new Date() } : {}) },
  });
  await logCareEvent(r.id, step.to, actor, onSite ? `${step.label} · AED ${aed(collectedFils)} collected on site` : step.label);
  await notifyCustomer(r, step.label, `${step.label} — ${partner.name}.`);
  return NextResponse.json({ ok: true });
}
