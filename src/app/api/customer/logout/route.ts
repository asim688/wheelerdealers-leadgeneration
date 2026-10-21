import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/customer/logout — clears the customer session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOMER_COOKIE, "", sessionCookieOptions(0));
  return res;
}
