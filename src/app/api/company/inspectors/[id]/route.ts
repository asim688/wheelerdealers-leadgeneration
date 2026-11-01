import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, hashPassword } from "@/lib/auth";
import { normaliseUaeMobile } from "@/lib/contactValidation";

export const runtime = "nodejs";

/**
 * PATCH /api/company/inspectors/[id]
 * ---------------------------------------------------------------------------
 * Company manages its own inspector: toggle active, reset password, edit
 * name/phone. Scoped strictly to inspectors belonging to this company.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const inspector = await prisma.inspector.findFirst({
    where: { id, companyId },
    select: { id: true, phone: true },
  });
  if (!inspector) {
    return NextResponse.json({ error: "Inspector not found." }, { status: 404 });
  }

  let body: { active?: boolean; password?: string; name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.phone === "string") {
    const phone = normaliseUaeMobile(body.phone);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid UAE mobile number (e.g. 05X XXX XXXX)." }, { status: 400 });
    }
    // A new number must be verified by the inspector again at next sign-in.
    if (phone !== inspector.phone) {
      data.phone = phone;
      data.phoneVerifiedAt = null;
    }
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }
    data.passwordHash = hashPassword(body.password);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.inspector.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, phone: true, active: true },
  });

  return NextResponse.json({ ok: true, inspector: updated });
}
