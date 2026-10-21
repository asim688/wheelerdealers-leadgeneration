import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDealerId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const dealerId = getDealerId(req);
  if (!dealerId) {
    return NextResponse.json({ dealer: null }, { status: 200 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, name: true, email: true, approved: true },
  });

  return NextResponse.json({ dealer: dealer ?? null });
}
