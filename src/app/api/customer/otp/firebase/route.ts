import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createCustomerToken,
  CUSTOMER_COOKIE,
  sessionCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import { verifyFirebaseIdToken } from "@/lib/firebaseToken";

export const runtime = "nodejs";

/**
 * POST /api/customer/otp/firebase — body { idToken, name?, email? }.
 * The browser has already verified the SMS code with Firebase; here we verify
 * the resulting ID token, then create/update the customer and set the same
 * session cookie as the server-side OTP flow.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "customer-otp-firebase", 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { idToken?: string; name?: string; email?: string };
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
    return NextResponse.json(
      { error: "Verification failed or expired. Please request a new code." },
      { status: 401 },
    );
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const customer = await prisma.customer.upsert({
    where: { mobile: user.phone },
    create: { mobile: user.phone, name: name || null, email: email || null, lastLogin: new Date() },
    update: {
      lastLogin: new Date(),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
  });

  const res = NextResponse.json({
    ok: true,
    customer: { id: customer.id, mobile: customer.mobile, name: customer.name, email: customer.email },
  });
  res.cookies.set(CUSTOMER_COOKIE, createCustomerToken(customer.id), sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
