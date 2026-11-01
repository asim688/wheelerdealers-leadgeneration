import { NextRequest, NextResponse } from "next/server";
import { createVerificationProof } from "@/lib/auth";
import { verifyFirebaseIdToken } from "@/lib/firebaseToken";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/verify/firebase — body { idToken }.
 * Mobile verification through Firebase Phone Auth (same provider as customer
 * booking): the browser sent and checked the SMS code with Firebase; here we
 * verify the fresh ID token (UAE numbers only) and return the same signed
 * proof as /api/verify/check, so forms and APIs treat both paths alike.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "verify-firebase", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let user;
  try {
    user = await verifyFirebaseIdToken(body.idToken ?? "");
  } catch (err) {
    console.error("Firebase token check unavailable:", err);
    return NextResponse.json(
      { error: "We couldn't verify the code right now. Please try again in a moment." },
      { status: 503 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "Verification failed or expired. Please request a new code." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, target: user.phone, proof: createVerificationProof("sms", user.phone) });
}
