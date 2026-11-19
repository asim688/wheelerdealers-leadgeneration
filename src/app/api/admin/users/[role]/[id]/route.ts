import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { logCompanyActivity } from "@/lib/adminCompany";

export const runtime = "nodejs";

/** PATCH /api/admin/users/[role]/[id] — Admin only: { active } and/or { password } for any role. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ role: string; id: string }> }) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { role, id } = await params;

  let body: { active?: boolean; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data: { active?: boolean; passwordHash?: string } = {};
  if (typeof body.active === "boolean") {
    if (role === "admin" && id === who.id && !body.active) {
      return NextResponse.json({ error: "You cannot deactivate your own login." }, { status: 400 });
    }
    data.active = body.active;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    data.passwordHash = hashPassword(body.password);
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    if (role === "admin") await prisma.adminUser.update({ where: { id }, data });
    else if (role === "account_manager") await prisma.accountManager.update({ where: { id }, data });
    else if (role === "inspector") await prisma.inspector.update({ where: { id }, data });
    else if (role === "company") {
      await prisma.inspectionCompany.update({ where: { id }, data });
      if (data.active !== undefined) {
        await logCompanyActivity(id, data.active ? "activated" : "deactivated", { name: who.name, email: who.email, role: "admin" }, "From User Management");
      }
    } else return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
