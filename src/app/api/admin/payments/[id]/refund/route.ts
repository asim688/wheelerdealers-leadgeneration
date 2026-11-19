import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { logPaymentEvent } from "@/lib/ledger";
import { aedToFils } from "@/lib/commission";

export const runtime = "nodejs";

/**
 * POST /api/admin/payments/[id]/refund  (Admin only)
 *   { kind: "full" }                         refunds everything not yet refunded
 *   { kind: "partial", amount: <AED> }       refunds the amount the Admin types
 *   plus { reason?, reference? }  (reference = Stripe refund id / bank note)
 * The Admin sends the money back from the Stripe dashboard and records it here; the ledger then
 * reflects it. A full refund before payout cancels the company's payout.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  let body: { kind?: string; amount?: number | string; reason?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const p = await prisma.jobPayment.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const remaining = p.grossFils - p.refundedFils;
  if (remaining <= 0) return NextResponse.json({ error: "This payment is already fully refunded." }, { status: 409 });

  let amountFils: number;
  if (body.kind === "full") {
    amountFils = remaining;
  } else if (body.kind === "partial") {
    const aed = Number(body.amount);
    if (!Number.isFinite(aed) || aed <= 0) return NextResponse.json({ error: "Enter the refund amount in AED." }, { status: 400 });
    amountFils = aedToFils(aed);
    if (amountFils > remaining) {
      return NextResponse.json({ error: `The amount is more than what can still be refunded (AED ${(remaining / 100).toFixed(2)}).` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Choose a full or partial refund." }, { status: 400 });
  }

  const totalRefunded = p.refundedFils + amountFils;
  const full = totalRefunded >= p.grossFils;
  const reason = (body.reason ?? "").trim().slice(0, 300) || null;
  const reference = (body.reference ?? "").trim().slice(0, 120) || null;

  // Guard on refundedFils so two admins cannot both refund the same remainder.
  const done = await prisma.jobPayment.updateMany({
    where: { id, refundedFils: p.refundedFils },
    data: {
      refundedFils: totalRefunded,
      paymentStatus: full ? "refunded" : "partially_refunded",
      // Nothing left to pay the company on a fully refunded job (unless it was already paid out).
      ...(full && p.payoutStatus !== "paid" ? { payoutStatus: "cancelled", eligibleAt: null } : {}),
    },
  });
  if (done.count === 0) return NextResponse.json({ error: "This payment was just updated. Please reload." }, { status: 409 });

  // Close the customer's open refund request if there is one, otherwise record a new Admin-initiated refund.
  const kind = body.kind === "full" ? "full" : "partial";
  const open = await prisma.paymentRefund.findFirst({ where: { paymentId: id, status: "requested" } });
  if (open) {
    await prisma.paymentRefund.update({
      where: { id: open.id },
      data: { status: "done", amountFils, kind, reference, processedByName: who.name, processedAt: new Date(), ...(reason ? { reason } : {}) },
    });
  } else {
    await prisma.paymentRefund.create({
      data: { paymentId: id, amountFils, kind, reason, status: "done", reference, requestedBy: who.name, processedByName: who.name, processedAt: new Date() },
    });
  }
  await logPaymentEvent(
    id,
    "refund",
    { name: who.name, role: "admin", id: who.id },
    `${full ? "Full" : "Partial"} refund AED ${(amountFils / 100).toFixed(2)}${reference ? ` (ref ${reference})` : ""}${reason ? ` — ${reason}` : ""}${full && p.payoutStatus === "paid" ? " — company was already paid; recover from the company" : ""}`,
  );
  return NextResponse.json({ ok: true, fullyRefunded: full, refundedFils: totalRefunded });
}
