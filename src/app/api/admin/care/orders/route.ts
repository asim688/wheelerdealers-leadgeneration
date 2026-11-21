import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";

export const runtime = "nodejs";

/** GET /api/admin/care/orders — product orders, newest first. */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orders = await prisma.careOrder.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ orders });
}
