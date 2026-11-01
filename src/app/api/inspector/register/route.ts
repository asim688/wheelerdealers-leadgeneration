import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/inspector/register — retired.
 * Inspection companies now register (with email + mobile verification, bank
 * details and documents) at /company; inspectors are added by their company.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Company registration has moved. Please register your company at /company.", moved: "/company?register=1" },
    { status: 410 },
  );
}
