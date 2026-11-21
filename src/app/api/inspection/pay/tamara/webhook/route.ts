import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleTamaraOrder, verifyTamaraToken } from "@/lib/tamara";
import { releasePaidJob } from "@/lib/inspection";
import { releaseCarePayment } from "@/lib/care";
import { careRequestIdFromRef, careTamaraJob } from "@/lib/careBilling";

export const runtime = "nodejs";

/**
 * POST /api/inspection/pay/tamara/webhook
 * Tamara order notifications. On `order_approved` we authorise + capture the order and release
 * the job to the marketplace. Later events (authorised / captured) are idempotent re-checks.
 * Authenticity: the `tamaraToken` JWT (query param or Bearer header) is signed with our
 * notification token; the order is also re-read from Tamara, never trusted from the payload.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("tamaraToken") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  if (!verifyTamaraToken(token)) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  let body: { order_id?: string; order_reference_id?: string; event_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = body.order_id;
  const jobId = body.order_reference_id;
  if (!orderId || !jobId) return NextResponse.json({ received: true });

  if (!["order_approved", "order_authorised", "order_captured"].includes(body.event_type ?? "")) {
    return NextResponse.json({ received: true });
  }

  // Care towing payment: order_reference_id = care_<requestId>_<attempt>.
  const careId = careRequestIdFromRef(jobId);
  if (careId) {
    const r = await prisma.careRequest.findUnique({ where: { id: careId } });
    if (!r || r.paymentStatus !== "pending" || r.paymentRef !== orderId || !r.pendingBidId) return NextResponse.json({ received: true });
    const bid = await prisma.careBid.findUnique({ where: { id: r.pendingBidId }, include: { partner: { select: { name: true } } } });
    if (!bid) return NextResponse.json({ received: true });
    const status = await settleTamaraOrder(orderId, careTamaraJob(r, { priceFils: bid.priceFils, partnerName: bid.partner.name }, jobId));
    if (status) await releaseCarePayment(r.id, "tamara", orderId);
    return NextResponse.json({ received: true, status });
  }

  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true, jobCode: true, fee: true, currency: true, paymentStatus: true, paymentRef: true,
      customerName: true, customerEmail: true, customerMobile: true, address: true, city: true, emirate: true, make: true, model: true, year: true,
    },
  });
  if (!job || job.fee == null) return NextResponse.json({ received: true });
  if (job.paymentStatus === "paid") return NextResponse.json({ received: true, already: true });

  const status = await settleTamaraOrder(orderId, { ...job, fee: job.fee });
  if (!status) return NextResponse.json({ received: true, settled: false });

  await releasePaidJob(job.id, orderId, "tamara");
  return NextResponse.json({ received: true, status });
}
