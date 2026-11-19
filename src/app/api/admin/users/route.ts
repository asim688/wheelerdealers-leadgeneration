import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { normaliseEmail, normaliseUaeMobile } from "@/lib/contactValidation";
import { sendCompanyWelcomeEmail, sendInspectorAddedEmail, sendManagerAddedEmail } from "@/lib/companyCompliance";
import { logCompanyActivity } from "@/lib/adminCompany";

export const runtime = "nodejs";

const USER_ROLES = ["admin", "account_manager", "company", "inspector"] as const;
type UserRole = (typeof USER_ROLES)[number];

/** An email may belong to one account only, across every role (the Manage Inspections login finds accounts by email). */
async function emailInUse(email: string): Promise<boolean> {
  const [a, m, c, i] = await Promise.all([
    prisma.adminUser.findUnique({ where: { email }, select: { id: true } }),
    prisma.accountManager.findUnique({ where: { email }, select: { id: true } }),
    prisma.inspectionCompany.findUnique({ where: { email }, select: { id: true } }),
    prisma.inspector.findUnique({ where: { email }, select: { id: true } }),
  ]);
  return !!(a || m || c || i);
}

/**
 * GET /api/admin/users?role=&q=   Admin only — every login on the platform in one list
 * (Admin staff, Account Managers, Inspection Companies, Inspectors). Customers sign themselves up by mobile code.
 */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const role = req.nextUrl.searchParams.get("role") || "";
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

  const [admins, managers, companies, inspectors] = await Promise.all([
    !role || role === "admin" ? prisma.adminUser.findMany() : [],
    !role || role === "account_manager"
      ? prisma.accountManager.findMany({ include: { _count: { select: { companies: true } } } })
      : [],
    !role || role === "company" ? prisma.inspectionCompany.findMany({ include: { _count: { select: { inspectors: true } } } }) : [],
    !role || role === "inspector" ? prisma.inspector.findMany({ include: { company: { select: { id: true, name: true } } } }) : [],
  ]);

  type Row = {
    id: string; role: UserRole; name: string; email: string; phone: string | null; active: boolean;
    status: string; detail: string; companyId?: string | null; createdAt: string;
  };
  const rows: Row[] = [
    ...admins.map((u): Row => ({ id: u.id, role: "admin", name: u.name, email: u.email, phone: null, active: u.active, status: u.active ? "active" : "inactive", detail: u.createdByName ? `created by ${u.createdByName}` : "", createdAt: u.createdAt.toISOString() })),
    ...managers.map((u): Row => ({ id: u.id, role: "account_manager", name: u.name, email: u.email, phone: u.phone, active: u.active, status: !u.active ? "inactive" : u.emailVerifiedAt && u.phoneVerifiedAt ? "active" : "unverified", detail: `${u._count.companies} companies`, createdAt: u.createdAt.toISOString() })),
    ...companies.map((u): Row => ({ id: u.id, role: "company", name: u.name, email: u.email, phone: u.phone, active: u.active, status: !u.active ? "inactive" : u.approvalStatus, detail: `${u._count.inspectors} inspectors`, companyId: u.id, createdAt: u.createdAt.toISOString() })),
    ...inspectors.map((u): Row => ({ id: u.id, role: "inspector", name: u.name, email: u.email, phone: u.phone, active: u.active, status: !u.active ? "inactive" : u.emailVerifiedAt && u.phoneVerifiedAt ? "active" : "unverified", detail: u.company?.name ?? "No company", companyId: u.company?.id ?? null, createdAt: u.createdAt.toISOString() })),
  ]
    .filter((r) => !q || [r.name, r.email, r.phone ?? "", r.detail].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const companyOptions = await prisma.inspectionCompany.findMany({ where: { approvalStatus: "approved" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ users: rows, companies: companyOptions });
}

/**
 * POST /api/admin/users   Admin only — create a login for any role:
 *   admin / account_manager / inspector: { role, name, email, password, phone?(required for manager+inspector), companyId? (inspector), companyIds? (manager) }
 *   company: { role, name, email, password, phone, pocName, pocMobile, pocEmail, city?, emirate? }
 * Companies created here are approved straight away, but still cannot accept jobs until their payout details
 * and a commission are set. Managers and inspectors verify their own email + mobile at first sign-in.
 */
export async function POST(req: NextRequest) {
  const who = await getAdminIdentity(req);
  if (!who) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const role = body.role as UserRole;
  if (!USER_ROLES.includes(role)) return NextResponse.json({ error: "Choose a role." }, { status: 400 });

  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(body.name);
  const email = normaliseEmail(str(body.email, 200));
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length < 2) return NextResponse.json({ error: "Enter the name." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  if (await emailInUse(email)) return NextResponse.json({ error: "That email is already used by another account." }, { status: 409 });

  if (role === "admin") {
    const u = await prisma.adminUser.create({ data: { name, email, passwordHash: hashPassword(password), createdByName: who.name } });
    return NextResponse.json({ ok: true, id: u.id });
  }

  const phone = normaliseUaeMobile(str(body.phone, 30));
  if (!phone) return NextResponse.json({ error: "Enter a UAE mobile number (05X XXX XXXX)." }, { status: 400 });

  if (role === "account_manager") {
    const m = await prisma.accountManager.create({ data: { name, email, phone, passwordHash: hashPassword(password) }, select: { id: true, name: true, email: true } });
    const ids = Array.isArray(body.companyIds) ? body.companyIds.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
    if (ids.length) await prisma.inspectionCompany.updateMany({ where: { id: { in: ids } }, data: { accountManagerId: m.id } });
    await sendManagerAddedEmail(m).catch(() => undefined);
    return NextResponse.json({ ok: true, id: m.id });
  }

  if (role === "inspector") {
    const companyId = str(body.companyId, 60);
    const company = companyId ? await prisma.inspectionCompany.findUnique({ where: { id: companyId }, select: { id: true, name: true } }) : null;
    if (!company) return NextResponse.json({ error: "Choose the inspection company this inspector works for." }, { status: 400 });
    const i = await prisma.inspector.create({
      data: { name, email, phone, passwordHash: hashPassword(password), companyId: company.id, approvalStatus: "approved" },
      select: { id: true, name: true, email: true },
    });
    await sendInspectorAddedEmail({ name: i.name, email: i.email, companyName: company.name }).catch(() => undefined);
    return NextResponse.json({ ok: true, id: i.id });
  }

  // company
  const pocName = str(body.pocName);
  const pocMobile = normaliseUaeMobile(str(body.pocMobile, 30));
  const pocEmail = normaliseEmail(str(body.pocEmail, 200));
  if (!pocName || !pocMobile || !pocEmail) {
    return NextResponse.json({ error: "Enter the contact person's name, UAE mobile and email (they get the job alerts)." }, { status: 400 });
  }
  const c = await prisma.inspectionCompany.create({
    data: {
      name, email, phone, passwordHash: hashPassword(password),
      pocName, pocMobile, pocEmail,
      city: str(body.city) || null, emirate: str(body.emirate) || null,
      approvalStatus: "approved",
      verifiedAt: new Date(), verifiedByName: who.name, verifiedByEmail: who.email, verifiedByRole: "super_admin",
    },
  });
  await logCompanyActivity(c.id, "registered", { name: who.name, email: who.email, role: "admin" }, "Created by Admin in User Management");
  await logCompanyActivity(c.id, "approved", { name: who.name, email: who.email, role: "admin" }, "Approved on creation");
  await sendCompanyWelcomeEmail(c).catch(() => undefined);
  return NextResponse.json({ ok: true, id: c.id });
}
