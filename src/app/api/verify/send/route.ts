import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimitRequest } from "@/lib/rateLimit";
import { sendVerificationCode } from "@/lib/verification";
import type { VerifyChannel } from "@/lib/contactValidation";

export const runtime = "nodejs";

/**
 * POST /api/verify/send — body { channel: "email" | "sms", target }.
 * Sends a 6-digit code to the email address or UAE mobile. Used by company
 * registration, the inspector first sign-in and customer booking.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "verify-send", 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { channel?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.channel !== "email" && body.channel !== "sms") {
    return NextResponse.json({ error: "Invalid verification channel." }, { status: 400 });
  }

  try {
    const out = await sendVerificationCode(body.channel as VerifyChannel, body.target ?? "", clientIp(req));
    if (!out.ok) {
      return NextResponse.json(
        { error: out.error },
        { status: out.status, ...(out.retryAfter ? { headers: { "Retry-After": String(out.retryAfter) } } : {}) },
      );
    }
    return NextResponse.json({
      ok: true,
      target: out.target,
      resendInSec: out.resendInSec,
      ...(out.devCode ? { devCode: out.devCode } : {}),
    });
  } catch (err) {
    console.error("verify/send failed:", err);
    return NextResponse.json({ error: "Service is waking up. Please try again in a few seconds." }, { status: 503 });
  }
}
