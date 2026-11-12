import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { missingDocs, payoutGaps, sendCompanyWelcomeEmail } from "@/lib/companyCompliance";
import {
  ASSIGNED_STATUSES,
  COMPANY_INCLUDE,
  adminActor,
  companyJobScope,
  logCompanyActivity,
  serializeCompany,
} from "@/lib/adminCompany";

export const runtime = "nodejs";

const APPROVAL_STATUSES = ["pending", "approved", "suspended"];

/**
 * GET /api/admin/companies/[id]
 * ---------------------------------------------------------------------------
 * Everything for one company's page: registration record, inspectors, job
 * counts (All / Assigned / Completed) and the track record of who registered,
 * verified, suspended or reinstated it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const company = await prisma.inspectionCompany.findUnique({ where: { id }, include: COMPANY_INCLUDE });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const scope = companyJobScope(id);
  const [all, assigned, completed, completedCount, inspectors, inspectorJobs, activity, manager] = await Promise.all([
    prisma.inspectionJob.count({ where: scope }),
    prisma.inspectionJob.count({ where: { AND: [scope, { status: { in: ASSIGNED_STATUSES } }] } }),
    prisma.inspectionJob.count({ where: { AND: [scope, { status: "completed" }] } }),
    prisma.inspectionJob.count({ where: { acceptedByCompanyId: id, status: "completed" } }),
    prisma.inspector.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, email: true, phone: true, active: true, approvalStatus: true,
        emailVerifiedAt: true, phoneVerifiedAt: true, createdAt: true,
      },
    }),
    prisma.inspectionJob.groupBy({
      by: ["assignedInspectorId", "status"],
      where: { assignedInspectorId: { not: null }, inspector: { companyId: id } },
      _count: { _all: true },
    }),
    prisma.companyActivity.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    company.accountManagerId
      ? prisma.accountManager.findUnique({ where: { id: company.accountManagerId }, select: { id: true, name: true, email: true } })
      : Promise.resolve(null),
  ]);

  const perInspector = new Map<string, { total: number; completed: number }>();
  for (const r of inspectorJobs) {
    const key = r.assignedInspectorId as string;
    const cur = perInspector.get(key) ?? { total: 0, completed: 0 };
    cur.total += r._count._all;
    if (r.status === "completed") cur.completed += r._count._all;
    perInspector.set(key, cur);
  }

  const events = activity.map((a) => ({
    id: a.id,
    action: a.action,
    actorName: a.actorName,
    actorEmail: a.actorEmail,
    actorRole: a.actorRole,
    ip: a.ip,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  }));
  // Companies registered before the log existed still get a "registered" entry.
  if (!events.some((e) => e.action === "registered")) {
    events.push({
      id: "registered",
      action: "registered",
      actorName: company.pocName ?? company.name,
      actorEmail: company.email,
      actorRole: "company",
      ip: null,
      note: null,
      createdAt: company.createdAt.toISOString(),
    });
  }

  return NextResponse.json({
    company: serializeCompany(company, completedCount),
    accountManager: manager,
    jobCounts: { all, assigned, completed },
    inspectors: inspectors.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      phone: i.phone,
      active: i.active,
      approvalStatus: i.approvalStatus,
      emailVerifiedAt: i.emailVerifiedAt?.toISOString() ?? null,
      phoneVerifiedAt: i.phoneVerifiedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      jobs: perInspector.get(i.id)?.total ?? 0,
      jobsCompleted: perInspector.get(i.id)?.completed ?? 0,
    })),
    activity: events,
  });
}

/**
 * PATCH /api/admin/companies/[id]
 * ---------------------------------------------------------------------------
 * Manage an inspection company (Super Admin only):
 * - { active: boolean }         activate / deactivate the login
 * - { approvalStatus: string }  approve / suspend / back to pending
 * Approving a NEW application requires its documents (trade licence, VAT
 * certificate, Bank IBAN Letter) and bank details, and the name of the person
 * verifying it ({ verifierName }); that person, the time and their sign-in are
 * recorded as the registration's track record. The first approval emails the
 * welcome message to the registered email and the PoC email.
 * Every status change is also written to the company's activity log.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: { active?: boolean; approvalStatus?: string; verifierName?: string; note?: string };
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

  const existing = await prisma.inspectionCompany.findUnique({
    where: { id },
    include: { documents: { select: { kind: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  // A pending application can only be approved once it is complete.
  if (data.approvalStatus === "approved" && existing.approvalStatus === "pending") {
    const kinds = existing.documents.map((d) => d.kind);
    const gaps = [...missingDocs(kinds), ...payoutGaps(existing, kinds).filter((g) => g !== "Bank IBAN Letter")];
    if (gaps.length > 0) {
      return NextResponse.json(
        { error: `Cannot approve yet — missing: ${gaps.join(", ")}. Ask the company to complete its application.` },
        { status: 400 },
      );
    }
  }

  const verifierName = (body.verifierName ?? "").trim().slice(0, 80);
  const firstApproval = data.approvalStatus === "approved" && existing.approvalStatus === "pending";
  if (firstApproval && verifierName.length < 2) {
    return NextResponse.json(
      { error: "Enter the name of the person verifying this registration." },
      { status: 400 },
    );
  }
  const actor = adminActor(req, verifierName);
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const update: Prisma.InspectionCompanyUpdateInput = { ...data };
  if (firstApproval) {
    update.verifiedAt = new Date();
    update.verifiedByName = actor.name;
    update.verifiedByEmail = actor.email;
    update.verifiedByRole = actor.role;
  }
  const company = await prisma.inspectionCompany.update({ where: { id }, data: update });

  if (data.approvalStatus && data.approvalStatus !== existing.approvalStatus) {
    const action =
      data.approvalStatus === "approved" ? (firstApproval ? "approved" : "reinstated") : data.approvalStatus;
    await logCompanyActivity(id, action, actor, note);
  }
  if (data.active !== undefined && data.active !== existing.active) {
    await logCompanyActivity(id, data.active ? "activated" : "deactivated", actor, note);
  }

  // First-time approval → welcome email ("successfully registered") to company + PoC.
  if (firstApproval) {
    await sendCompanyWelcomeEmail(company);
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
