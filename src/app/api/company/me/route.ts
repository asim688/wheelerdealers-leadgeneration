import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/company/me — current company session profile. */
export async function GET(req: NextRequest) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const company = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      emirate: true,
      pocName: true,
      pocMobile: true,
      pocEmail: true,
      approvalStatus: true,
      active: true,
    },
  });
  if (!company || !company.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ company });
}
