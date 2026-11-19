import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReviewer } from "@/lib/review";
import { getActiveAgreement, setCommission } from "@/lib/ledger";
import { describeSetting, type CommissionType } from "@/lib/commission";

export const runtime = "nodejs";

/** The company is visible to Admin always, to an Account Manager only if it is assigned to them. */
async function authorize(req: NextRequest, companyId: string) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const company = await prisma.inspectionCompany.findUnique({ where: { id: companyId }, select: { id: true, name: true, accountManagerId: true } });
  if (!company || (reviewer.type === "manager" && company.accountManagerId !== reviewer.id)) {
    return { error: NextResponse.json({ error: "Company not found." }, { status: 404 }) };
  }
  return { reviewer, company };
}

/** GET /api/commission/[companyId] — current commission + full change history. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const a = await authorize(req, companyId);
  if ("error" in a) return a.error;
  const [current, rows] = await Promise.all([
    getActiveAgreement(companyId),
    prisma.commissionAgreement.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    company: { id: a.company.id, name: a.company.name },
    current: current ? { type: current.type, value: current.value, label: describeSetting(current.type, current.value) } : null,
    history: rows.map((r) => ({
      id: r.id, type: r.type, value: r.value, label: describeSetting(r.type, r.value),
      previousLabel: r.previousType ? describeSetting(r.previousType, r.previousValue) : null,
      note: r.note, by: r.createdByName, role: r.createdByRole, at: r.createdAt.toISOString(), active: r.status === "active",
    })),
  });
}

/** POST /api/commission/[companyId] — { type: "percentage"|"fixed", amount: number (percent, or AED), note? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const a = await authorize(req, companyId);
  if ("error" in a) return a.error;
  let body: { type?: string; amount?: number | string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const type = body.type as CommissionType;
  const amount = Number(body.amount);
  if ((type !== "percentage" && type !== "fixed") || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Choose Percentage or Fixed AED and enter a valid amount." }, { status: 400 });
  }
  if (type === "percentage" && amount > 100) return NextResponse.json({ error: "Percentage cannot be more than 100." }, { status: 400 });
  if (amount === 0) return NextResponse.json({ error: "Commission must be greater than zero." }, { status: 400 });

  const result = await setCommission({
    companyId,
    setting: { type, value: Math.round(amount * 100) }, // % → basis points, AED → fils
    note: body.note,
    actor: { name: a.reviewer.name, role: a.reviewer.type === "admin" ? "admin" : "account_manager", id: a.reviewer.id },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
