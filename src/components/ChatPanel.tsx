"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BuyResponse,
  CarMatch,
  ChatMessage,
  Estimate,
  InspectionAnalysis,
  TabId,
  TradeResponse,
  TradeStage,
  VinDecodeResult,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";

interface ChatPanelProps {
  intent: TabId;
  initialMessage: string;
  onClose: () => void;
}

const TITLES: Record<TabId, string> = {
  buy: "Find your car",
  sell: "Sell your car",
  trade: "Trade your car",
  dealer: "Dealer Core",
};

export default function ChatPanel({
  intent,
  initialMessage,
  onClose,
}: ChatPanelProps) {
  // Bumping this key remounts the active chat with fresh state ("start again").
  const [restartKey, setRestartKey] = useState(0);
  const restart = () => setRestartKey((k) => k + 1);

  if (intent === "sell") {
    return (
      <SellChat
        key={restartKey}
        initialMessage={initialMessage}
        onClose={onClose}
        onRestart={restart}
        title={TITLES.sell}
      />
    );
  }

  if (intent === "buy") {
    return (
      <BuyChat
        key={restartKey}
        initialMessage={initialMessage}
        onClose={onClose}
        onRestart={restart}
        title={TITLES.buy}
      />
    );
  }

  if (intent === "trade") {
    return (
      <TradeChat
        key={restartKey}
        initialMessage={initialMessage}
        onClose={onClose}
        onRestart={restart}
        title={TITLES.trade}
      />
    );
  }

  // Dealer Core — links out to the full dealer portal.
  return (
    <Overlay onClose={onClose}>
      <Header title={TITLES.dealer} onClose={onClose} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
          For car dealers
        </span>
        <p className="text-neutral-700">
          <strong>Dealer Core</strong> is our live auction. Seller leads from the
          Sell and Trade flows are listed for dealers to bid on — the winning
          offer goes back to the seller to finalise.
        </p>
        <p className="text-sm text-neutral-500">
          Sign in or register as a dealer to view live lots and place bids.
        </p>
        <a
          href="/dealer"
          className="mt-2 rounded-md bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Open Dealer Portal →
        </a>
      </div>
    </Overlay>
  );
}

type SellStep =
  | "mulkiya"
  | "decoding"
  | "confirm"
  | "manual"
  | "mileage"
  | "accident"
  | "service"
  | "condition"
  | "owners"
  | "warranty"
  | "keys"
  | "modifications"
  | "report"
  | "reportUpload"
  | "contact"
  | "revealing"
  | "done"
  | "inspection"
  | "booking"
  | "scheduled";

interface SellCar {
  vin?: string;
  engineNo?: string;
  make: string;
  model: string;
  year: string;
  bodyType?: string;
  trim?: string;
  transmission?: string;
  fuelType?: string;
}

const CONDITIONS = ["Excellent", "Good", "Average", "Needs repairs"];
const ACCIDENTS = [
  "No accident",
  "Minor accident",
  "Major accident",
  "Structural damage",
  "Not sure",
];
const SERVICE_PLACES = [
  "Agency",
  "Authorized garage",
  "Local garage",
  "Self-maintained",
  "No records",
];
const KEYS_OPTS = ["Two keys", "One key", "No keys"];
const YES_NO = ["Yes", "No"];

// Expert WhatsApp number (digits only, international format without +).
const EXPERT_WHATSAPP = "971541809313";

function SellChat({
  initialMessage,
  onClose,
  onRestart,
  title,
}: {
  initialMessage: string;
  onClose: () => void;
  onRestart?: () => void;
  title: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialMessage },
    {
      role: "assistant",
      content:
        "Hi! I'm the WD AI Assistant 👋 I can get you the real market value of your car in seconds. To start, please upload the back side of your vehicle registration card (Mulkiya) and I'll read the details automatically — or enter them manually.",
    },
  ]);
  const [step, setStep] = useState<SellStep>("mulkiya");
  const [loading, setLoading] = useState(false);

  const [car, setCar] = useState<SellCar>({ make: "", model: "", year: "" });
  const [mileage, setMileage] = useState<number | null>(null);
  const [condition, setCondition] = useState("");
  const [accident, setAccident] = useState("");
  const [serviceHistory, setServiceHistory] = useState("");
  const [previousOwners, setPreviousOwners] = useState<number | null>(null);
  const [warranty, setWarranty] = useState("");
  const [keys, setKeys] = useState("");
  const [modifications, setModifications] = useState("");
  const [inspection, setInspection] = useState<InspectionAnalysis | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, step, loading]);

  const pushAssistant = (content: string) =>
    setMessages((m) => [...m, { role: "assistant", content }]);
  const pushUser = (content: string) =>
    setMessages((m) => [...m, { role: "user", content }]);

  // --- Step 3: read the Mulkiya (registration card) via AI ----------------
  async function submitMulkiya(file: File) {
    pushUser(`Uploaded ${file.name}`);
    setStep("decoding");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sell/mulkiya", { method: "POST", body: fd });
      const data: VinDecodeResult = await res.json();
      if (data.decoded) {
        const next: SellCar = {
          vin: data.vin,
          engineNo: data.engineNo || undefined,
          make: data.make,
          model: data.model,
          year: data.year ? String(data.year) : "",
          bodyType: data.bodyClass || undefined,
          trim: data.trim || undefined,
        };
        setCar(next);
        pushAssistant(
          data.partial
            ? "Got it! I read the make and year from your Mulkiya — please confirm the model below."
            : "Got it! Here are the details from your Mulkiya. Is this correct?",
        );
        setStep(data.partial ? "manual" : "confirm");
      } else {
        pushAssistant(
          `${data.message || "I couldn't read that card."} No problem — please enter the details manually.`,
        );
        setStep("manual");
      }
    } catch {
      pushAssistant("Network error reading your Mulkiya. Please enter details manually.");
      setStep("manual");
    } finally {
      setLoading(false);
    }
  }

  // --- Step 3 confirm -----------------------------------------------------
  function confirmYes() {
    pushUser("Yes, that's correct");
    pushAssistant("Great! What's the current mileage (in km)?");
    setStep("mileage");
  }

  // --- Step 4 (manual / update) ------------------------------------------
  function submitManual(next: SellCar) {
    setCar(next);
    pushUser(`${next.year} ${next.make} ${next.model}`.trim());
    pushAssistant("Thanks! What's the current mileage (in km)?");
    setStep("mileage");
  }

  // --- Step: mileage ------------------------------------------------------
  function submitMileage(km: number) {
    setMileage(km);
    pushUser(`${km.toLocaleString()} km`);
    pushAssistant("Has the vehicle ever been involved in an accident?");
    setStep("accident");
  }

  // --- Step: accident history --------------------------------------------
  function submitAccident(v: string) {
    setAccident(v);
    pushUser(v);
    pushAssistant("Where was the vehicle serviced?");
    setStep("service");
  }

  // --- Step: service history ---------------------------------------------
  function submitService(v: string) {
    setServiceHistory(v);
    pushUser(v);
    pushAssistant("What is the current condition of the vehicle?");
    setStep("condition");
  }

  // --- Step: condition ----------------------------------------------------
  function submitCondition(c: string) {
    setCondition(c);
    pushUser(c);
    pushAssistant("How many previous owners does the vehicle have?");
    setStep("owners");
  }

  // --- Step: previous owners ---------------------------------------------
  function submitOwners(n: number) {
    setPreviousOwners(n);
    pushUser(n === 0 ? "First owner" : `${n} previous owner${n === 1 ? "" : "s"}`);
    pushAssistant("Does the vehicle have remaining warranty or service package?");
    setStep("warranty");
  }

  // --- Step: warranty -----------------------------------------------------
  function submitWarranty(v: string) {
    setWarranty(v);
    pushUser(v);
    pushAssistant("Are all original keys available?");
    setStep("keys");
  }

  // --- Step: keys ---------------------------------------------------------
  function submitKeys(v: string) {
    setKeys(v);
    pushUser(v);
    pushAssistant("Any modifications or aftermarket upgrades?");
    setStep("modifications");
  }

  // --- Step: modifications ------------------------------------------------
  function submitModifications(v: string) {
    setModifications(v);
    pushUser(v);
    pushAssistant(
      "One last thing before your valuation — do you have a comprehensive inspection report for this car (from WheelerDealers or another provider)? Uploading it makes your valuation more accurate.",
    );
    setStep("report");
  }

  // --- Step: has inspection report? --------------------------------------
  function pickReport(v: string) {
    pushUser(v);
    if (v === "Yes") {
      pushAssistant(
        "Great — please upload the inspection report (PDF) and I'll analyse it before revealing the value.",
      );
      setStep("reportUpload");
    } else {
      pushAssistant(
        "No problem! To reveal your car's latest market value, please share your contact details.",
      );
      setStep("contact");
    }
  }

  // --- Step: analyse uploaded inspection report --------------------------
  async function submitReportFile(file: File) {
    pushUser(`Uploaded ${file.name}`);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sell/inspection-report", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        const a = data.analysis as InspectionAnalysis;
        setInspection(a);
        const score = a.overallScore ? ` Overall condition score: ${a.overallScore}/10.` : "";
        pushAssistant(
          `Thanks! I analysed your report.${score} ${a.summary ?? ""} I've factored these findings into your valuation — now please share your contact details.`.trim(),
        );
        setStep("contact");
      } else {
        pushAssistant(
          data.error ||
            "I couldn't read that report. You can try another PDF or continue without it.",
        );
        setStep("reportUpload");
      }
    } catch {
      pushAssistant(
        "Network error while analysing the report. You can try again or continue without it.",
      );
      setStep("reportUpload");
    } finally {
      setLoading(false);
    }
  }

  // --- Step: skip the report ---------------------------------------------
  function skipReport() {
    pushUser("Continue without a report");
    pushAssistant(
      "No problem! To reveal your car's latest market value, please share your contact details.",
    );
    setStep("contact");
  }

  // --- Contact -> reveal --------------------------------------------------
  async function submitContact(name: string, mobile: string, email: string) {
    pushUser(`${name} · ${mobile} · ${email}`);
    setStep("revealing");
    setLoading(true);
    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: car.vin,
          engineNo: car.engineNo,
          make: car.make,
          model: car.model,
          trim: car.trim,
          year: Number(car.year),
          mileage,
          condition,
          accident,
          serviceHistory,
          previousOwners,
          warranty,
          keys,
          modifications,
          inspection: inspection ?? undefined,
          name,
          mobile,
          email,
        }),
      });
      const data = await res.json();
      if (res.ok && data.estimate) {
        setEstimate(data.estimate as Estimate);
        if (data.leadId) setLeadId(data.leadId as string);
        setStep("done");
      } else {
        pushAssistant(data.error || "Something went wrong. Please try again.");
        setStep("contact");
      }
    } catch {
      pushAssistant("Network error — please try again.");
      setStep("contact");
    } finally {
      setLoading(false);
    }
  }

  // --- Step 9-10: book free inspection -> scheduled ----------------------
  function startInspection() {
    pushUser("Book Free Inspection");
    pushAssistant("Great! Let's book your free inspection.");
    setStep("inspection");
  }

  async function confirmInspection(type: "home" | "branch", slot: string) {
    const label = type === "home" ? "Home Inspection" : "Branch Visit";
    pushUser(`${label}${slot ? " · " + slot : ""}`);
    setStep("booking");
    setLoading(true);
    try {
      await fetch("/api/sell/inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, inspectionType: type, slot }),
      });
    } catch {
      // Non-blocking — still confirm to the customer.
    } finally {
      setLoading(false);
      pushAssistant(
        "Your inspection is scheduled! Our team will contact you shortly to confirm and guide you further.",
      );
      setStep("scheduled");
    }
  }

  async function chatWithExpert() {
    pushUser("Chat with Expert");
    // Record the expert-chat intent on the lead (non-blocking).
    fetch("/api/sell/inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, inspectionType: "expert-chat" }),
    }).catch(() => {});
    const carLabel = `${car.year} ${car.make} ${car.model}`.trim();
    const text = encodeURIComponent(
      `Hi! I just valued my ${carLabel} on The Wheeler Dealers and would like to chat with an expert.`,
    );
    window.open(
      `https://wa.me/${EXPERT_WHATSAPP}?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
    pushAssistant(
      "Opening WhatsApp — chat directly with our expert. If it didn't open, message us on WhatsApp at +971 54 180 9313.",
    );
    setStep("scheduled");
  }

  return (
    <Overlay onClose={onClose}>
      <Header title={title} onClose={onClose} onRestart={onRestart} />

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}

        {step === "confirm" && (
          <CarDetailsCard car={car} onYes={confirmYes} onUpdate={() => setStep("manual")} />
        )}

        {(loading || step === "decoding" || step === "revealing" || step === "booking") && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
          </div>
        )}

        {(step === "done" || step === "inspection" || step === "booking" || step === "scheduled") &&
          estimate && (
            <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
              {/* Headline value */}
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-red-500">
                  Estimated market value
                </p>
                <p className="mt-1 text-3xl font-bold text-red-700">
                  {formatCurrency(estimate.point ?? estimate.max, estimate.currency)}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Expected selling range{" "}
                  <span className="font-semibold text-neutral-700">
                    {formatCurrency(estimate.min, estimate.currency)} –{" "}
                    {formatCurrency(estimate.max, estimate.currency)}
                  </span>
                </p>
                {estimate.inspectionUsed && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Based on your inspection report
                  </span>
                )}
              </div>

              {/* Confidence + market status */}
              {(typeof estimate.confidence === "number" || estimate.marketStatus) && (
                <div className="mt-3 space-y-2">
                  {typeof estimate.confidence === "number" && (
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600">
                        <span>Confidence score</span>
                        <span className="font-semibold text-neutral-800">
                          {estimate.confidence}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full ${
                            estimate.confidence >= 75
                              ? "bg-green-500"
                              : estimate.confidence >= 55
                                ? "bg-amber-500"
                                : "bg-neutral-400"
                          }`}
                          style={{ width: `${estimate.confidence}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {estimate.marketStatus && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-neutral-600">Market status</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          estimate.marketStatus === "High"
                            ? "bg-green-100 text-green-700"
                            : estimate.marketStatus === "Medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {estimate.marketStatus} demand
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Positive / negative factors */}
              {(estimate.positives?.length || estimate.negatives?.length) && (
                <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-left">
                  {estimate.positives?.map((f) => (
                    <div key={`p-${f}`} className="flex items-start gap-2 text-xs text-neutral-700">
                      <span className="mt-0.5 text-green-600">+</span>
                      <span>{f}</span>
                    </div>
                  ))}
                  {estimate.negatives?.map((f) => (
                    <div key={`n-${f}`} className="flex items-start gap-2 text-xs text-neutral-700">
                      <span className="mt-0.5 text-red-500">−</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-center text-[11px] text-neutral-400">
                *Final offer may vary after physical inspection.
              </p>
            </div>
          )}

        {step === "scheduled" && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-green-800">
              Your request is scheduled!
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Our team will call you soon to confirm and guide you further.
            </p>
          </div>
        )}
      </div>

      {/* Dynamic input area, changes per step */}
      <div className="border-t border-neutral-200 p-3">
        {step === "mulkiya" && (
          <MulkiyaUpload
            onSubmit={submitMulkiya}
            onManual={() => setStep("manual")}
            disabled={loading}
          />
        )}
        {step === "manual" && (
          <ManualCarForm initial={car} onSubmit={submitManual} />
        )}
        {step === "mileage" && <MileageInput onSubmit={submitMileage} />}
        {step === "accident" && (
          <QuickReplies options={ACCIDENTS} onPick={submitAccident} stack />
        )}
        {step === "service" && (
          <QuickReplies options={SERVICE_PLACES} onPick={submitService} stack />
        )}
        {step === "condition" && (
          <QuickReplies options={CONDITIONS} onPick={submitCondition} />
        )}
        {step === "owners" && (
          <NumberPrompt
            placeholder="Number of previous owners…"
            allowZero
            onSubmit={submitOwners}
          />
        )}
        {step === "warranty" && (
          <QuickReplies options={YES_NO} onPick={submitWarranty} />
        )}
        {step === "keys" && (
          <QuickReplies options={KEYS_OPTS} onPick={submitKeys} />
        )}
        {step === "modifications" && (
          <QuickReplies options={YES_NO} onPick={submitModifications} />
        )}
        {step === "report" && (
          <QuickReplies options={YES_NO} onPick={pickReport} />
        )}
        {step === "reportUpload" && (
          <ReportUpload onSubmit={submitReportFile} onSkip={skipReport} disabled={loading} />
        )}
        {step === "contact" && <ContactForm onSubmit={submitContact} disabled={loading} />}
        {step === "done" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={startInspection}
              className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Book Free Inspection
            </button>
            <button
              type="button"
              onClick={chatWithExpert}
              className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Chat with Expert
            </button>
            {onRestart && (
              <button
                type="button"
                onClick={onRestart}
                className="w-full rounded-md px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
              >
                ↻ Value another car
              </button>
            )}
          </div>
        )}
        {step === "inspection" && (
          <InspectionForm onConfirm={confirmInspection} disabled={loading} />
        )}
        {step === "scheduled" && (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Done
          </button>
        )}
        {(step === "confirm" || step === "decoding" || step === "revealing" || step === "booking") && (
          <p className="px-1 text-center text-xs text-neutral-400">
            {step === "confirm"
              ? "Confirm the details above to continue."
              : "Working on it…"}
          </p>
        )}
      </div>
    </Overlay>
  );
}

// --- Sell flow sub-components ---------------------------------------------

function MulkiyaUpload({
  onSubmit,
  onManual,
  disabled,
}: {
  onSubmit: (file: File) => void;
  onManual: () => void;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

  function pick(f: File | null) {
    setError("");
    if (!f) return;
    if (!OK_TYPES.includes(f.type)) {
      setError("Please choose a photo (JPG or PNG).");
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setError("Image must be under 12 MB.");
      return;
    }
    setFile(f);
  }

  if (disabled) {
    return (
      <p className="px-1 py-2 text-center text-xs text-neutral-500">
        Reading your Mulkiya…
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onSubmit(file);
      }}
      className="space-y-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 px-3 py-3 text-sm font-medium text-neutral-600 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {file ? file.name : "Upload Mulkiya photo (back side)"}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!file}
        className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Read details &amp; Continue
      </button>
      <button
        type="button"
        onClick={onManual}
        className="w-full text-center text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
      >
        Or enter car details manually
      </button>
    </form>
  );
}

function CarDetailsCard({
  car,
  onYes,
  onUpdate,
}: {
  car: SellCar;
  onYes: () => void;
  onUpdate: () => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-y-1.5 text-sm">
        <span className="text-neutral-500">Make</span>
        <span className="font-medium text-neutral-900">{car.make || "—"}</span>
        <span className="text-neutral-500">Model</span>
        <span className="font-medium text-neutral-900">{car.model || "—"}</span>
        <span className="text-neutral-500">Year</span>
        <span className="font-medium text-neutral-900">{car.year || "—"}</span>
        {car.vin && (
          <>
            <span className="text-neutral-500">Chassis No.</span>
            <span className="font-medium text-neutral-900 break-all">{car.vin}</span>
          </>
        )}
        {car.engineNo && (
          <>
            <span className="text-neutral-500">Engine No.</span>
            <span className="font-medium text-neutral-900 break-all">{car.engineNo}</span>
          </>
        )}
        {car.trim && (
          <>
            <span className="text-neutral-500">Trim</span>
            <span className="font-medium text-neutral-900">{car.trim}</span>
          </>
        )}
        {car.bodyType && (
          <>
            <span className="text-neutral-500">Body</span>
            <span className="font-medium text-neutral-900">{car.bodyType}</span>
          </>
        )}
        {car.transmission && (
          <>
            <span className="text-neutral-500">Transmission</span>
            <span className="font-medium text-neutral-900">{car.transmission}</span>
          </>
        )}
        {car.fuelType && (
          <>
            <span className="text-neutral-500">Fuel</span>
            <span className="font-medium text-neutral-900">{car.fuelType}</span>
          </>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onYes}
          className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Yes, that&apos;s correct
        </button>
        <button
          onClick={onUpdate}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          No, let me update
        </button>
      </div>
    </div>
  );
}

function ManualCarForm({
  initial,
  onSubmit,
}: {
  initial: SellCar;
  onSubmit: (car: SellCar) => void;
}) {
  const [make, setMake] = useState(initial.make);
  const [model, setModel] = useState(initial.model);
  const [year, setYear] = useState(initial.year);
  const [trim, setTrim] = useState(initial.trim ?? "");
  const valid = make.trim() && year.trim() && /^\d{4}$/.test(year.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onSubmit({
            ...initial,
            make: make.trim(),
            model: model.trim(),
            year: year.trim(),
            trim: trim.trim() || undefined,
          });
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          value={make}
          onChange={(e) => setMake(e.target.value)}
          placeholder="Make"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <input
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Year"
          inputMode="numeric"
          className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
      </div>
      <input
        value={trim}
        onChange={(e) => setTrim(e.target.value)}
        placeholder="Trim / variant (optional) — e.g. XLi, GLi, SE"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
      />
      <button
        type="submit"
        disabled={!valid}
        className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}

function MileageInput({ onSubmit }: { onSubmit: (km: number) => void }) {
  const [val, setVal] = useState("");
  const km = Number(val.replace(/\D/g, ""));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (km > 0) onSubmit(km);
      }}
      className="flex items-center gap-2"
    >
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Mileage in km…"
        inputMode="numeric"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
      />
      <button
        type="submit"
        disabled={!(km > 0)}
        className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </form>
  );
}

function NumberPrompt({
  placeholder,
  onSubmit,
  allowZero = false,
}: {
  placeholder: string;
  onSubmit: (n: number) => void;
  allowZero?: boolean;
}) {
  const [val, setVal] = useState("");
  const hasValue = val.replace(/\D/g, "").length > 0;
  const n = Number(val.replace(/\D/g, ""));
  const valid = hasValue && (allowZero ? n >= 0 : n > 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(n);
      }}
      className="flex items-center gap-2"
    >
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
      />
      <button
        type="submit"
        disabled={!valid}
        className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </form>
  );
}

function QuickReplies({
  options,
  onPick,
  stack = false,
}: {
  options: string[];
  onPick: (v: string) => void;
  /** Stack options vertically full-width (better for long labels). */
  stack?: boolean;
}) {
  return (
    <div className={stack ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={`${
            stack ? "w-full text-left" : "flex-1"
          } rounded-md border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-red-500 hover:bg-red-50 hover:text-red-700`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function ContactForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (name: string, mobile: string, email: string) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const valid = name.trim() && mobile.trim() && emailOk;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !disabled) onSubmit(name.trim(), mobile.trim(), email.trim());
      }}
      className="space-y-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
      />
      <input
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        placeholder="Mobile number"
        inputMode="tel"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        inputMode="email"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
      />
      <button
        type="submit"
        disabled={!valid || disabled}
        className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit &amp; See Price
      </button>
      <p className="text-center text-[11px] text-neutral-400">
        🔒 Your information is safe with us and only used to assist you.
      </p>
    </form>
  );
}

function ReportUpload({
  onSubmit,
  onSkip,
  disabled,
}: {
  onSubmit: (file: File) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setError("");
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setError("File must be under 12 MB.");
      return;
    }
    setFile(f);
  }

  if (disabled) {
    return (
      <p className="px-1 py-2 text-center text-xs text-neutral-500">
        Analysing your inspection report…
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onSubmit(file);
      }}
      className="space-y-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 px-3 py-3 text-sm font-medium text-neutral-600 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {file ? file.name : "Choose inspection report (PDF)"}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!file}
        className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Analyse &amp; Continue
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="w-full rounded-md px-4 py-2 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700"
      >
        Continue without a report
      </button>
    </form>
  );
}

function InspectionForm({
  onConfirm,
  disabled,
}: {
  onConfirm: (type: "home" | "branch", slot: string) => void;
  disabled?: boolean;
}) {
  const [type, setType] = useState<"home" | "branch">("home");
  const [slot, setSlot] = useState("Today");
  const SLOTS = ["Today", "Tomorrow", "This Weekend"];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onConfirm(type, slot);
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <InspectionOption
          active={type === "home"}
          onClick={() => setType("home")}
          title="Home Inspection"
          subtitle="We come to you"
        />
        <InspectionOption
          active={type === "branch"}
          onClick={() => setType("branch")}
          title="Branch Visit"
          subtitle="Visit our nearest branch"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-500">
          When would you prefer?
        </p>
        <div className="flex gap-2">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlot(s)}
              className={[
                "flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                slot === s
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Confirm Booking
      </button>
    </form>
  );
}

function InspectionOption({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors",
        active ? "border-red-500 bg-red-50" : "border-neutral-300 hover:bg-neutral-50",
      ].join(" ")}
    >
      <span>
        <span className="block text-sm font-medium text-neutral-900">{title}</span>
        <span className="block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <span
        className={[
          "flex h-4 w-4 items-center justify-center rounded-full border",
          active ? "border-red-600" : "border-neutral-300",
        ].join(" ")}
      >
        {active && <span className="h-2 w-2 rounded-full bg-red-600" />}
      </span>
    </button>
  );
}

function BuyChat({
  initialMessage,
  onClose,
  onRestart,
  title,
}: {
  initialMessage: string;
  onClose: () => void;
  onRestart?: () => void;
  title: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<CarMatch[]>([]);
  const [currency, setCurrency] = useState("USD");

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(history: ChatMessage[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const json: BuyResponse = await res.json();
      setMessages([...history, { role: "assistant", content: json.reply }]);
      if (json.currency) setCurrency(json.currency);
      // Show results when present; keep previous results otherwise.
      if (json.matches && json.matches.length) setMatches(json.matches);
    } catch {
      setMessages([
        ...history,
        {
          role: "assistant",
          content: "Network error — please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send([{ role: "user", content: initialMessage }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, matches, loading]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setInput("");
    setMessages(next);
    void send(next);
  }

  return (
    <Overlay onClose={onClose}>
      <Header title={title} onClose={onClose} onRestart={onRestart} />

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}

        {matches.length > 0 && (
          <div className="space-y-3 pt-1">
            {matches.map((car) => (
              <CarCard key={car.id} car={car} currency={currency} />
            ))}
            <p className="px-1 text-center text-xs text-neutral-400">
              Reply to refine — e.g. &quot;cheaper&quot;, &quot;only SUVs&quot;, or
              &quot;automatic only&quot;.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe or refine your search…"
            disabled={loading}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </Overlay>
  );
}

const TRADE_STEPS: { id: TradeStage; label: string }[] = [
  { id: "tradeIn", label: "Your car" },
  { id: "wants", label: "New car" },
  { id: "contact", label: "Contact" },
];

function TradeChat({
  initialMessage,
  onClose,
  onRestart,
  title,
}: {
  initialMessage: string;
  onClose: () => void;
  onRestart?: () => void;
  title: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<TradeStage>("tradeIn");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [matches, setMatches] = useState<CarMatch[]>([]);
  const [currency, setCurrency] = useState("USD");

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(history: ChatMessage[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const json: TradeResponse = await res.json();
      setMessages([...history, { role: "assistant", content: json.reply }]);
      if (json.stage) setStage(json.stage);
      if (json.currency) setCurrency(json.currency);
      if (json.estimate) setEstimate(json.estimate);
      if (json.matches) setMatches(json.matches);
    } catch {
      setMessages([
        ...history,
        {
          role: "assistant",
          content: "Network error — please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send([{ role: "user", content: initialMessage }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, matches, loading]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || stage === "done") return;
    const next = [...messages, { role: "user" as const, content: text }];
    setInput("");
    setMessages(next);
    void send(next);
  }

  const activeIndex =
    stage === "done" ? TRADE_STEPS.length : TRADE_STEPS.findIndex((s) => s.id === stage);

  return (
    <Overlay onClose={onClose}>
      <Header title={title} onClose={onClose} onRestart={onRestart} />

      {/* Step progress */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 px-4 py-2.5">
        {TRADE_STEPS.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <div key={step.id} className="flex flex-1 items-center gap-1.5">
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  done
                    ? "bg-red-600 text-white"
                    : current
                      ? "bg-red-100 text-red-600 ring-1 ring-red-400"
                      : "bg-neutral-100 text-neutral-400",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "text-[11px] font-medium",
                  current ? "text-red-600" : done ? "text-neutral-700" : "text-neutral-400",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}

        {loading && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-neutral-400" />
          </div>
        )}

        {stage === "done" && estimate && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-red-500">
              Estimated trade-in value
            </p>
            <p className="mt-1 text-2xl font-bold text-red-700">
              {formatCurrency(estimate.min, currency)} –{" "}
              {formatCurrency(estimate.max, currency)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Approximate figure. A specialist will confirm the trade difference.
            </p>
          </div>
        )}

        {stage === "done" && matches.length > 0 && (
          <div className="space-y-3 pt-1">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Suggested replacements
            </p>
            {matches.map((car) => (
              <CarCard key={car.id} car={car} currency={currency} />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-neutral-200 p-3">
        {stage === "done" ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Done
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </form>
    </Overlay>
  );
}

function CarCard({ car, currency }: { car: CarMatch; currency: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-neutral-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-neutral-900">
          {car.year} {car.make} {car.model}
        </h3>
        <span className="text-sm font-bold text-red-600">
          {formatCurrency(car.price, currency)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        <Tag>{car.mileage.toLocaleString()} mi</Tag>
        <Tag className="capitalize">{car.bodyType}</Tag>
        <Tag className="capitalize">{car.fuelType}</Tag>
        <Tag className="capitalize">{car.transmission}</Tag>
        {car.color && <Tag>{car.color}</Tag>}
        {car.seats ? <Tag>{car.seats} seats</Tag> : null}
      </div>
      {car.description && (
        <p className="px-4 pb-3 text-xs leading-relaxed text-neutral-500">
          {car.description}
        </p>
      )}
    </div>
  );
}

function Tag({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 ${className}`}
    >
      {children}
    </span>
  );
}

function Overlay({
  children,
}: {
  children: React.ReactNode;
  /** Kept for API compatibility; the overlay intentionally ignores outside
   * clicks so multi-step flows aren't closed by accident. Use the ✕ button. */
  onClose?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div
        className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[600px] sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function Header({
  title,
  onClose,
  onRestart,
}: {
  title: string;
  onClose: () => void;
  onRestart?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
        <h2 className="font-semibold text-neutral-900">{title}</h2>
      </div>
      <div className="flex items-center gap-1">
        {onRestart && (
          <button
            onClick={onRestart}
            aria-label="Start again"
            title="Start again"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 2v6h6" />
              <path d="M3 8a9 9 0 1 0 3-5.5" />
            </svg>
            Start again
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "rounded-br-sm bg-red-600 text-white"
            : "rounded-bl-sm bg-neutral-100 text-neutral-800",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
