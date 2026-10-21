import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/company/jobs/available
 * ---------------------------------------------------------------------------
 * The live job pool for this company. Excludes:
 *  - jobs this company cancelled before (permanent exclusion — "your loss"),
 *  - jobs whose open window expired.
 * Customer contact details are withheld until acceptance.
 */
export async function GET(req: NextRequest) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const company = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: { active: true, approvalStatus: true },
  });
  if (!company || !company.active || company.approvalStatus !== "approved") {
    return NextResponse.json(
      { error: "Your company is not approved to receive jobs yet." },
      { status: 403 },
    );
  }

  const now = new Date();
  const rows = await prisma.inspectionJob.findMany({
    where: {
      status: "available",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const jobs = rows
    .filter((j) => !(j.excludedCompanyIds ?? "").split(",").includes(companyId))
    .map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      status: j.status,
      vehicle: [j.year, j.make, j.model].filter(Boolean).join(" ") || "Vehicle",
      // Marketplace listing shows area only — full address after acceptance.
      location: [j.city, j.emirate].filter(Boolean).join(", ") || "UAE",
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledSlot: j.scheduledSlot,
      expiresAt: j.expiresAt ? j.expiresAt.toISOString() : null,
      createdAt: j.createdAt.toISOString(),
    }));

  return NextResponse.json({ jobs });
}
