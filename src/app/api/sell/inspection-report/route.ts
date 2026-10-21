import { NextRequest, NextResponse } from "next/server";
import { analyzeInspectionReport } from "@/lib/gemini";
import { rateLimitRequest } from "@/lib/rateLimit";
import type { InspectionAnalysis } from "@/lib/types";

// Gemini + file handling require the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Analysing a PDF with Gemini (plus transient-error retries) can take a while,
// so raise the serverless function timeout above Vercel's short default.
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

/**
 * POST /api/sell/inspection-report  (multipart/form-data, field: "file")
 * ---------------------------------------------------------------------------
 * Accepts an uploaded vehicle inspection report (PDF), analyses it with Gemini
 * and returns structured condition signals. The Sell flow feeds the result
 * into the valuation so the estimate reflects the real inspected condition.
 */
export async function POST(req: NextRequest) {
  // AI calls are expensive — keep this endpoint tightly rate limited.
  const rl = rateLimitRequest(req, "sell-report", 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Please upload the inspection report as a PDF." },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be a non-empty PDF under 12 MB." },
      { status: 413 },
    );
  }

  let analysis: InspectionAnalysis;
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    analysis = await analyzeInspectionReport(base64, "application/pdf");
  } catch (err) {
    console.error("Inspection report analysis failed:", err);
    return NextResponse.json(
      { error: "Couldn't read that report. Please try another file or continue without it." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, analysis });
}
