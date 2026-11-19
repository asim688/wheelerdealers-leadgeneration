import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInvoicePdf, invoiceNumber } from "@/lib/invoice";

export const runtime = "nodejs";

/** GET /api/invoice/[token] — the invoice PDF via its unguessable link (used in the email). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.taxInvoice.findUnique({ where: { token } });
  if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const pdf = await buildInvoicePdf(inv);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber(inv.seq)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
