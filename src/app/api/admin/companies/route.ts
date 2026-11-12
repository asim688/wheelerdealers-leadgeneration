import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { COMPANY_INCLUDE, serializeCompany } from "@/lib/adminCompany";

export const runtime = "nodejs";

/**
 * GET /api/admin/companies
 * ---------------------------------------------------------------------------
 * Super Admin roster of inspection companies with dispatch stats:
 * inspectors count, jobs assigned (accepted by the company) vs completed.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companies = await prisma.inspectionCompany.findMany({
    orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
    include: COMPANY_INCLUDE,
  });

  // Per-company completed counts in one query.
  const completedRows = await prisma.inspectionJob.groupBy({
    by: ["acceptedByCompanyId"],
    where: { acceptedByCompanyId: { not: null }, status: "completed" },
    _count: { _all: true },
  });
  const completedMap = new Map(
    completedRows.map((r) => [r.acceptedByCompanyId as string, r._count._all]),
  );

  return NextResponse.json({
    companies: companies.map((c) => serializeCompany(c, completedMap.get(c.id) ?? 0)),
  });
}
