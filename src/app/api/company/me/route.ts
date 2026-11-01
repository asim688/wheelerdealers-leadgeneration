import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { normaliseIban } from "@/lib/contactValidation";
import { payoutGaps } from "@/lib/companyCompliance";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

const PROFILE_SELECT = {
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
  bankAccountTitle: true,
  bankAccountNumber: true,
  bankIban: true,
  bankName: true,
  bankBranch: true,
  documents: { select: { kind: true } },
} as const;

function loadProfile(id: string) {
  return prisma.inspectionCompany.findUnique({ where: { id }, select: PROFILE_SELECT });
}

type ProfileRow = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

function serialize(c: ProfileRow) {
  const { documents, bankAccountTitle, bankAccountNumber, bankIban, bankName, bankBranch, ...rest } = c;
  const kinds = documents.map((d) => d.kind);
  return {
    ...rest,
    bank: { bankAccountTitle, bankAccountNumber, bankIban, bankName, bankBranch },
    hasIbanLetter: kinds.includes("iban_letter"),
    payoutGaps: payoutGaps(c, kinds),
  };
}

/** GET /api/company/me — current company session profile (+ payout completeness). */
export async function GET(req: NextRequest) {
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const company = await loadProfile(companyId);
  if (!company || !company.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ company: serialize(company) });
}

/**
 * PATCH /api/company/me — body { bankAccountTitle, bankAccountNumber, bankIban, bankName, bankBranch }.
 * Lets a company complete MISSING payout details. Once all bank fields are on
 * file they can only be changed by the admin team (protects against payout
 * redirection if a company login is compromised).
 */
export async function PATCH(req: NextRequest) {
  const rl = rateLimitRequest(req, "company-me-patch", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }
  const companyId = getCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const current = await loadProfile(companyId);
  if (!current || !current.active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const bankComplete = [
    current.bankAccountTitle,
    current.bankAccountNumber,
    current.bankIban,
    current.bankName,
    current.bankBranch,
  ].every(Boolean);
  if (bankComplete) {
    return NextResponse.json(
      { error: "Your bank details are already on file. Contact The Wheeler Dealers team to change them." },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const data = {
    bankAccountTitle: str(body.bankAccountTitle),
    bankAccountNumber: str(body.bankAccountNumber, 40).replace(/\s+/g, ""),
    bankIban: normaliseIban(str(body.bankIban, 40)),
    bankName: str(body.bankName),
    bankBranch: str(body.bankBranch),
  };
  const problems: string[] = [];
  if (!data.bankAccountTitle) problems.push("account title");
  if (!/^\d{6,24}$/.test(data.bankAccountNumber)) problems.push("account number (digits only)");
  if (!data.bankIban) problems.push("IBAN (UAE IBAN: AE + 21 digits)");
  if (!data.bankName) problems.push("bank name");
  if (!data.bankBranch) problems.push("bank branch");
  if (problems.length) {
    return NextResponse.json({ error: `Please check: ${problems.join(", ")}.` }, { status: 400 });
  }

  await prisma.inspectionCompany.update({ where: { id: companyId }, data });
  const updated = await loadProfile(companyId);
  return NextResponse.json({ ok: true, company: updated ? serialize(updated) : null });
}
