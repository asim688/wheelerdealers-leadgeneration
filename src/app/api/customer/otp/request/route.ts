import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/inspection";
import { rateLimit, rateLimitRequest } from "@/lib/rateLimit";
import { normaliseMobile } from "@/lib/phone";
import { UAE_MOBILE_RE, sendOtpSms, shouldUseMessageCentral } from "@/lib/messagecentral";

export const runtime = "nodejs";

/** Retries once after a short pause; covers Neon waking from idle. */
async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

/**
 * POST /api/customer/otp/request — body { mobile }.
 * When Message Central is active the OTP is sent by SMS to UAE numbers only and
 * Message Central owns the code (we store its verificationId). Otherwise it
 * falls back to the old behaviour: logged to the console / dev code, or Twilio.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "customer-otp", 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { mobile?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const mobile = normaliseMobile(body.mobile ?? "");
  if (!mobile) {
    return NextResponse.json(
      { error: "Please enter a valid mobile number (e.g. 05x xxx xxxx)." },
      { status: 400 },
    );
  }

  if (shouldUseMessageCentral()) {
    if (!UAE_MOBILE_RE.test(mobile)) {
      return NextResponse.json(
        { error: "We currently support UAE mobile numbers only (e.g. 05x xxx xxxx)." },
        { status: 400 },
      );
    }

    // Every SMS costs money: cool down per number and cap requests per day.
    // The DB is touched BEFORE sending so we never pay for an SMS we can't track.
    // One retry covers a Neon cold start.
    let recent: { id: string } | null;
    try {
      recent = await withDbRetry(() =>
        prisma.otpCode.findFirst({
          where: { mobile, createdAt: { gt: new Date(Date.now() - 30_000) } },
          select: { id: true },
        }),
      );
    } catch (err) {
      console.error("OTP request: database unavailable:", err);
      return NextResponse.json(
        { error: "Service is waking up. Please try again in a few seconds." },
        { status: 503 },
      );
    }
    if (recent) {
      return NextResponse.json(
        { error: "A code was just sent. Please wait 30 seconds before requesting another." },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    }
    if (!rateLimit(`otp-daily:${mobile}`, 6, 24 * 60 * 60_000).ok) {
      return NextResponse.json(
        { error: "Too many codes requested for this number today. Please try again tomorrow." },
        { status: 429 },
      );
    }

    // Reserve the row first (replaces any older code), then send, then record the id.
    const row = await prisma.otpCode
      .deleteMany({ where: { mobile } })
      .then(() =>
        prisma.otpCode.create({
          data: { mobile, codeHash: "mc:pending", expiresAt: new Date(Date.now() + 5 * 60_000) },
        }),
      )
      .catch((err) => {
        console.error("OTP request: could not reserve code row:", err);
        return null;
      });
    if (!row) {
      return NextResponse.json(
        { error: "Service is waking up. Please try again in a few seconds." },
        { status: 503 },
      );
    }

    const sent = await sendOtpSms(mobile);
    if (!sent.ok) {
      await prisma.otpCode.delete({ where: { id: row.id } }).catch(() => {});
      return NextResponse.json(
        {
          error:
            sent.reason === "no_credit"
              ? "SMS verification is temporarily unavailable. Please try again later."
              : "We couldn't send the SMS right now. Please check the number and try again.",
        },
        { status: sent.reason === "no_credit" ? 503 : 502 },
      );
    }

    // codeHash holds "mc:<verificationId>"; the verify route validates remotely.
    await withDbRetry(() =>
      prisma.otpCode.update({ where: { id: row.id }, data: { codeHash: `mc:${sent.verificationId}` } }),
    ).catch((err) => console.error("OTP request: SMS sent but id not saved:", err));
    return NextResponse.json({ ok: true, message: "Verification code sent to your mobile." });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(8).toString("hex");
  const codeHash = `${salt}:${crypto.scryptSync(code, salt, 32).toString("hex")}`;

  // One active code per mobile: replace previous ones.
  await prisma.otpCode.deleteMany({ where: { mobile } });
  await prisma.otpCode.create({
    data: { mobile, codeHash, expiresAt: new Date(Date.now() + 5 * 60_000) },
  });

  const sent = await sendSms(mobile, `Your Wheeler Dealers verification code is ${code}. Valid for 5 minutes.`);
  if (!sent) {
    // No SMS provider configured — dev fallback so testing can proceed.
    console.log(`[otp] Code for ${mobile}: ${code}`);
  }

  return NextResponse.json({
    ok: true,
    message: "Verification code sent to your mobile.",
    // Expose the code in non-production so the flow is testable without SMS keys.
    ...(process.env.NODE_ENV !== "production" && !sent ? { devCode: code } : {}),
  });
}
