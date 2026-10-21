import { NextRequest, NextResponse } from "next/server";
import { runBuyTurn } from "@/lib/gemini";
import { matchCars } from "@/lib/matching";
import { prisma } from "@/lib/prisma";
import { rateLimitRequest } from "@/lib/rateLimit";
import type { BuyCriteria, BuyResponse, Car, ChatMessage } from "@/lib/types";

// Prisma requires the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Give the AI turn headroom over Vercel's default function timeout.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Throttle expensive AI calls per IP.
  const rl = rateLimitRequest(req, "buy", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

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

  if (!process.env.GEMINI_API_KEY) {
    const res: BuyResponse = {
      reply:
        "The AI service isn't configured yet. Please add your GEMINI_API_KEY to the .env file and restart the server.",
      stage: "searching",
      matches: [],
      currency,
    };
    return NextResponse.json(res);
  }

  let ai;
  try {
    ai = await runBuyTurn(messages);
  } catch (err) {
    console.error("Gemini error:", err);
    const res: BuyResponse = {
      reply: "Sorry, I had trouble understanding that. Could you describe the car again?",
      stage: "searching",
      matches: [],
      currency,
    };
    return NextResponse.json(res);
  }

  // Not enough information yet — ask the clarifying question the AI produced.
  if (!ai.readyToSearch) {
    const res: BuyResponse = {
      reply: ai.reply || "What kind of car are you after — body style, budget, or fuel type?",
      stage: "searching",
      matches: [],
      currency,
    };
    return NextResponse.json(res);
  }

  const criteria: BuyCriteria = {
    makes: ai.makes,
    bodyTypes: ai.bodyTypes,
    fuelTypes: ai.fuelTypes,
    transmission: ai.transmission,
    minYear: ai.minYear,
    maxYear: ai.maxYear,
    maxPrice: ai.maxPrice,
    minSeats: ai.minSeats,
    keywords: ai.keywords,
  };

  let inventory: Car[] = [];
  try {
    inventory = (await prisma.car.findMany({
      where: { sold: false },
    })) as unknown as Car[];
  } catch (err) {
    console.error("Failed to load inventory:", err);
  }

  const matches = matchCars(inventory, criteria, 4);

  const reply = matches.length
    ? ai.reply || "Here are the best matches from our inventory:"
    : "I couldn't find a close match in our current inventory. Try adjusting your budget or body style, and I'll look again.";

  const res: BuyResponse = {
    reply,
    stage: matches.length ? "results" : "searching",
    matches,
    currency,
  };
  return NextResponse.json(res);
}
