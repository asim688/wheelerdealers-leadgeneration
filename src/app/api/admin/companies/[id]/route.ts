import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { sendEmail, getBaseUrl } from "@/lib/inspection";

export const runtime = "nodejs";

const APPROVAL_STATUSES = ["pending", "approved", "suspended"];

/**
 * PATCH /api/admin/companies/[id]
 * ---------------------------------------------------------------------------
 * Manage an inspection company (Super Admin only):
 * - { active: boolean }         activate / deactivate the login
 * - { approvalStatus: string }  approve / suspend / back to pending
 * Approving emails the company that they can start receiving jobs.
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
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const existing = await prisma.inspectionCompany.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const company = await prisma.inspectionCompany.update({ where: { id }, data });

  // First-time approval → welcome the company.
  if (data.approvalStatus === "approved" && existing.approvalStatus !== "approved") {
    await sendEmail(
      company.email,
      "Your company is approved — The Wheeler Dealers",
      `<p>Salaam ${company.pocName ?? company.name},</p>
<p>Your inspection company <b>${company.name}</b> has been approved on The Wheeler Dealers marketplace.</p>
<p>You can now sign in, add your inspectors, and accept live jobs:</p>
<p><a href="${getBaseUrl()}/company">${getBaseUrl()}/company</a></p>
<p>Your Point of Contact (${company.pocMobile ?? company.phone}) will receive an alert whenever a new job goes live.</p>`,
    );
  }

  return NextResponse.json({
    ok: true,
    company: {
      id: company.id,
      name: company.name,
      approvalStatus: company.approvalStatus,
      active: company.active,
    },
  });
}
