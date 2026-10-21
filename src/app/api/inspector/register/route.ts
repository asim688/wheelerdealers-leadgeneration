import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/inspection";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/inspector/register
 * ---------------------------------------------------------------------------
 * Inspection-company marketplace application. Creates the company account in
 * "pending" approval status — the company cannot sign in or receive jobs
 * until an admin approves it in the dashboard.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "inspector-register", 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: {
    companyName?: string;
    tradeLicense?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    password?: string;
    areas?: string | string[];
    services?: string;
    bankName?: string;
    bankIban?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const companyName = (body.companyName ?? "").trim();
  const tradeLicense = (body.tradeLicense ?? "").trim();
  const contactPerson = (body.contactPerson ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const areas = (Array.isArray(body.areas) ? body.areas.join(", ") : (body.areas ?? "")).trim();
  const services = (body.services ?? "").trim();
  const bankName = (body.bankName ?? "").trim() || null;
  const bankIban = (body.bankIban ?? "").trim() || null;

  const missing: string[] = [];
  if (!companyName) missing.push("company name");
  if (!tradeLicense) missing.push("trade license");
  if (!contactPerson) missing.push("contact person");
  if (!phone) missing.push("mobile number");
  if (!email || !EMAIL_RE.test(email)) missing.push("valid email");
  if (password.length < 6) missing.push("password (6+ characters)");
  if (!areas) missing.push("areas covered");
  if (missing.length) {
    return NextResponse.json(
      { error: `Please provide: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const exists = await prisma.inspector.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    return NextResponse.json(
      { error: "A company with that email is already registered." },
      { status: 409 },
    );
  }

  await prisma.inspector.create({
    data: {
      name: companyName,
      email,
      phone,
      passwordHash: hashPassword(password),
      active: true,
      approvalStatus: "pending",
      contactPerson,
      tradeLicense,
      areas,
      services: services || null,
      bankName,
      bankIban,
    },
  });

  // Notify admin of the new application (provider-ready stub).
  const adminEmail = process.env.ADMIN_EMAIL || "admin@thewheelerdealers.com";
  await sendEmail(
    adminEmail,
    `New inspection company application — ${companyName}`,
    `<p>A new inspection company applied to join the marketplace.</p>
<ul>
  <li><b>Company:</b> ${companyName}</li>
  <li><b>Contact:</b> ${contactPerson} · ${phone} · ${email}</li>
  <li><b>Trade license:</b> ${tradeLicense}</li>
  <li><b>Areas:</b> ${areas}</li>
</ul>
<p>Review and approve it in the admin dashboard.</p>`,
  );

  return NextResponse.json({
    ok: true,
    message:
      "Application received. The Wheeler Dealers team will review your details and activate your account — you'll be notified by email.",
  });
}
