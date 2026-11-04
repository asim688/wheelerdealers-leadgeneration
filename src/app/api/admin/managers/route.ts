import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, isAdmin } from "@/lib/auth";
import { normaliseEmail, normaliseUaeMobile } from "@/lib/contactValidation";
import { sendManagerAddedEmail } from "@/lib/companyCompliance";

export const runtime = "nodejs";

/** GET /api/admin/managers — Account Managers with their assigned companies and pending reviews. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const [managers, companies] = await Promise.all([
    prisma.accountManager.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        companies: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.inspectionCompany.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, accountManagerId: true } }),
  ]);
  const pending = await Promise.all(
    managers.map((m) =>
      prisma.inspectionJob.count({
        where: {
          status: "report_submitted",
          OR: [
            { acceptedByCompany: { accountManagerId: m.id } },
            { acceptedByCompanyId: null, inspector: { company: { accountManagerId: m.id } } },
          ],
        },
      }),
    ),
  );
  return NextResponse.json({
    managers: managers.map((m, i) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      active: m.active,
      verified: !!(m.emailVerifiedAt && m.phoneVerifiedAt),
      createdAt: m.createdAt.toISOString(),
      companies: m.companies,
      awaitingReview: pending[i],
    })),
    companies,
  });
}

/** POST /api/admin/managers — create an Account Manager { name, email, phone, password, companyIds? }. */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { name?: string; email?: string; phone?: string; password?: string; companyIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 120);
  const email = normaliseEmail(body.email);
  const phone = normaliseUaeMobile(body.phone);
  const password = body.password ?? "";
  if (!name || !email || !phone || password.length < 6) {
    return NextResponse.json(
      { error: "Name, a valid email, a UAE mobile number and a password (6+ characters) are required." },
      { status: 400 },
    );
  }
  if (await prisma.accountManager.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "An account manager with this email already exists." }, { status: 409 });
  }
  const manager = await prisma.accountManager.create({
    data: { name, email, phone, passwordHash: hashPassword(password) },
    select: { id: true, name: true, email: true },
  });
  const ids = Array.isArray(body.companyIds) ? body.companyIds.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (ids.length) {
    await prisma.inspectionCompany.updateMany({ where: { id: { in: ids } }, data: { accountManagerId: manager.id } });
  }
  await sendManagerAddedEmail(manager);
  return NextResponse.json({ ok: true, manager });
}
