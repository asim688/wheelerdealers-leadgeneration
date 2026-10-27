import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, getAdminEmail, createCompanyUploadToken } from "@/lib/auth";
import { sendEmail, getBaseUrl } from "@/lib/inspection";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/company/register
 * ---------------------------------------------------------------------------
 * Inspection company self-registration (multi-tenant "parent" account).
 * Collects company details, location, and the Point of Contact the platform
 * calls/WhatsApps when a job goes live. Account starts as approvalStatus
 * "pending" until Super Admin approves it.
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const phone = (body.phone ?? "").trim();
  const pocName = (body.pocName ?? "").trim();
  const pocMobile = (body.pocMobile ?? "").trim();
  const pocEmail = (body.pocEmail ?? "").trim().toLowerCase();
  const areas = (Array.isArray(body.areas) ? body.areas.join(", ") : (body.areas ?? "")).trim();

  const missing: string[] = [];
  if (!name) missing.push("company name");
  if (!email) missing.push("email");
  if (!phone) missing.push("mobile number");
  if (!pocName) missing.push("point of contact name");
  if (!pocMobile) missing.push("point of contact mobile");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
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

  const company = await prisma.inspectionCompany.create({
    data: {
      name,
      details: (body.details ?? "").trim() || null,
      email,
      passwordHash: hashPassword(password),
      phone,
      address: (body.address ?? "").trim() || null,
      city: (body.city ?? "").trim() || null,
      emirate: (body.emirate ?? "").trim() || null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      pocName,
      pocMobile,
      pocEmail: pocEmail || null,
      tradeLicense: (body.tradeLicense ?? "").trim() || null,
      areas: areas || null,
      services: (body.services ?? "").trim() || null,
      bankAccountTitle: (body.bankAccountTitle ?? "").trim() || null,
      bankAccountNumber: (body.bankAccountNumber ?? "").trim() || null,
      bankIban: (body.bankIban ?? "").trim() || null,
      bankName: (body.bankName ?? "").trim() || null,
      bankBranch: (body.bankBranch ?? "").trim() || null,
      approvalStatus: "pending",
    },
  });

  // Notify Super Admin that a new company applied.
  await sendEmail(
    getAdminEmail(),
    `New inspection company application — ${company.name}`,
    `<p>A new inspection company applied to join the marketplace:</p>
<ul>
  <li><b>Company:</b> ${company.name}</li>
  <li><b>Email:</b> ${company.email}</li>
  <li><b>Phone:</b> ${company.phone}</li>
  <li><b>PoC:</b> ${company.pocName} (${company.pocMobile})</li>
  <li><b>Trade license:</b> ${company.tradeLicense ?? "—"}</li>
  <li><b>Areas:</b> ${company.areas ?? "—"}</li>
</ul>
<p>Review it in the admin panel: ${getBaseUrl()}/admin</p>`,
  );

  return NextResponse.json({
    ok: true,
    uploadToken: createCompanyUploadToken(company.id),
    message:
      "Application received. The Wheeler Dealers team will review your details and activate your account — you'll be notified once approved.",
  });
}
