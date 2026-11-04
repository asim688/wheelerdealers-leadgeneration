import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId, readVerificationProofs } from "@/lib/auth";
import { normaliseEmail, verificationKey } from "@/lib/contactValidation";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/customer/email — body { email, proofs, name? }.
 * Saves the signed-in customer's email once it has been verified by code.
 * Verified once per account; changing it later needs a new verification.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "customer-email", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  }
  const customerId = getCustomerId(req);
  if (!customerId) {
    return NextResponse.json({ error: "Please sign in with your mobile number first.", loginRequired: true }, { status: 401 });
  }

  let body: { email?: string; proofs?: unknown; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = normaliseEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!readVerificationProofs(body.proofs).has(verificationKey("email", email))) {
    return NextResponse.json({ error: "Please verify your email with the 6-digit code first." }, { status: 400 });
  }

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      email,
      emailVerifiedAt: new Date(),
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}),
    },
    select: { id: true, mobile: true, name: true, email: true, emailVerifiedAt: true },
  });
  return NextResponse.json({ ok: true, customer });
}
