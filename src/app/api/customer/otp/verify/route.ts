import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createCustomerToken,
  CUSTOMER_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import { normaliseMobile } from "@/lib/phone";
import { validateOtpSms } from "@/lib/messagecentral";

export const runtime = "nodejs";

/**
 * POST /api/customer/otp/verify — body { mobile, code, name?, email? }.
 * Verifies the OTP, creates/updates the customer account and sets the
 * customer session cookie.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "customer-otp-verify", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { mobile?: string; code?: string; name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const mobile = normaliseMobile(body.mobile ?? "");
  const code = (body.code ?? "").trim();
  if (!mobile || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code we sent you." }, { status: 400 });
  }

  const otp = await prisma.otpCode.findFirst({
    where: { mobile, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= 5) {
    return NextResponse.json(
      { error: "Code expired or too many attempts — request a new code." },
      { status: 400 },
    );
  }

  if (otp.codeHash.startsWith("mc:")) {
    // Message Central owns this code: validate remotely.
    const result = await validateOtpSms(otp.codeHash.slice(3), code);
    if (result === "error") {
      return NextResponse.json(
        { error: "We couldn't verify the code right now. Please try again in a moment." },
        { status: 503 },
      );
    }
    if (result === "expired" || result === "locked") {
      await prisma.otpCode.deleteMany({ where: { mobile } });
      return NextResponse.json(
        { error: "Code expired or too many attempts — request a new code." },
        { status: 400 },
      );
    }
    if (result === "wrong") {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }
  } else {
    const [salt, hash] = otp.codeHash.split(":");
    const test = crypto.scryptSync(code, salt, 32).toString("hex");
    const match =
      hash.length === test.length &&
      crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
    if (!match) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }
  }

  // Verified: burn the code and upsert the customer.
  await prisma.otpCode.deleteMany({ where: { mobile } });
  const customer = await prisma.customer.upsert({
    where: { mobile },
    create: {
      mobile,
      name: (body.name ?? "").trim() || null,
      email: (body.email ?? "").trim().toLowerCase() || null,
      lastLogin: new Date(),
    },
    update: {
      lastLogin: new Date(),
      ...((body.name ?? "").trim() ? { name: body.name!.trim() } : {}),
      ...((body.email ?? "").trim() ? { email: body.email!.trim().toLowerCase() } : {}),
    },
  });

  const res = NextResponse.json({
    ok: true,
    customer: { id: customer.id, mobile: customer.mobile, name: customer.name, email: customer.email },
  });
  res.cookies.set(
    CUSTOMER_COOKIE,
    createCustomerToken(customer.id),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}
