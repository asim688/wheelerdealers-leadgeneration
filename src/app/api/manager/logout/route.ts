import { NextResponse } from "next/server";
import { MANAGER_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/manager/logout — clears the Account Manager session. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, "", sessionCookieOptions(0));
  return res;
}
