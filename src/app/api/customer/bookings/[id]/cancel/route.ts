import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { logPaymentEvent } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * POST /api/customer/bookings/[id]/cancel
 * The customer may cancel until an inspection company accepts the job; a paid booking then gets a full
 * refund request that the Admin processes. After a company has accepted, only Admin can decide.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.inspectionJob.findFirst({
    where: { id, customerId },
    select: { id: true, jobCode: true, status: true, paymentStatus: true },
  });
  if (!job) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!["payment_pending", "available"].includes(job.status)) {
    const msg =
      job.status === "cancelled"
        ? "This booking is already cancelled."
        : "An inspection company has already accepted this booking, so it can no longer be cancelled here. Please contact Wheeler Dealers.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Status guard: if a company accepts at the same moment, exactly one of the two wins.
  const moved = await prisma.inspectionJob.updateMany({
    where: { id, customerId, status: { in: ["payment_pending", "available"] } },
    data: { status: "cancelled", expiresAt: null },
  });
  if (moved.count === 0) {
    return NextResponse.json({ error: "A company just accepted this booking, so it can no longer be cancelled here. Please contact Wheeler Dealers." }, { status: 409 });
  }

  const payment = await prisma.jobPayment.findUnique({ where: { jobId: id } });
  if (!payment) return NextResponse.json({ ok: true, refund: false });

  await prisma.$transaction([
    prisma.jobPayment.update({ where: { id: payment.id }, data: { paymentStatus: "refund_requested", payoutStatus: "not_eligible" } }),
    prisma.paymentRefund.create({
      data: { paymentId: payment.id, amountFils: payment.grossFils - payment.refundedFils, kind: "full", reason: "Customer cancelled before a company accepted", requestedBy: "customer" },
    }),
  ]);
  await logPaymentEvent(payment.id, "refund_requested", { name: "Customer", role: "customer" }, "Cancelled before a company accepted — full refund due");
  return NextResponse.json({ ok: true, refund: true });
}
