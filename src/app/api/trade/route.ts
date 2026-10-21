import { NextRequest, NextResponse } from "next/server";
import { runTradeTurn } from "@/lib/gemini";
import { getEstimate } from "@/lib/pricing";
import { matchCars } from "@/lib/matching";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createAuctionForLead } from "@/lib/auctions";
import { rateLimitRequest } from "@/lib/rateLimit";
import type {
  BuyCriteria,
  Car,
  ChatMessage,
  TradeInCar,
  TradeResponse,
  TradeStage,
} from "@/lib/types";

// Prisma requires the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Give the AI turn headroom over Vercel's default function timeout.
export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Throttle expensive AI calls per IP.
  const rl = rateLimitRequest(req, "trade", 20, 60_000);
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

  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    const res: TradeResponse = {
      reply:
        "The AI service isn't configured yet. Please add your GEMINI_API_KEY to the .env file and restart the server.",
      stage: "tradeIn",
      tradeIn: {},
      wants: {},
      matches: [],
      currency,
    };
    return NextResponse.json(res);
  }

  let ai;
  try {
    ai = await runTradeTurn(messages);
  } catch (err) {
    console.error("Gemini error:", err);
    const res: TradeResponse = {
      reply: "Sorry, I had trouble with that. Could you try again?",
      stage: "tradeIn",
      tradeIn: {},
      wants: {},
      matches: [],
      currency,
    };
    return NextResponse.json(res);
  }

  const tradeIn: TradeInCar = {
    make: clean(ai.tradeMake),
    model: clean(ai.tradeModel),
    year: toYear(ai.tradeYear),
    mileage: toMileage(ai.tradeMileage),
    condition: clean(ai.tradeCondition),
  };

  const wants: BuyCriteria = {
    makes: ai.wantMakes,
    bodyTypes: ai.wantBodyTypes,
    fuelTypes: ai.wantFuelTypes,
    transmission: ai.wantTransmission,
    minYear: ai.wantMinYear,
    maxYear: ai.wantMaxYear,
    maxPrice: ai.wantMaxPrice,
    minSeats: ai.wantMinSeats,
    keywords: ai.wantKeywords,
  };

  const name = clean(ai.name);
  const mobile = clean(ai.mobile);
  const email = clean(ai.email);

  const tradeInComplete = Boolean(
    tradeIn.make && tradeIn.model && tradeIn.year && tradeIn.mileage,
  );
  const wantsComplete = hasBuySignal(wants);
  const contactComplete = Boolean(name && mobile && email && EMAIL_RE.test(email));

  // Everything collected -> value the trade-in, match inventory, save the lead.
  if (tradeInComplete && wantsComplete && contactComplete) {
    const estimate = await getEstimate(tradeIn);

    let inventory: Car[] = [];
    try {
      inventory = (await prisma.car.findMany({
        where: { sold: false },
      })) as unknown as Car[];
    } catch (err) {
      console.error("Failed to load inventory:", err);
    }
    const matches = matchCars(inventory, wants, 3);

    try {
      const lead = await prisma.lead.create({
        data: {
          intent: "trade",
          make: tradeIn.make,
          model: tradeIn.model,
          year: tradeIn.year,
          mileage: tradeIn.mileage,
          condition: tradeIn.condition,
          name,
          mobile,
          email,
          estimateMin: estimate.min,
          estimateMax: estimate.max,
          currency: estimate.currency,
        },
      });
      // Offer the trade-in to dealers via the Dealer Core auction.
      await createAuctionForLead(lead.id);
    } catch (err) {
      console.error("Failed to save lead:", err);
    }

    const range = `${formatCurrency(estimate.min, estimate.currency)} – ${formatCurrency(
      estimate.max,
      estimate.currency,
    )}`;
    const firstName = name ? name.split(/\s+/)[0] : "";
    const reply =
      `Thanks${firstName ? ", " + firstName : ""}! Your ${tradeIn.year} ${tradeIn.make} ${tradeIn.model} ` +
      `has an estimated trade-in value of ${range}. ` +
      (matches.length
        ? `Here are replacements that fit what you're after — a specialist will confirm the trade difference and finalise everything${mobile ? " on " + mobile : ""}.`
        : `I couldn't find a close replacement in stock right now, but a specialist will reach out${mobile ? " on " + mobile : ""} with options.`);

    const res: TradeResponse = {
      reply,
      stage: "done",
      tradeIn,
      wants,
      estimate,
      matches,
      currency,
    };
    return NextResponse.json(res);
  }

  // Still collecting — report the current stage so the UI can show progress.
  const stage: TradeStage = !tradeInComplete
    ? "tradeIn"
    : !wantsComplete
      ? "wants"
      : "contact";

  const res: TradeResponse = {
    reply: ai.reply || "Tell me about the car you'd like to trade in.",
    stage,
    tradeIn,
    wants,
    matches: [],
    currency,
  };
  return NextResponse.json(res);
}

function hasBuySignal(c: BuyCriteria): boolean {
  return (
    (c.makes?.length ?? 0) > 0 ||
    (c.bodyTypes?.length ?? 0) > 0 ||
    (c.fuelTypes?.length ?? 0) > 0 ||
    Boolean(c.transmission) ||
    (c.maxPrice ?? 0) > 0 ||
    (c.minYear ?? 0) > 0 ||
    (c.minSeats ?? 0) > 0 ||
    (c.keywords?.length ?? 0) > 0
  );
}

function clean(v?: string): string | undefined {
  const s = (v ?? "").toString().trim();
  return s.length ? s : undefined;
}

function toYear(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

function toMileage(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}
