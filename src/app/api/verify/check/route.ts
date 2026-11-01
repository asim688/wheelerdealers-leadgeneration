import { NextRequest, NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/rateLimit";
import { checkVerificationCode } from "@/lib/verification";
import type { VerifyChannel } from "@/lib/contactValidation";

export const runtime = "nodejs";

/**
 * POST /api/verify/check — body { channel, target, code }.
 * Returns a signed proof token on success; forms submit it with the value and
 * the server re-validates it before creating or updating the account.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "verify-check", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { channel?: string; target?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.channel !== "email" && body.channel !== "sms") {
    return NextResponse.json({ error: "Invalid verification channel." }, { status: 400 });
  }

  try {
    const out = await checkVerificationCode(body.channel as VerifyChannel, body.target ?? "", body.code ?? "");
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json({ ok: true, target: out.target, proof: out.proof });
  } catch (err) {
    console.error("verify/check failed:", err);
    return NextResponse.json({ error: "Service is waking up. Please try again in a few seconds." }, { status: 503 });
  }
}
