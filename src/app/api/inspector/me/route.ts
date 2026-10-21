import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/inspector/me — the signed-in inspector's profile, or 401. */
export async function GET(req: NextRequest) {
  const id = getInspectorId(req);
  if (!id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const inspector = await prisma.inspector.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });
  if (!inspector || !inspector.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ inspector });
}
