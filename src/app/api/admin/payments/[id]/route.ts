import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { invoiceNumber } from "@/lib/invoice";
import { effectivePayoutStatus, logPaymentEvent } from "@/lib/ledger";

export const runtime = "nodejs";

/** GET /api/admin/payments/[id] — one payment with its full audit timeline. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.jobPayment.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      job: { select: { jobCode: true, customerName: true, customerMobile: true, customerEmail: true, status: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  const company = p.companyId
    ? await prisma.inspectionCompany.findUnique({
        where: { id: p.companyId },
        select: { name: true, bankAccountTitle: true, bankAccountNumber: true, bankIban: true, bankName: true, bankBranch: true },
      })
    : null;
  const inv = await prisma.taxInvoice.findUnique({ where: { jobId: p.jobId }, select: { seq: true, token: true } });
  return NextResponse.json({
    invoice: inv ? { number: invoiceNumber(inv.seq), url: `/api/invoice/${inv.token}` } : null,
    payment: { ...p, payoutStatus: effectivePayoutStatus(p), events: undefined, createdAt: p.createdAt.toISOString() },
    company,
    events: p.events.map((e) => ({ id: e.id, type: e.type, by: e.actorName, role: e.actorRole, detail: e.detail, at: e.createdAt.toISOString() })),
  });
}

/**
 * PATCH /api/admin/payments/[id] — Admin only (Account Managers cannot hold or pay):
 *   { action: "hold", reason }   { action: "release" }   { action: "paid", reference }
 * "Paid" is only allowed once the payout is due (3 h after the report reached the customer).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  let body: { action?: string; reason?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const p = await prisma.jobPayment.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  const actor = { name: who.name, role: "admin" as const, id: who.id };

  if (body.action === "hold") {
    const reason = (body.reason ?? "").trim();
    if (reason.length < 3) return NextResponse.json({ error: "Write the reason for the hold." }, { status: 400 });
    if (p.payoutStatus === "paid") return NextResponse.json({ error: "Already paid out." }, { status: 409 });
    if (p.payoutStatus === "on_hold") return NextResponse.json({ error: "Already on hold." }, { status: 409 });
    await prisma.jobPayment.update({ where: { id }, data: { payoutStatus: "on_hold", holdReason: reason.slice(0, 300), heldByName: who.name, heldAt: new Date() } });
    await logPaymentEvent(id, "hold", actor, reason);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "release") {
    if (p.payoutStatus !== "on_hold") return NextResponse.json({ error: "This payout is not on hold." }, { status: 409 });
    await prisma.jobPayment.update({
      where: { id },
      data: { payoutStatus: p.companyId ? "pending" : "not_eligible", holdReason: null, heldByName: null, heldAt: null },
    });
    await logPaymentEvent(id, "release", actor, "Hold released");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "paid") {
    const reference = (body.reference ?? "").trim();
    if (reference.length < 3) return NextResponse.json({ error: "Enter the bank transfer reference." }, { status: 400 });
    if (p.payoutStatus === "paid") return NextResponse.json({ error: "Already marked as paid." }, { status: 409 });
    if (effectivePayoutStatus(p) !== "due") {
      return NextResponse.json({ error: "This payout is not due yet (it is due 3 hours after the report reaches the customer, with no hold or refund)." }, { status: 409 });
    }
    // Status guard makes a double click / two admins safe: only one can flip it.
    const done = await prisma.jobPayment.updateMany({
      where: { id, payoutStatus: "pending" },
      data: { payoutStatus: "paid", paidAt: new Date(), payoutRef: reference.slice(0, 120), paidByName: who.name },
    });
    if (done.count === 0) return NextResponse.json({ error: "Already handled." }, { status: 409 });
    await logPaymentEvent(id, "paid", actor, `Bank reference ${reference}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
