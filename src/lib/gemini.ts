import { GoogleGenAI, Type } from "@google/genai";
import type {
  BuyCriteria,
  ChatMessage,
  InspectionAnalysis,
  MulkiyaExtraction,
  SellData,
} from "./types";

// Primary model plus ordered fallbacks (used when the primary is busy/unavailable).
// NOTE: newer Google AI API keys can no longer call the retired gemini-2.x models
// (they 404 with "no longer available to new users"), so we use current models
// this key can reach. If a 404 reappears, re-check with the ListModels API.
const MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-pro-latest"];

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function toContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

const SYSTEM_INSTRUCTION = `You are the AI assistant for "The Wheeler Dealers", an AI-powered car marketplace.
You are handling the SELL flow: helping a user get an estimated value for a car they want to sell, and collecting their contact details so a specialist can follow up.

On every turn you must:
1. Read the ENTIRE conversation so far and extract the best-known values for: make, model, year, mileage, condition, name, mobile, email.
2. Return those values in the structured output. Use an empty string for unknown text fields and 0 for unknown numbers. Never guess or invent values the user did not provide.
3. Write a short, friendly "reply" asking for the NEXT missing piece of information.

Collection order:
- FIRST collect the car details: make, model, year (4-digit), mileage, and condition (one of: excellent, good, fair, poor).
- ONLY after all five car details are known, collect contact details: full name, mobile number, and email address.
- Ask for at most one or two items at a time. Be concise, warm and conversational.

Strict rules:
- NEVER state, estimate, guess or imply a price or value. The system calculates the price separately. If the user asks for the price, reassure them you just need a couple more details and it will be revealed.
- Keep each reply to 1-2 short sentences.
- If the user provides multiple details at once, capture them all.`;

export interface SellExtraction extends SellData {
  reply: string;
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    make: { type: Type.STRING, description: "Vehicle manufacturer, e.g. Toyota" },
    model: { type: Type.STRING, description: "Vehicle model, e.g. Corolla" },
    year: { type: Type.NUMBER, description: "4-digit model year, 0 if unknown" },
    mileage: { type: Type.NUMBER, description: "Odometer reading, 0 if unknown" },
    condition: { type: Type.STRING, description: "excellent | good | fair | poor" },
    name: { type: Type.STRING, description: "User's full name" },
    mobile: { type: Type.STRING, description: "User's mobile phone number" },
    email: { type: Type.STRING, description: "User's email address" },
    reply: { type: Type.STRING, description: "The assistant's next message to the user" },
  },
  required: ["reply"],
};

/**
 * Runs one turn of the Sell conversation through Gemini and returns the merged
 * structured extraction plus the assistant's reply.
 */
export async function runSellTurn(messages: ChatMessage[]): Promise<SellExtraction> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: toContents(messages),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text ?? "{}";
  try {
    return JSON.parse(text) as SellExtraction;
  } catch {
    // If the model ever returns non-JSON, treat the raw text as the reply.
    return { reply: text };
  }
}

// ---------------------------------------------------------------------------
// BUY flow
// ---------------------------------------------------------------------------

const BUY_SYSTEM_INSTRUCTION = `You are the AI assistant for "The Wheeler Dealers", an AI-powered car marketplace.
You are handling the BUY flow: understanding what kind of car the user wants so the system can match it against the live inventory.

On every turn you must:
1. Read the ENTIRE conversation and extract structured search criteria from everything the user has said.
2. Decide whether you have enough to run a useful search and set "readyToSearch" accordingly.
3. Write a short, friendly "reply".

Extract into the structured fields:
- makes: preferred manufacturers (e.g. ["Toyota"]). Empty if none stated.
- bodyTypes: any of sedan, suv, hatchback, coupe, truck, van, convertible, wagon.
- fuelTypes: any of petrol, diesel, hybrid, electric.
- transmission: "automatic" or "manual" if stated, else empty.
- minYear / maxYear: 4-digit years if implied (e.g. "newer than 2020" -> minYear 2020), else 0.
- maxPrice: budget ceiling as a number if stated (e.g. "under 30k" -> 30000), else 0.
- minSeats: if they mention family size / number of seats, else 0.
- keywords: useful free-text hints (e.g. "fuel efficient", "off-road", "first car").

Rules for readyToSearch:
- Set readyToSearch=true as soon as the user has given AT LEAST ONE concrete signal (a body type, make, budget, fuel type, or a clear use-case keyword). It is fine to search with partial info and refine later.
- Only set readyToSearch=false if the request is still totally vague (e.g. just "I want a car") — then ask ONE friendly clarifying question.

Reply rules:
- When searching, write a brief lead-in like "Here's what I found for you:" (the system appends the actual cars).
- When NOT ready, ask one concise question to narrow it down (budget, body style, or fuel type).
- NEVER invent specific cars, prices, or inventory. The system supplies the real matches.
- Keep replies to 1-2 short sentences.`;

export interface BuyExtraction extends BuyCriteria {
  readyToSearch: boolean;
  reply: string;
}

const buyResponseSchema = {
  type: Type.OBJECT,
  properties: {
    makes: { type: Type.ARRAY, items: { type: Type.STRING } },
    bodyTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
    fuelTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
    transmission: { type: Type.STRING, description: "automatic | manual | empty" },
    minYear: { type: Type.NUMBER, description: "Earliest acceptable year, 0 if none" },
    maxYear: { type: Type.NUMBER, description: "Latest acceptable year, 0 if none" },
    maxPrice: { type: Type.NUMBER, description: "Budget ceiling, 0 if none" },
    minSeats: { type: Type.NUMBER, description: "Minimum seats, 0 if none" },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    readyToSearch: { type: Type.BOOLEAN, description: "True if there is enough to search" },
    reply: { type: Type.STRING, description: "The assistant's next message to the user" },
  },
  required: ["readyToSearch", "reply"],
};

/**
 * Runs one turn of the Buy conversation through Gemini and returns the extracted
 * search criteria, whether to search, and the assistant's reply.
 */
export async function runBuyTurn(messages: ChatMessage[]): Promise<BuyExtraction> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: toContents(messages),
    config: {
      systemInstruction: BUY_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: buyResponseSchema,
    },
  });

  const text = response.text ?? "{}";
  try {
    return JSON.parse(text) as BuyExtraction;
  } catch {
    return { readyToSearch: false, reply: text };
  }
}

// ---------------------------------------------------------------------------
// TRADE flow (sell current car + buy a replacement)
// ---------------------------------------------------------------------------

const TRADE_SYSTEM_INSTRUCTION = `You are the AI assistant for "The Wheeler Dealers", an AI-powered car marketplace.
You are handling the TRADE flow: the user wants to trade in their CURRENT car and buy a REPLACEMENT car. You must collect three things, in this order, then signal completion.

On every turn:
1. Read the ENTIRE conversation and extract everything known so far into the structured fields.
2. Write a short, friendly "reply" that asks for the NEXT missing item.
3. Set the boolean flags to reflect what is complete.

STEP 1 — Trade-in car (the car they own now). Collect:
- tradeMake, tradeModel, tradeYear (4-digit), tradeMileage, tradeCondition (excellent | good | fair | poor).
- When all five are known, set tradeInComplete=true.

STEP 2 — Desired replacement car. Extract search criteria into:
- wantMakes[], wantBodyTypes[] (sedan, suv, hatchback, coupe, truck, van, convertible, wagon),
  wantFuelTypes[] (petrol, diesel, hybrid, electric), wantTransmission (automatic | manual | empty),
  wantMinYear, wantMaxYear, wantMaxPrice, wantMinSeats, wantKeywords[].
- When the user has given at least ONE concrete signal about the car they want (body type, make, budget, fuel, or clear use-case), set wantsComplete=true.

STEP 3 — Contact details. Collect name, mobile, email.
- When all three are present (and email looks valid), set contactComplete=true.

Rules:
- Ask for ONE step at a time, in order: trade-in details first, then what they want, then contact details. One or two questions per message.
- Use empty string for unknown text fields and 0 for unknown numbers. Never invent values.
- NEVER state, estimate, guess or imply any price, trade-in value, or specific inventory. The system computes valuation and matches separately.
- Keep each reply to 1-2 short sentences, warm and concise.`;

export interface TradeExtraction {
  // Trade-in car
  tradeMake?: string;
  tradeModel?: string;
  tradeYear?: number;
  tradeMileage?: number;
  tradeCondition?: string;
  tradeInComplete?: boolean;
  // Desired replacement
  wantMakes?: string[];
  wantBodyTypes?: string[];
  wantFuelTypes?: string[];
  wantTransmission?: string;
  wantMinYear?: number;
  wantMaxYear?: number;
  wantMaxPrice?: number;
  wantMinSeats?: number;
  wantKeywords?: string[];
  wantsComplete?: boolean;
  // Contact
  name?: string;
  mobile?: string;
  email?: string;
  contactComplete?: boolean;
  // Assistant message
  reply: string;
}

const tradeResponseSchema = {
  type: Type.OBJECT,
  properties: {
    tradeMake: { type: Type.STRING },
    tradeModel: { type: Type.STRING },
    tradeYear: { type: Type.NUMBER, description: "4-digit year, 0 if unknown" },
    tradeMileage: { type: Type.NUMBER, description: "Odometer, 0 if unknown" },
    tradeCondition: { type: Type.STRING, description: "excellent | good | fair | poor" },
    tradeInComplete: { type: Type.BOOLEAN },
    wantMakes: { type: Type.ARRAY, items: { type: Type.STRING } },
    wantBodyTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
    wantFuelTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
    wantTransmission: { type: Type.STRING, description: "automatic | manual | empty" },
    wantMinYear: { type: Type.NUMBER },
    wantMaxYear: { type: Type.NUMBER },
    wantMaxPrice: { type: Type.NUMBER, description: "Budget ceiling, 0 if none" },
    wantMinSeats: { type: Type.NUMBER },
    wantKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    wantsComplete: { type: Type.BOOLEAN },
    name: { type: Type.STRING },
    mobile: { type: Type.STRING },
    email: { type: Type.STRING },
    contactComplete: { type: Type.BOOLEAN },
    reply: { type: Type.STRING, description: "The assistant's next message to the user" },
  },
  required: ["reply"],
};

/**
 * Runs one turn of the Trade conversation through Gemini, returning the merged
 * trade-in details, desired-car criteria, contact info and stage flags.
 */
export async function runTradeTurn(messages: ChatMessage[]): Promise<TradeExtraction> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: toContents(messages),
    config: {
      systemInstruction: TRADE_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: tradeResponseSchema,
    },
  });

  const text = response.text ?? "{}";
  try {
    return JSON.parse(text) as TradeExtraction;
  } catch {
    return { reply: text };
  }
}

// ---------------------------------------------------------------------------
// INSPECTION BOOKING flow (conversational booking instead of a manual form)
// ---------------------------------------------------------------------------

/** Structured fields the booking assistant extracts from the conversation. */
export interface InspectionBookingExtraction {
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  notes: string;
  address: string;
  city: string;
  emirate: string;
  date: string; // ISO date YYYY-MM-DD, empty if unknown
  slot: string; // one of the offered slots, empty if unknown
  readyToBook: boolean;
  reply: string;
}

const BOOKING_SLOTS = ["09:00 AM", "11:00 AM", "01:00 PM", "03:00 PM", "05:00 PM"];
const BOOKING_EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
];

function bookingSystemInstruction(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the AI assistant for "The Wheeler Dealers", a UAE car marketplace.
You are handling the BOOK INSPECTION flow: through a friendly conversation you collect everything needed to book a mobile vehicle inspection, so the customer never has to fill in a form.

Today's date is ${today} (use it to resolve relative dates like "tomorrow" or "this Friday" into a YYYY-MM-DD value).

On EVERY turn you must:
1. Read the ENTIRE conversation and extract the best-known values for every field.
2. Return them in the structured output. Use an empty string for unknown text fields and 0 for an unknown year. Never guess or invent details the customer did not give.
3. Write a short, warm "reply" that asks for the NEXT missing GROUP of information.

Ask in exactly these TWO grouped steps, in order:

- STEP 1 (Contact + Vehicle): in ONE friendly question, ask the customer to share ALL of these together — their full name, mobile number and email address, and the car's make, model and 4-digit year, plus any other details they would like us to know. A chassis number / VIN is optional; if they give one, capture it in "vin". Put any extra free-text remarks (special requests, notes about the car, when they are available, etc.) in "notes".

- STEP 2 (Location, date & time): in ONE friendly question, ask together for the inspection location (street address AND which emirate), the preferred date, and the time slot. The emirate MUST be one of: ${BOOKING_EMIRATES.join(", ")}. The slot MUST be exactly one of: ${BOOKING_SLOTS.join(", ")}. Resolve relative dates (e.g. "tomorrow", "this Friday") to a YYYY-MM-DD value that is today or later; if the customer names a rough time, map it to the closest offered slot.

Handling missing items — IMPORTANT:
- Only move on to STEP 2 once the required STEP 1 items are ALL known: full name, mobile number, valid email, make, model and year.
- If the customer misses or skips ANY required item, DO NOT proceed — re-ask ONLY for the specific item(s) still missing, in one short friendly line (e.g. "Thanks Ali! I just need your email address and the car's year to continue."). Never re-ask for something they already gave, and never invent a value they did not provide.
- The same rule applies in STEP 2: if the street address, emirate, date or slot is missing, ask again only for the missing piece.

ALWAYS address the customer by their NAME once you know it — NEVER greet or refer to them by their email address.

Set readyToBook = true ONLY when ALL of these are known: full name, mobile number, valid email, make, model, year, street address, emirate, date and slot. When readyToBook is true, write a reply that says you have everything and will show a summary to confirm — do NOT claim it is booked yet.
While readyToBook is false, keep asking for the next missing item(s).

Strict rules:
- Keep every reply to 1-2 short sentences, friendly and concise.
- If the customer gives several details at once, capture them all.
- Address the customer by their NAME, never by their email address.
- Never invent a name, number, email, make, model, year, address, date or slot the customer did not provide.
- The inspection fee is fixed by the system; if asked, say it will be shown on the confirmation summary.`;
}

const bookingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    customerName: { type: Type.STRING, description: "Customer's full name" },
    customerMobile: { type: Type.STRING, description: "Customer's mobile number" },
    customerEmail: { type: Type.STRING, description: "Customer's email address" },
    vin: { type: Type.STRING, description: "Chassis number / VIN if given, else empty" },
    make: { type: Type.STRING, description: "Vehicle manufacturer, e.g. Toyota" },
    model: { type: Type.STRING, description: "Vehicle model, e.g. Corolla" },
    year: { type: Type.NUMBER, description: "4-digit model year, 0 if unknown" },
    notes: { type: Type.STRING, description: "Any extra free-text details the customer shared, else empty" },
    address: { type: Type.STRING, description: "Street address for the inspection" },
    city: { type: Type.STRING, description: "City / area if given, else empty" },
    emirate: { type: Type.STRING, description: "One of the seven emirates" },
    date: { type: Type.STRING, description: "Preferred date as YYYY-MM-DD, empty if unknown" },
    slot: { type: Type.STRING, description: "One of the offered time slots, empty if unknown" },
    readyToBook: {
      type: Type.BOOLEAN,
      description: "True only when name, mobile, email, address, emirate, date and slot are all known",
    },
    reply: { type: Type.STRING, description: "The assistant's next message to the customer" },
  },
  required: ["readyToBook", "reply"],
};

/**
 * Runs one turn of the conversational inspection-booking flow through Gemini and
 * returns the merged structured booking details plus the assistant's reply.
 */
export async function runInspectionBookingTurn(
  messages: ChatMessage[],
): Promise<InspectionBookingExtraction> {
  const ai = getClient();

  const contents = toContents(messages);
  const config = {
    systemInstruction: bookingSystemInstruction(),
    temperature: 0.3,
    responseMimeType: "application/json",
    responseSchema: bookingResponseSchema,
  };

  // Try the primary model first, then alternates. Free-tier quota is metered
  // per-model, so a sibling flash model keeps the booking chat alive when the
  // primary is exhausted or the pool is briefly overloaded.
  const models = [MODEL, ...FALLBACK_MODELS];
  let lastErr: unknown;
  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;

  for (const model of models) {
    try {
      response = await ai.models.generateContent({ model, contents, config });
      break;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      // Only move to the next model on availability/quota errors.
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        throw err;
      }
    }
  }
  if (!response) throw lastErr;

  const text = response.text ?? "{}";
  try {
    const parsed = JSON.parse(text) as Partial<InspectionBookingExtraction>;
    return {
      customerName: parsed.customerName ?? "",
      customerMobile: parsed.customerMobile ?? "",
      customerEmail: parsed.customerEmail ?? "",
      vin: parsed.vin ?? "",
      make: parsed.make ?? "",
      model: parsed.model ?? "",
      year: parsed.year ?? 0,
      notes: parsed.notes ?? "",
      address: parsed.address ?? "",
      city: parsed.city ?? "",
      emirate: parsed.emirate ?? "",
      date: parsed.date ?? "",
      slot: parsed.slot ?? "",
      readyToBook: parsed.readyToBook ?? false,
      reply: parsed.reply ?? "",
    };
  } catch {
    // If the model ever returns non-JSON, treat the raw text as the reply.
    return {
      customerName: "",
      customerMobile: "",
      customerEmail: "",
      vin: "",
      make: "",
      model: "",
      year: 0,
      notes: "",
      address: "",
      city: "",
      emirate: "",
      date: "",
      slot: "",
      readyToBook: false,
      reply: text,
    };
  }
}

// ---------------------------------------------------------------------------
// INSPECTION REPORT analysis (uploaded PDF -> structured condition signals)
// ---------------------------------------------------------------------------

const INSPECTION_INSTRUCTION = `You are analysing a vehicle INSPECTION REPORT (PDF) for a UAE used-car marketplace.
Read the whole document (car details, section scores, exterior/body defect lists, wheel & tyre notes and inspector comments) and return ONLY the structured JSON.

Extraction rules:
- make, model, trim: as printed. year: 4-digit model year (0 if not found).
- mileage: odometer reading in km as an integer (0 if not found).
- serviceHistory: map to the CLOSEST of "Agency" | "Authorized garage" | "Local garage" | "Self-maintained" | "No records". If the report says "Partial", "Full" or similar, pick the closest; empty string if unknown.
- keys: "Two keys" | "One key" | "No keys" based on the number of keys reported (empty if unknown).
- accident: infer ONE of "No accident" | "Minor accident" | "Major accident" | "Structural damage" | "Not sure".
  Guidance: cosmetic chips/scratches/dents or minor repaints alone => "Minor accident" (or "No accident" if trivial). Repaired panels/running boards/wheel-housing => "Minor accident". Frame/chassis damage, structural repairs or a low frame-condition score => "Major accident" or "Structural damage". Use "Not sure" only when genuinely ambiguous.
- condition: overall condition "Excellent" | "Good" | "Average" | "Needs repairs" derived from the overall rating and defect severity (e.g. 8.5-10 => Excellent, 7-8.4 => Good, 5-6.9 => Average, below 5 => Needs repairs).
- overallScore: the report's overall rating on a 0-10 scale (convert an X/10 or a percentage to 0-10).
- bodyDamageScore, frameScore, engineScore: 0-100 section percentages when present, else 0.
- positives: 2 to 5 short bullet strings of genuine strong points (e.g. "Engine & transmission 95%", "All four tyres in good condition", "No structural/frame damage").
- negatives: 2 to 6 short bullet strings of notable issues (e.g. "Multiple exterior dents, chips & scratches", "Frame condition only 70%", "Oil wetness on rear crank seal", "Only one key").
- summary: ONE concise sentence summarising the car's overall condition.
- source: the inspection provider's name if visible (e.g. "dubizzle"), else "Uploaded report".

Only use information actually present in the document. Never invent values. Use empty string for unknown text and 0 for unknown numbers.`;

const inspectionSchema = {
  type: Type.OBJECT,
  properties: {
    make: { type: Type.STRING },
    model: { type: Type.STRING },
    year: { type: Type.NUMBER, description: "4-digit year, 0 if unknown" },
    trim: { type: Type.STRING },
    mileage: { type: Type.NUMBER, description: "Odometer km, 0 if unknown" },
    serviceHistory: { type: Type.STRING },
    keys: { type: Type.STRING },
    accident: { type: Type.STRING },
    condition: { type: Type.STRING },
    overallScore: { type: Type.NUMBER, description: "0-10 overall rating" },
    bodyDamageScore: { type: Type.NUMBER },
    frameScore: { type: Type.NUMBER },
    engineScore: { type: Type.NUMBER },
    positives: { type: Type.ARRAY, items: { type: Type.STRING } },
    negatives: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    source: { type: Type.STRING },
  },
  required: ["summary"],
};

/**
 * Analyses an uploaded inspection report (base64-encoded PDF) with Gemini and
 * returns structured condition signals used to sharpen the valuation.
 */
export async function analyzeInspectionReport(
  base64: string,
  mimeType = "application/pdf",
): Promise<InspectionAnalysis> {
  const ai = getClient();

  const contents = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Analyse this vehicle inspection report and return the structured JSON." },
      ],
    },
  ];
  const config = {
    systemInstruction: INSPECTION_INSTRUCTION,
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: inspectionSchema,
  };

  // Try the primary model first; fall back to alternates if it's overloaded
  // (the flash pool occasionally returns 503 UNAVAILABLE under demand spikes).
  const models = [MODEL, ...FALLBACK_MODELS];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({ model, contents, config }),
      );
      const text = response.text ?? "{}";
      try {
        return normalizeInspection(JSON.parse(text) as InspectionAnalysis);
      } catch {
        return { hasReport: true, source: "Uploaded report" };
      }
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      // Only move to the next model on availability errors.
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        throw err;
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// MULKIYA (UAE vehicle registration card) -> structured vehicle details
// ---------------------------------------------------------------------------

const MULKIYA_INSTRUCTION = `You are reading a UAE vehicle registration card (the "Mulkiya" / بطاقة تسجيل المركبة) — usually the BACK side titled "Vehicle Information" / بيانات المركبة.

Extract the vehicle details EXACTLY as printed. Never guess or invent a value.

The card mixes English and Arabic. Field mapping:
- "Veh. Type" (نوع المركبة) holds the MAKE and MODEL together, e.g. "MITSUBISHI PAJERO" -> make="Mitsubishi", model="Pajero"; "TOYOTA LAND CRUISER" -> make="Toyota", model="Land Cruiser". The first word is the brand; the remaining words are the model.
- "Model" (سنة الصنع) is NOT a model name — it is the 4-digit YEAR of manufacture (e.g. 2014). Put it in "year".
- "Chassis No." (رقم القاعدة) is the VIN / chassis number -> "vin" (uppercase, no spaces).
- "Eng. No." (رقم المحرك) is the engine number -> "engineNo" (uppercase, no spaces).
- "Origin" (بلد الصنع) is the country of manufacture -> "origin".
- Colour (لون المركبة) -> "color".
- Vehicle class / body, if shown -> "bodyClass".

Rules:
- Return "make" in normal Title Case (e.g. "Mitsubishi", not "MITSUBISHI").
- If the image is not a readable UAE Mulkiya, set readable=false and say why in "message".
- Leave a text field empty (or year 0) when it is not legible on the card.`;

const mulkiyaSchema = {
  type: Type.OBJECT,
  properties: {
    make: { type: Type.STRING, description: "Manufacturer / brand, Title Case (from Veh. Type)" },
    model: { type: Type.STRING, description: "Model name (Veh. Type minus the brand)" },
    year: { type: Type.NUMBER, description: "4-digit manufacture year (the card's 'Model' field), 0 if unknown" },
    vin: { type: Type.STRING, description: "Chassis number / VIN, uppercase, no spaces" },
    engineNo: { type: Type.STRING, description: "Engine number (Eng. No.), uppercase, no spaces, else empty" },
    color: { type: Type.STRING, description: "Vehicle colour, else empty" },
    bodyClass: { type: Type.STRING, description: "Vehicle class / body if shown, else empty" },
    origin: { type: Type.STRING, description: "Country of manufacture, else empty" },
    readable: { type: Type.BOOLEAN, description: "True only if this is a legible UAE Mulkiya" },
    message: { type: Type.STRING, description: "Short note; explain when not readable" },
  },
  required: ["make", "model", "readable"],
};

/** Title-cases each word, but leaves short all-caps brand tokens (BMW, MG, KIA). */
function smartTitle(s: string): string {
  return (s || "")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 3 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Reads a UAE registration card (Mulkiya) image with Gemini vision and returns
 * the vehicle's make / model / year / chassis number. This replaces VIN
 * decoding in the Sell flow — the card already prints everything we need.
 */
export async function extractMulkiya(
  base64: string,
  mimeType = "image/jpeg",
): Promise<MulkiyaExtraction> {
  const ai = getClient();

  const contents = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Extract the vehicle details from this UAE registration card (Mulkiya) and return the structured JSON." },
      ],
    },
  ];
  const config = {
    systemInstruction: MULKIYA_INSTRUCTION,
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: mulkiyaSchema,
  };

  const models = [MODEL, ...FALLBACK_MODELS];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({ model, contents, config }),
      );
      const text = response.text ?? "{}";
      return normalizeMulkiya(JSON.parse(text) as Partial<MulkiyaExtraction>);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        throw err;
      }
    }
  }
  throw lastErr;
}

/** Normalises raw Gemini output from a Mulkiya into a clean MulkiyaExtraction. */
function normalizeMulkiya(raw: Partial<MulkiyaExtraction>): MulkiyaExtraction {
  const make = smartTitle((raw.make ?? "").toString());
  const year = Number(raw.year);
  return {
    make,
    model: smartTitle((raw.model ?? "").toString()),
    year: Number.isFinite(year) && year > 1900 && year < 2100 ? Math.round(year) : undefined,
    vin: (raw.vin ?? "").toString().toUpperCase().replace(/\s+/g, ""),
    engineNo: (raw.engineNo ?? "").toString().toUpperCase().replace(/\s+/g, "") || undefined,
    color: (raw.color ?? "").toString().trim() || undefined,
    bodyClass: (raw.bodyClass ?? "").toString().trim() || undefined,
    origin: (raw.origin ?? "").toString().trim() || undefined,
    readable: raw.readable !== false && !!make,
    message: (raw.message ?? "").toString().trim(),
  };
}

/**
 * Retries a Gemini call on transient errors (503 UNAVAILABLE / 429 rate limit),
 * which the flash model occasionally returns under load.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const transient = status === 503 || status === 429 || status === 500;
      if (!transient || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Cleans Gemini's raw output: drops zero/empty values, clamps the score. */
function normalizeInspection(raw: InspectionAnalysis): InspectionAnalysis {
  const num = (v: unknown, max: number): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
  };
  const str = (v: unknown): string | undefined => {
    const s = (v ?? "").toString().trim();
    return s.length ? s.slice(0, 200) : undefined;
  };
  const list = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const items = v
      .map((x) => (x ?? "").toString().trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 8);
    return items.length ? items : undefined;
  };

  return {
    hasReport: true,
    source: str(raw.source) ?? "Uploaded report",
    make: str(raw.make),
    model: str(raw.model),
    year: num(raw.year, 2100),
    trim: str(raw.trim),
    mileage: num(raw.mileage, 2_000_000),
    serviceHistory: str(raw.serviceHistory),
    keys: str(raw.keys),
    accident: str(raw.accident),
    condition: str(raw.condition),
    overallScore: num(raw.overallScore, 10),
    bodyDamageScore: num(raw.bodyDamageScore, 100),
    frameScore: num(raw.frameScore, 100),
    engineScore: num(raw.engineScore, 100),
    positives: list(raw.positives),
    negatives: list(raw.negatives),
    summary: str(raw.summary),
  };
}

// ===========================================================================
// AI VIN decoder — fallback used when the Vincario / NHTSA APIs return the
// make + year but NOT the model (very common for GCC-spec cars). Gemini decodes
// the VIN from its knowledge of manufacturer VIN patterns (WMI / VDS) and, when
// confident, fills in the missing model. The customer still confirms the result
// on the next screen, so this only needs to be a strong, non-hallucinated guess.
// ===========================================================================

export interface AiVinDecode {
  make: string;
  model: string;
  year?: number;
  trim?: string;
  bodyClass?: string;
  wmi?: string;
  vds?: string;
  checkDigit?: string;
  modelYearChar?: string;
  assemblyPlant?: string;
  serialNumber?: string;
  confident: boolean;
  note?: string;
}

const VIN_DECODE_INSTRUCTION = `You are an expert automotive VIN decoder for a UAE (GCC) car marketplace. Decode a 17-character Vehicle Identification Number (VIN / chassis number) following the ISO 3779 standard.

You have Google Search available: USE IT to look the VIN up and confirm the exact vehicle (VIN-decoder sites, manufacturer data, GCC car listings). Searching is the most reliable way to get the correct model - do it before answering.

RULES:
1. Break the VIN into its ISO 3779 sections: wmi (positions 1-3 = region + country + manufacturer), vds (4-8), checkDigit (9), modelYearChar (10, mapped via the standard 30-year cycle to derive the year), assemblyPlant (11), serialNumber (12-17).
2. MAKE and YEAR are standardized (from the WMI and the year code) - always return them.
3. MODEL: after searching, return the correct model using the name/badging sold in the UAE / GCC (e.g. Nissan "Sunny", Toyota "Hilux", Mitsubishi "Pajero").
4. ACCURACY OVER COMPLETENESS: do NOT guess. If, even after searching, you are not sure of the EXACT model, leave "model" as an empty string, set "confident" to false, and put a short reason in "note". A wrong model is far worse than an empty one the customer confirms.
5. Validate: the VIN must be exactly 17 characters and must not contain the letters I, O or Q. If invalid, set confident=false and leave the vehicle fields empty.
6. Set "confident" to true only when you are sure of BOTH the make AND the model.

OUTPUT: return ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys: make (string), model (string), year (number), trim (string), bodyClass (string), wmi (string), vds (string), checkDigit (string), modelYearChar (string), assemblyPlant (string), serialNumber (string), confident (boolean), note (string).`;

/**
 * Decodes a VIN with Gemini. Returns null when unconfigured, the VIN isn't a
 * full 17-char VIN, or the call fails — so callers can fall back gracefully.
 */
export async function decodeVinAI(vin: string): Promise<AiVinDecode | null> {
  const v = (vin || "").trim().toUpperCase();
  // Only attempt a full, structurally valid VIN (17 chars, no I/O/Q).
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null;
  if (!process.env.GEMINI_API_KEY) return null;

  const ai = getClient();
  const contents = [
    { role: "user", parts: [{ text: `Decode this VIN (chassis number) and identify the exact vehicle. VIN: ${v}` }] },
  ];
  // Google Search grounding lets Gemini look the VIN up on the web (VIN-decoder
  // sites, manufacturer data) instead of relying only on pattern memory - this
  // is what makes the standalone Gemini app get the model right. Grounding is
  // incompatible with responseSchema, so we ask for JSON in the prompt and parse
  // it out of the text response.
  const config = {
    systemInstruction: VIN_DECODE_INSTRUCTION,
    temperature: 0,
    tools: [{ googleSearch: {} }],
  };

  const models = [MODEL, ...FALLBACK_MODELS.slice(0, 1)];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await withRetry(
        () => ai.models.generateContent({ model, contents, config }),
        2,
      );
      const raw = parseJsonLoose(response.text ?? "");
      if (!raw) {
        lastErr = new Error("VIN decode returned no parseable JSON");
        continue;
      }
      const str = (x: unknown) => (x ?? "").toString().trim();
      const yr = Math.round(Number(raw.year));
      let model_ = str(raw.model);
      // Guard: never let a placeholder (e.g. "Requires OEM lookup") become a model.
      if (/requires|lookup|unknown|not\s*available|unverified|n\/?a/i.test(model_)) {
        model_ = "";
      }
      return {
        make: titleCaseWord(str(raw.make)),
        model: model_,
        year: Number.isFinite(yr) && yr >= 1900 && yr <= 2100 ? yr : undefined,
        trim: str(raw.trim) || undefined,
        bodyClass: str(raw.bodyClass) || undefined,
        wmi: str(raw.wmi) || undefined,
        vds: str(raw.vds) || undefined,
        checkDigit: str(raw.checkDigit) || undefined,
        modelYearChar: str(raw.modelYearChar) || undefined,
        assemblyPlant: str(raw.assemblyPlant) || undefined,
        serialNumber: str(raw.serialNumber) || undefined,
        confident: Boolean(raw.confident) && !!model_,
        note: str(raw.note) || undefined,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        console.error("AI VIN decode failed:", err);
        return null;
      }
    }
  }
  console.error("AI VIN decode failed (all models):", lastErr);
  return null;
}

/** Parses a JSON object out of a possibly markdown-fenced / prose-wrapped reply. */
function parseJsonLoose(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function titleCaseWord(s: string): string {
  if (!s) return "";
  // Preserve already-cased brand tokens (BMW, GMC) but title-case plain words.
  if (s === s.toUpperCase() && s.length <= 4) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ===========================================================================
// AI market price estimate — fallback used ONLY when the scraped CarListing
// dataset has too few comparable listings to price a car. Gemini estimates a
// UAE resale range informed by the leading local marketplaces (Dubizzle,
// buyanycar, kavak, yallamotors). This is a knowledge-based estimate, not a
// live scrape; the value is clearly a fallback and the range stays conservative.
// ===========================================================================

export interface AiPriceEstimate {
  min: number;
  max: number;
  point: number;
  confidence?: number;
  note?: string;
}

const PRICE_ESTIMATE_INSTRUCTION = `You are a UAE used-car pricing expert for "The Wheeler Dealers".
Estimate the current resale price range, in AED, for a used car in the UAE market.
Base the estimate on what the SAME make/model/year typically lists for on the leading UAE car marketplaces: dubizzle.com, yallamotor.com, buyanycar.com, kavak.com, cars24.ae, carswitch.com and dubicars.com.
Adjust for mileage (UAE average is about 20,000 km per year), overall condition, accident history and service history.

Rules:
- Price for TODAY's market (the current date is given in the request) — not for when your training data was collected.
- Reason like an appraiser: start from the model's typical new price in the UAE, apply a plausible age-depreciation curve, then adjust for mileage/condition. If your range contradicts sensible depreciation (e.g. a 5-year-old car near its new price), re-think before answering.
- Mentally discard irrelevant comparables: different generations/trims, salvage cars and obvious mispricings. Base the range on the genuine cluster.
- Return realistic AED figures: a lower bound (min), an upper bound (max) and a most-likely point value between them.
- Never return 0, negative or absurd values. If unsure, still give your best reasonable range and a lower confidence (0-100).
- Output ONLY the structured JSON.`;

const aiPriceSchema = {
  type: Type.OBJECT,
  properties: {
    min: { type: Type.NUMBER, description: "Lower bound in AED" },
    max: { type: Type.NUMBER, description: "Upper bound in AED" },
    point: { type: Type.NUMBER, description: "Most-likely value in AED" },
    confidence: { type: Type.NUMBER, description: "0-100" },
    note: { type: Type.STRING },
  },
  required: ["min", "max", "point"],
};

export async function estimateMarketPriceAI(input: {
  make: string;
  model: string;
  trim?: string;
  year?: number;
  mileage?: number;
  condition?: string;
  accident?: string;
  serviceHistory?: string;
}): Promise<AiPriceEstimate | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!input.make || !input.year) return null;

  const ai = getClient();
  const prompt = `Today's date: ${new Date().toISOString().slice(0, 10)}
Estimate the UAE used-car resale price (AED) for:
Make: ${input.make}
Model: ${input.model || "(unknown)"}
Trim: ${input.trim || "(unknown)"}
Year: ${input.year}
Mileage: ${input.mileage ? `${input.mileage} km` : "unknown"}
Condition: ${input.condition || "unknown"}
Accident history: ${input.accident || "unknown"}
Service history: ${input.serviceHistory || "unknown"}`;
  const config = {
    systemInstruction: PRICE_ESTIMATE_INSTRUCTION,
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: aiPriceSchema,
  };

  const models = [MODEL, ...FALLBACK_MODELS];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config,
        }),
      );
      const raw = JSON.parse(response.text ?? "{}") as Record<string, unknown>;
      const n = (x: unknown) => Math.round(Number(x));
      let min = n(raw.min);
      let max = n(raw.max);
      let point = n(raw.point);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
      if (min > max) [min, max] = [max, min];
      if (!Number.isFinite(point) || point < min || point > max) {
        point = Math.round((min + max) / 2);
      }
      const conf = Math.round(Number(raw.confidence));
      return {
        min,
        max,
        point,
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : undefined,
        note: (raw.note ?? "").toString().trim() || undefined,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        console.error("AI price estimate failed:", err);
        return null;
      }
    }
  }
  console.error("AI price estimate failed (all models):", lastErr);
  return null;
}

// ===========================================================================
// LIVE market price search — Google-Search-grounded pricing. Gemini searches
// the leading UAE marketplaces for CURRENT listings of the same car and prices
// from what is actually live today, citing which sites backed the number.
// Preferred over estimateMarketPriceAI; that stays as the offline fallback.
// Grounding is incompatible with responseSchema, so JSON is parsed from text.
// ===========================================================================

export interface LivePriceResult extends AiPriceEstimate {
  /** Marketplace domains where comparable listings were actually found. */
  sources?: string[];
  /** Approximate number of comparable live listings used. */
  listingCount?: number;
}

const UAE_MARKETPLACES = [
  "dubizzle.com",
  "yallamotor.com",
  "buyanycar.com",
  "kavak.com",
  "cars24.ae",
  "carswitch.com",
  "dubicars.com",
];

const LIVE_PRICE_INSTRUCTION = `You are a UAE used-car pricing expert for "The Wheeler Dealers".
You have Google Search available: USE IT. Search the leading UAE used-car marketplaces for CURRENT live listings of the same make, model and year, and derive the price range from what is actually listed for sale today.

Search these UAE sites: ${UAE_MARKETPLACES.join(", ")}.

RULES:
1. Search the exact make + model + year in the UAE. Use AED prices only; ignore non-UAE listings.
2. REMOVE irrelevant comparables before averaging: different model/generation/engine variant, salvage or non-running cars, dealer "from"-price teasers, and clear outliers priced far away from the cluster of similar listings.
3. Adjust the range for THIS car's mileage (UAE average ≈ 20,000 km/year), condition, accident history and service history.
4. SANITY-CHECK with depreciation reasoning: the result must sit plausibly below the model's UAE new price and follow a sensible age curve. If your searched numbers contradict this, re-check before answering.
5. Return realistic AED figures: min, max and a most-likely point between them. Never 0, negative or absurd values.
6. "sources" must list ONLY the marketplace domains where you actually found comparable live listings; "listingCount" is roughly how many comparable listings you based the range on.
7. If you cannot find enough genuine live listings, set confidence below 40 and explain in "note" — do NOT invent listings.

OUTPUT: return ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys: min (number), max (number), point (number), confidence (number 0-100), listingCount (number), sources (array of strings), note (string).`;

export async function searchLivePricesAI(input: {
  make: string;
  model: string;
  trim?: string;
  year?: number;
  mileage?: number;
  condition?: string;
  accident?: string;
  serviceHistory?: string;
}): Promise<LivePriceResult | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!input.make || !input.year) return null;

  const ai = getClient();
  const prompt = `Today's date: ${new Date().toISOString().slice(0, 10)}
Find current UAE listings and price this used car (AED):
Make: ${input.make}
Model: ${input.model || "(unknown)"}
Trim: ${input.trim || "(unknown)"}
Year: ${input.year}
Mileage: ${input.mileage ? `${input.mileage} km` : "unknown"}
Condition: ${input.condition || "unknown"}
Accident history: ${input.accident || "unknown"}
Service history: ${input.serviceHistory || "unknown"}`;
  const config = {
    systemInstruction: LIVE_PRICE_INSTRUCTION,
    temperature: 0.2,
    tools: [{ googleSearch: {} }],
  };

  const models = [MODEL, ...FALLBACK_MODELS.slice(0, 1)];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config,
          }),
        2,
      );
      const raw = parseJsonLoose(response.text ?? "");
      if (!raw) {
        lastErr = new Error("Live price search returned no parseable JSON");
        continue;
      }
      const n = (x: unknown) => Math.round(Number(x));
      let min = n(raw.min);
      let max = n(raw.max);
      let point = n(raw.point);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
      if (min > max) [min, max] = [max, min];
      if (!Number.isFinite(point) || point < min || point > max) {
        point = Math.round((min + max) / 2);
      }
      const conf = Math.round(Number(raw.confidence));
      const count = Math.round(Number(raw.listingCount));
      const sources = Array.isArray(raw.sources)
        ? raw.sources
            .map((s) => (s ?? "").toString().trim().toLowerCase())
            .filter((s) => s.length > 0 && s.length < 60)
            .slice(0, 10)
        : [];
      return {
        min,
        max,
        point,
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : undefined,
        listingCount: Number.isFinite(count) && count > 0 ? count : undefined,
        sources: sources.length ? sources : undefined,
        note: (raw.note ?? "").toString().trim() || undefined,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status !== 503 && status !== 429 && status !== 500 && status !== 404) {
        console.error("Live price search failed:", err);
        return null;
      }
    }
  }
  console.error("Live price search failed (all models):", lastErr);
  return null;
}
