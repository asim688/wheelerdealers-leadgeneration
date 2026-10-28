import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";

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
    include: {
      _count: { select: { inspectors: true, jobs: true } },
      documents: {
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, label: true, fileName: true, sizeBytes: true, createdAt: true },
      },
    },
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
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      details: c.details,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      emirate: c.emirate,
      lat: c.lat,
      lng: c.lng,
      pocName: c.pocName,
      pocMobile: c.pocMobile,
      pocEmail: c.pocEmail,
      tradeLicense: c.tradeLicense,
      areas: c.areas,
      services: c.services,
      bankAccountTitle: c.bankAccountTitle,
      bankAccountNumber: c.bankAccountNumber,
      bankIban: c.bankIban,
      bankName: c.bankName,
      bankBranch: c.bankBranch,
      approvalStatus: c.approvalStatus,
      active: c.active,
      inspectorCount: c._count.inspectors,
      jobsAssigned: c._count.jobs,
      jobsCompleted: completedMap.get(c.id) ?? 0,
      documents: c.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
