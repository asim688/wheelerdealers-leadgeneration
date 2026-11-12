import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, getAdminEmail, createCompanyUploadToken, readVerificationProofs } from "@/lib/auth";
import { sendEmail, getBaseUrl } from "@/lib/inspection";
import { rateLimitRequest, clientIp } from "@/lib/rateLimit";
import { logCompanyActivity } from "@/lib/adminCompany";
import {
  normaliseEmail,
  normaliseIban,
  normaliseUaeMobile,
  verificationKey,
} from "@/lib/contactValidation";
import { sendApplicationReceivedEmail } from "@/lib/companyCompliance";
import { esc } from "@/lib/emailTemplates";

export const runtime = "nodejs";

/**
 * POST /api/company/register
 * ---------------------------------------------------------------------------
 * Inspection company self-registration (multi-tenant "parent" account).
 * Collects company details, location, the Point of Contact the platform
 * calls/WhatsApps when a job goes live, and payout (bank) details.
 *
 * Company email + mobile and PoC email + mobile must each carry a proof from
 * /api/verify/check (body.proofs) — no unverified account is ever created.
 * Documents (trade licence, VAT certificate, Bank IBAN Letter) follow via
 * /api/company/register/documents with the returned upload token. The account
 * starts as approvalStatus "pending" until Super Admin approves it.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "company-register", 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: {
    name?: string;
    details?: string;
    email?: string;
    password?: string;
    phone?: string;
    address?: string;
    city?: string;
    emirate?: string;
    lat?: number;
    lng?: number;
    pocName?: string;
    pocMobile?: string;
    pocEmail?: string;
    tradeLicense?: string;
    areas?: string | string[];
    services?: string;
    bankAccountTitle?: string;
    bankAccountNumber?: string;
    bankIban?: string;
    bankName?: string;
    bankBranch?: string;
    proofs?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(body.name);
  const rawEmail = str(body.email, 254);
  const email = normaliseEmail(rawEmail);
  const password = body.password ?? "";
  const phone = normaliseUaeMobile(str(body.phone, 30));
  const pocName = str(body.pocName);
  const pocMobile = normaliseUaeMobile(str(body.pocMobile, 30));
  const pocEmail = normaliseEmail(str(body.pocEmail, 254));
  const areas = (Array.isArray(body.areas) ? body.areas.join(", ") : (body.areas ?? "")).trim().slice(0, 300);
  const bank = {
    bankAccountTitle: str(body.bankAccountTitle),
    bankAccountNumber: str(body.bankAccountNumber, 40).replace(/\s+/g, ""),
    bankIban: normaliseIban(str(body.bankIban, 40)),
    bankName: str(body.bankName),
    bankBranch: str(body.bankBranch),
  };

  const missing: string[] = [];
  if (!name) missing.push("company name");
  if (!rawEmail) missing.push("company email");
  if (!str(body.phone)) missing.push("company mobile");
  if (!pocName) missing.push("point of contact name");
  if (!str(body.pocMobile)) missing.push("point of contact mobile");
  if (!str(body.pocEmail)) missing.push("point of contact email");
  if (!bank.bankAccountTitle) missing.push("bank account title");
  if (!bank.bankAccountNumber) missing.push("bank account number");
  if (!str(body.bankIban)) missing.push("IBAN");
  if (!bank.bankName) missing.push("bank name");
  if (!bank.bankBranch) missing.push("bank branch");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const invalid: string[] = [];
  if (!email) invalid.push("company email");
  if (!phone) invalid.push("company mobile (UAE number, e.g. 05X XXX XXXX)");
  if (!pocEmail) invalid.push("point of contact email");
  if (!pocMobile) invalid.push("point of contact mobile (UAE number)");
  if (!bank.bankIban) invalid.push("IBAN (UAE IBAN: AE + 21 digits)");
  if (!/^\d{6,24}$/.test(bank.bankAccountNumber)) invalid.push("bank account number (digits only)");
  if (invalid.length > 0 || !email || !phone || !pocEmail || !pocMobile || !bank.bankIban) {
    return NextResponse.json({ error: `Please check: ${invalid.join(", ")}.` }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  // Every contact must be verified by its owner (one proof covers a value used twice).
  const proven = readVerificationProofs(body.proofs);
  const unverified: string[] = [];
  if (!proven.has(verificationKey("email", email))) unverified.push("company email");
  if (!proven.has(verificationKey("sms", phone))) unverified.push("company mobile");
  if (!proven.has(verificationKey("email", pocEmail))) unverified.push("point of contact email");
  if (!proven.has(verificationKey("sms", pocMobile))) unverified.push("point of contact mobile");
  if (unverified.length > 0) {
    return NextResponse.json(
      { error: `Please verify: ${unverified.join(", ")}. Use "Send code" next to each field.`, unverified },
      { status: 400 },
    );
  }

  const existing = await prisma.inspectionCompany.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A company with this email is already registered." },
      { status: 409 },
    );
  }

  const now = new Date();
  const company = await prisma.inspectionCompany.create({
    data: {
      name,
      details: str(body.details, 500) || null,
      email,
      passwordHash: hashPassword(password),
      phone,
      address: str(body.address, 200) || null,
      city: str(body.city) || null,
      emirate: str(body.emirate) || null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      pocName,
      pocMobile,
      pocEmail,
      tradeLicense: str(body.tradeLicense, 60) || null,
      areas: areas || null,
      services: str(body.services, 300) || null,
      ...bank,
      emailVerifiedAt: now,
      phoneVerifiedAt: now,
      pocEmailVerifiedAt: now,
      pocMobileVerifiedAt: now,
      approvalStatus: "pending",
    },
  });

  await logCompanyActivity(company.id, "registered", {
    name: pocName,
    email,
    role: "company",
    ip: clientIp(req),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  }).catch(() => undefined);

  // Notify Super Admin, and confirm receipt to the company (+ PoC).
  await Promise.allSettled([
    sendEmail(
      getAdminEmail(),
      `New inspection company application — ${company.name}`,
      `<p>A new inspection company applied to join the marketplace (email and mobiles verified):</p>
<ul>
  <li><b>Company:</b> ${esc(company.name)}</li>
  <li><b>Email:</b> ${esc(company.email)} ✓</li>
  <li><b>Mobile:</b> ${esc(company.phone)} ✓</li>
  <li><b>PoC:</b> ${esc(company.pocName)} — ${esc(company.pocMobile)} ✓, ${esc(company.pocEmail)} ✓</li>
  <li><b>Trade license:</b> ${esc(company.tradeLicense ?? "—")}</li>
  <li><b>Areas:</b> ${esc(company.areas ?? "—")}</li>
</ul>
<p>Review it in the admin panel: ${getBaseUrl()}/admin</p>`,
    ),
    sendApplicationReceivedEmail(company),
  ]);

  return NextResponse.json({
    ok: true,
    uploadToken: createCompanyUploadToken(company.id),
    message:
      "Application received. The Wheeler Dealers team will review your details and activate your account — you'll be notified once approved.",
  });
}
