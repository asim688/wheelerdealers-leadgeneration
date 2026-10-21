import { NextResponse } from "next/server";
import { COMPANY_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/company/logout — clears the company session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COMPANY_COOKIE, "", sessionCookieOptions(0));
  return res;
}
