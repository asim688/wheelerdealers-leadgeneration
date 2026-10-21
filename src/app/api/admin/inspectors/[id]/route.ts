import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

const APPROVAL_STATUSES = ["pending", "approved", "suspended"];

/**
 * PATCH /api/admin/inspectors/[id]
 * ---------------------------------------------------------------------------
 * Manage an inspection company (admin only):
 * - { active: boolean }             activate / deactivate
 * - { approvalStatus: string }      approve / suspend / back to pending
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: { active?: boolean; approvalStatus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data: { active?: boolean; approvalStatus?: string } = {};
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "'active' must be a boolean." }, { status: 400 });
    }
    data.active = body.active;
  }
  if (body.approvalStatus !== undefined) {
    if (!APPROVAL_STATUSES.includes(body.approvalStatus)) {
      return NextResponse.json({ error: "Invalid approval status." }, { status: 400 });
    }
    data.approvalStatus = body.approvalStatus;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  let company;
  try {
    company = await prisma.inspector.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  // Tell the company it was approved (provider-ready stub).
  if (data.approvalStatus === "approved") {
    await sendEmail(
      company.email,
      "Your Wheeler Dealers marketplace account is approved",
      `<p>Hi ${company.contactPerson || company.name},</p>
<p>Your inspection company <b>${company.name}</b> has been approved. You can now
sign in and accept available inspection jobs.</p>
<p>— The Wheeler Dealers</p>`,
    );
  }

  return NextResponse.json({
    ok: true,
    active: company.active,
    approvalStatus: company.approvalStatus,
  });
}
