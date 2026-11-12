import type { NextRequest } from "next/server";
import type { InspectionCompany, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminEmail } from "@/lib/auth";
import { clientIp } from "@/lib/rateLimit";
import { missingDocs, payoutGaps } from "@/lib/companyCompliance";

/** Jobs that belong to a company: accepted by it, or run by one of its inspectors. */
export function companyJobScope(companyId: string): Prisma.InspectionJobWhereInput {
  return { OR: [{ acceptedByCompanyId: companyId }, { acceptedByCompanyId: null, inspector: { companyId } }] };
}

/** Statuses shown under "Assigned" on the company page: accepted but not yet finished. */
export const ASSIGNED_STATUSES = ["accepted", "assigned", "in_progress", "report_submitted"];

export interface Actor {
  name: string;
  email: string;
  role: "super_admin";
  ip: string;
  userAgent: string;
}

/** Who is acting. The Super Admin login is a single shared account, so the person's own name comes from the request. */
export function adminActor(req: NextRequest, personName?: string): Actor {
  return {
    name: (personName ?? "").trim() || "Super Admin",
    email: getAdminEmail(),
    role: "super_admin",
    ip: clientIp(req),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  };
}

export async function logCompanyActivity(
  companyId: string,
  action: string,
  actor: Partial<Omit<Actor, "role">> & { role?: string },
  note?: string | null,
) {
  await prisma.companyActivity.create({
    data: {
      companyId,
      action,
      actorName: actor.name ?? null,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
      note: note ? note.slice(0, 500) : null,
    },
  });
}

type CompanyWithDocs = InspectionCompany & {
  _count: { inspectors: number; jobs: number };
  documents: Array<{ id: string; kind: string; label: string | null; fileName: string; sizeBytes: number; createdAt: Date }>;
};

/** The company record the admin screens show (list row and detail page). */
export function serializeCompany(c: CompanyWithDocs, jobsCompleted: number) {
  const kinds = c.documents.map((d) => d.kind);
  return {
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
    emailVerifiedAt: c.emailVerifiedAt?.toISOString() ?? null,
    phoneVerifiedAt: c.phoneVerifiedAt?.toISOString() ?? null,
    pocEmailVerifiedAt: c.pocEmailVerifiedAt?.toISOString() ?? null,
    pocMobileVerifiedAt: c.pocMobileVerifiedAt?.toISOString() ?? null,
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    verifiedByName: c.verifiedByName,
    verifiedByEmail: c.verifiedByEmail,
    verifiedByRole: c.verifiedByRole,
    missingDocs: missingDocs(kinds),
    payoutGaps: payoutGaps(c, kinds),
    approvalStatus: c.approvalStatus,
    active: c.active,
    inspectorCount: c._count.inspectors,
    jobsAssigned: c._count.jobs,
    jobsCompleted,
    documents: c.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    createdAt: c.createdAt.toISOString(),
  };
}

export const COMPANY_INCLUDE = {
  _count: { select: { inspectors: true, jobs: true } },
  documents: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, kind: true, label: true, fileName: true, sizeBytes: true, createdAt: true },
  },
};
