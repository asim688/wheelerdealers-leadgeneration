import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/** Lists all dealers with their approval status (admin only). */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dealers = await prisma.dealer.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    dealers: dealers.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

/** Approves (or revokes) a dealer (admin only). */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { dealerId?: string; approved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const dealerId = (body.dealerId ?? "").trim();
  if (!dealerId) {
    return NextResponse.json({ error: "A dealerId is required." }, { status: 400 });
  }

  const approved = body.approved !== false; // default to approving

  try {
    await prisma.dealer.update({
      where: { id: dealerId },
      data: { approved },
    });
  } catch {
    return NextResponse.json({ error: "Dealer not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, approved });
}
