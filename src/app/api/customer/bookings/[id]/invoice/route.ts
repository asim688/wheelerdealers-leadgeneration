import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { ensureJobPayment } from "@/lib/ledger";
import { buildInvoicePdf, invoiceNumber, issueInvoice } from "@/lib/invoice";

export const runtime = "nodejs";

/** GET /api/customer/bookings/[id]/invoice — the signed-in customer's tax invoice PDF for a paid booking. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.inspectionJob.findFirst({
    where: { id, customerId },
    select: { id: true, paymentStatus: true },
  });
  if (!job) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (job.paymentStatus !== "paid") return NextResponse.json({ error: "No payment has been received for this booking." }, { status: 409 });

  // Bookings paid before invoicing existed get their invoice on first request.
  await ensureJobPayment(job.id);
  const inv = await issueInvoice(job.id);
  if (!inv) return NextResponse.json({ error: "Invoice is not available." }, { status: 404 });
  const pdf = await buildInvoicePdf(inv);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber(inv.seq)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
