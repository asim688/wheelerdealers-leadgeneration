import { NextRequest, NextResponse } from "next/server";
import { extractMulkiya } from "@/lib/gemini";
import { rateLimitRequest } from "@/lib/rateLimit";
import type { VinDecodeResult } from "@/lib/types";

// Gemini vision + file handling require the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Reading an image with Gemini (plus transient-error retries) can take a while.
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * POST /api/sell/mulkiya  (multipart/form-data, field: "file")
 * ---------------------------------------------------------------------------
 * Accepts a photo of the back of a UAE vehicle registration card (Mulkiya),
 * reads it with Gemini vision and returns the vehicle make / model / year /
 * chassis number for the customer to confirm. Replaces the VIN-decode step in
 * the Sell flow. The response reuses the VinDecodeResult shape so the client's
 * confirm/manual handling stays the same.
 */
export async function POST(req: NextRequest) {
  // AI vision calls are expensive — keep this endpoint rate limited.
  const rl = rateLimitRequest(req, "sell-mulkiya", 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { decoded: false, message: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { decoded: false, message: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ decoded: false, message: "No image uploaded." }, { status: 400 });
  }
  if (!OK_TYPES.includes(file.type)) {
    return NextResponse.json(
      { decoded: false, message: "Please upload the Mulkiya as a photo (JPG or PNG)." },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { decoded: false, message: "Image must be a non-empty photo under 12 MB." },
      { status: 413 },
    );
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const m = await extractMulkiya(base64, file.type);

    if (!m.readable || !m.make) {
      const result: VinDecodeResult = {
        vin: m.vin || "",
        decoded: false,
        make: "",
        model: "",
        bodyClass: "",
        message:
          m.message ||
          "I couldn't read that card. Please make sure the back of the Mulkiya is clear and well lit.",
      };
      return NextResponse.json(result);
    }

    const result: VinDecodeResult = {
      vin: m.vin || "",
      decoded: true,
      make: m.make,
      model: m.model || "",
      year: m.year,
      bodyClass: m.bodyClass || "",
      color: m.color,
      engineNo: m.engineNo,
      // make + year read but the model line wasn't legible -> ask to confirm it.
      partial: !m.model,
      source: "mulkiya",
      message: "",
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Mulkiya extraction failed:", err);
    return NextResponse.json(
      {
        decoded: false,
        message: "Couldn't read that card. Please try another photo or enter details manually.",
      },
      { status: 502 },
    );
  }
}
