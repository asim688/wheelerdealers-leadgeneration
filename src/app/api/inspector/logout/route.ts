import { NextResponse } from "next/server";
import { INSPECTOR_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/inspector/logout — clears the inspector session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(INSPECTOR_COOKIE, "", sessionCookieOptions(0));
  return res;
}
