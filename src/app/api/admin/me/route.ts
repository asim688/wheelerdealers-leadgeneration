import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminIdentity";

export const runtime = "nodejs";

/** GET /api/admin/me — who is signed in on the admin side (owner login or a named staff member). */
export async function GET(req: NextRequest) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ name: who.name, email: who.email, staff: who.staff });
}
