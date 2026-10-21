import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/customer/me — session profile + the customer's bookings. */
export async function GET(req: NextRequest) {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, mobile: true, name: true, email: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const jobs = await prisma.inspectionJob.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      jobCode: true,
      status: true,
      make: true,
      model: true,
      year: true,
      scheduledAt: true,
      scheduledSlot: true,
      reportToken: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    customer,
    jobs: jobs.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      status: j.status,
      vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledSlot: j.scheduledSlot,
      reportToken: j.status === "completed" ? j.reportToken : null,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
