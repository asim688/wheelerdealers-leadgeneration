import { NextRequest, NextResponse } from "next/server";
import { runInspectionBookingTurn } from "@/lib/gemini";
import { rateLimitRequest } from "@/lib/rateLimit";
import type { ChatMessage } from "@/lib/types";

// The Gemini SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Give the AI turn headroom over Vercel's default function timeout.
export const maxDuration = 30;

/**
 * POST /api/inspection/chat
 * ---------------------------------------------------------------------------
 * Runs one turn of the conversational inspection-booking assistant. The client
 * sends the full message history and receives the assistant's reply plus the
 * structured booking details extracted so far.
 *
 * Failure modes are reported separately so the UI can react appropriately:
 *  - `aiBusy`        — upstream rate limit / quota (transient). Ask the customer
 *                      to retry in a moment; keep the conversation intact.
 *  - `aiUnavailable` — no key or a hard error. Fall back to the manual form.
 */

/** Detects transient upstream rate-limit / quota errors from the Gemini API. */
function parseBusyError(err: unknown): { busy: boolean; retryAfter: number } {
  const e = err as { status?: number; message?: string } | null;
  const status = e?.status;
  const message = typeof e?.message === "string" ? e.message : "";

  const busy =
    status === 429 ||
    /RESOURCE_EXHAUSTED|exceeded your current quota|rate limit/i.test(message);

  // Gemini reports "Please retry in 58.29s" / "retryDelay":"58s" — honour it.
  const match = message.match(/retry(?:Delay)?[":\s]+in\s*([\d.]+)s|"retryDelay"\s*:\s*"(\d+)s/i);
  const seconds = Number(match?.[1] ?? match?.[2] ?? 0);
  const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;

  return { busy, retryAfter };
}

export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "inspection-chat", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  // No AI configured — tell the client to use the manual form instead.
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      aiUnavailable: true,
      reply:
        "The AI booking assistant isn't available right now. Let's use the quick form instead.",
    });
  }

  try {
    const ai = await runInspectionBookingTurn(messages);
    return NextResponse.json({
      aiUnavailable: false,
      reply:
        ai.reply ||
        "Could you tell me a little more so I can book your inspection?",
      readyToBook: ai.readyToBook,
      booking: {
        customerName: ai.customerName,
        customerMobile: ai.customerMobile,
        customerEmail: ai.customerEmail,
        vin: ai.vin,
        make: ai.make,
        model: ai.model,
        year: ai.year,
        notes: ai.notes,
        address: ai.address,
        city: ai.city,
        emirate: ai.emirate,
        date: ai.date,
        slot: ai.slot,
      },
    });
  } catch (err) {
    const { busy, retryAfter } = parseBusyError(err);

    if (busy) {
      // Transient: the assistant is simply over its request quota. Keep the
      // conversation alive and invite a retry instead of dumping to the form.
      console.warn("Inspection booking AI busy (rate limited):", retryAfter, "s");
      return NextResponse.json({
        aiUnavailable: false,
        aiBusy: true,
        retryAfter,
        reply:
          "Our assistant is handling a lot of requests right now. Please give it a moment and send your last message again — or switch to the quick form if you'd rather not wait.",
      });
    }

    console.error("Inspection booking AI error:", err);
    // Hard failure — signal a graceful fallback to the manual form.
    return NextResponse.json({
      aiUnavailable: true,
      reply:
        "I'm having trouble with the assistant right now. Let's finish your booking with the quick form.",
    });
  }
}
