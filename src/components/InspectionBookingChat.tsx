"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import LocationPicker from "./LocationPicker";
import CustomerOtpModal from "./CustomerOtpModal";
import BookingModeSwitch from "./BookingModeSwitch";
import { useInspectionFee } from "./useInspectionFee";
import type { ChatMessage, InspectionBookingResult, SelectedLocation } from "@/lib/types";

/**
 * AI-first conversational inspection booking.
 *
 * The assistant asks for the customer, vehicle, location and schedule details in
 * a chat. Once it has everything (`readyToBook`), the collected details are
 * shown as a LOCKED, read-only summary that the customer confirms — after which
 * the booking is created via /api/inspection/book and a Job ID is shown.
 *
 * If the AI is unavailable (missing key / upstream error) we call `onFallback`
 * so the parent can switch to the manual form.
 *
 * Layout: when `onClose` is provided the whole flow renders inside an in-page
 * modal popup (matching the Buy/Sell/Trade ChatPanel). Otherwise it renders as a
 * standalone full page (the /inspection/book route).
 */

interface BookingDetails {
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
  date: string;
  slot: string;
}

interface ChatResponse {
  aiUnavailable?: boolean;
  aiBusy?: boolean;
  retryAfter?: number;
  reply: string;
  readyToBook?: boolean;
  booking?: BookingDetails;
  error?: string;
}

const GREETING =
  "Hi! I'm your booking assistant 👋 I'll set up your vehicle inspection in a quick chat — no forms. To start, please share your full name, mobile number and email address, along with the car's make, model and year — plus any other details you'd like us to know.";

export default function InspectionBookingChat({
  onFallback,
  onClose,
}: {
  onFallback: () => void;
  /** When provided the flow renders as an in-page modal popup with a ✕ button. */
  onClose?: () => void;
}) {
  const isModal = typeof onClose === "function";
  const fee = useInspectionFee();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [locked, setLocked] = useState(false); // read-only summary shown
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InspectionBookingResult | null>(null);
  /** Customer OTP login modal (shown when the booking API requires login). */
  const [showOtp, setShowOtp] = useState(false);
  /** Seconds left before the customer can retry a rate-limited turn. */
  const [cooldown, setCooldown] = useState(0);
  /** True when the last turn failed because the assistant was rate limited. */
  const [lastTurnBusy, setLastTurnBusy] = useState(false);
  /** True while fetching the customer's GPS location. */
  const [locating, setLocating] = useState(false);
  /** The location chosen via autocomplete / GPS / manual entry. */
  const [sharedLocation, setSharedLocation] = useState<SelectedLocation | null>(null);
  /** Prevents re-announcing the same chosen place twice. */
  const lastLocKeyRef = useRef("");

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, locked, result]);

  // Tick the retry cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Runs one assistant turn for the given history. */
  async function runTurn(history: ChatMessage[]) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inspection/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data: ChatResponse = await res.json();

      if (data.aiUnavailable) {
        // Hard failure — hand over to the manual form.
        onFallback();
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);

      if (data.aiBusy) {
        // Transient quota limit: keep the conversation and offer a retry.
        setLastTurnBusy(true);
        setCooldown(Math.max(1, Math.min(data.retryAfter ?? 60, 120)));
        return;
      }

      setLastTurnBusy(false);
      setCooldown(0);
      if (data.booking) setBooking(data.booking);
      if (data.readyToBook && data.booking) {
        setLocked(true); // freeze the chat and reveal the locked summary
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Sorry, I hit a network error. You can try again, or switch to the quick form below.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || loading || locked || cooldown > 0) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    await runTurn(next);
  }

  async function send() {
    await sendText(input);
  }

  /**
   * Records a chosen location (from autocomplete, GPS, or manual entry) into the
   * booking state and sends ONE confirmation message. De-duplicated so the same
   * place is never announced twice.
   */
  async function handleLocationSelect(loc: SelectedLocation) {
    const key = loc.placeId || loc.formattedAddress;
    if (!key || key === lastLocKeyRef.current) return;
    lastLocKeyRef.current = key;
    setSharedLocation(loc);
    const line = loc.mapUrl
      ? `📍 ${loc.formattedAddress}\n${loc.mapUrl}`
      : `📍 ${loc.formattedAddress}`;
    await sendText(line);
  }

  /** Adds the "location unavailable" notice, skipping a consecutive duplicate. */
  function noteLocationUnavailable(message: string) {
    setMessages((m) =>
      m[m.length - 1]?.content === message
        ? m
        : [...m, { role: "assistant", content: message }],
    );
  }

  /**
   * Uses the customer's current GPS position, reverse-geocoding it (free
   * OpenStreetMap Nominatim) into a readable address + emirate and saving the
   * coordinates for precise inspector navigation.
   */
  async function shareLocation() {
    if (locating || loading || locked || cooldown > 0) return;

    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo) {
      noteLocationUnavailable(
        "Your browser doesn't support location sharing — please enter your address in the box below.",
      );
      return;
    }
    // Geolocation only works over HTTPS (or localhost). On an insecure http
    // origin the browser blocks it silently, so guide the customer instead.
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      noteLocationUnavailable(
        "Live location needs a secure (https) connection — please enter your address in the box below.",
      );
      return;
    }
    setLocating(true);
    geo.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
        let city = "";
        let emirate = "";
        let country = "";
        let place = "";
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
            { headers: { Accept: "application/json" } },
          );
          if (r.ok) {
            const j = (await r.json()) as { address?: Record<string, string> };
            const a = j.address ?? {};
            emirate = a.state || a.region || a.county || "";
            city = a.city || a.town || a.village || "";
            country = a.country || "";
            const parts = [a.road, a.neighbourhood, a.suburb, city].filter(
              (p): p is string => Boolean(p),
            );
            place = [...new Set(parts)].join(", ");
          }
        } catch {
          /* reverse geocode is best-effort; the map pin still works on its own */
        }
        setLocating(false);
        const formattedAddress =
          [place, emirate].filter(Boolean).join(", ") || "My current location";
        await handleLocationSelect({
          formattedAddress,
          lat,
          lng,
          city: city || undefined,
          emirate: emirate || undefined,
          country: country || undefined,
          mapUrl,
        });
      },
      (err) => {
        setLocating(false);
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location permission is turned off. Please allow location for this site in your browser, or enter your address in the box below."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Your location isn't available right now — please enter your address in the box below."
              : "Getting your location took too long — please try again, or enter your address in the box below.";
        noteLocationUnavailable(message);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  /** Re-sends the conversation after a rate-limit cooldown. */
  async function retry() {
    if (loading || cooldown > 0) return;
    // Drop the "assistant is busy" notice, then replay the same history.
    const history = messages.filter((_, i) => i !== messages.length - 1);
    setMessages(history);
    await runTurn(history);
  }

  async function confirmBooking() {
    if (!booking) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/inspection/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: booking.customerName,
          customerMobile: booking.customerMobile,
          customerEmail: booking.customerEmail,
          vin: booking.vin || undefined,
          make: booking.make || undefined,
          model: booking.model || undefined,
          year: booking.year ? Number(booking.year) : undefined,
          notes: booking.notes || undefined,
          address: booking.address,
          city: booking.city || sharedLocation?.city || undefined,
          emirate: booking.emirate || sharedLocation?.emirate || undefined,
          lat: sharedLocation?.lat,
          lng: sharedLocation?.lng,
          date: booking.date || undefined,
          slot: booking.slot || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const bookingResult = data as InspectionBookingResult;
        if (bookingResult.payUrl) {
          // Online payment enabled — hand off to the hosted checkout page.
          window.location.href = bookingResult.payUrl;
          return;
        }
        setResult(bookingResult);
      } else if (res.status === 401 && data.loginRequired) {
        setShowOtp(true); // verify mobile, then retry
      } else {
        setError(data.error || "Could not create your booking. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Shared inner pieces ─────────────────────────────────────────────── */

  const transcript = (
    <div
      ref={scrollRef}
      className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
      style={isModal ? undefined : { minHeight: "340px", maxHeight: "58vh" }}
    >
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

      {locked && booking && !result && (
        <LockedSummary
          booking={booking}
          fee={fee}
          submitting={submitting}
          error={error}
          onConfirm={confirmBooking}
        />
      )}

      {result && (
        <ConfirmationCard
          result={result}
          name={booking?.customerName || ""}
          email={booking?.customerEmail || ""}
          modal={isModal}
          onClose={onClose}
        />
      )}
    </div>
  );

  const lastMsg = messages[messages.length - 1];
  const askingLocation =
    !!lastMsg &&
    lastMsg.role === "assistant" &&
    /emirate|\blocation\b|street address|inspection address|full address|\bwhere\b/i.test(
      lastMsg.content,
    );

  const inputBar =
    !locked && !result ? (
      <div className="border-t border-neutral-100 p-4">
        {cooldown > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              Assistant is busy — retry in <span className="font-semibold">{cooldown}s</span>
            </p>
            <button
              type="button"
              onClick={onFallback}
              className="shrink-0 text-xs font-semibold text-amber-900 underline underline-offset-2"
            >
              Fill a form
            </button>
          </div>
        )}

        {cooldown === 0 && !loading && lastTurnBusy && (
          <button
            type="button"
            onClick={retry}
            className="mb-3 w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            Try again
          </button>
        )}

        {askingLocation && (
          <div className="mb-3 space-y-2">
            <LocationPicker
              onSelect={handleLocationSelect}
              disabled={loading || cooldown > 0}
            />
            <button
              type="button"
              onClick={shareLocation}
              disabled={locating || loading || cooldown > 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {locating ? "Getting your location…" : "Share my current location"}
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={cooldown > 0 ? `Please wait ${cooldown}s…` : "Type your answer… (Shift+Enter for new line)"}
            autoFocus
            disabled={loading || cooldown > 0}
            className="max-h-32 min-h-[42px] min-w-0 flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none [field-sizing:content] focus:border-red-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || cooldown > 0 || !input.trim()}
            className="shrink-0 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <button
          type="button"
          onClick={onFallback}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-neutral-400 bg-white px-4 py-3 text-sm font-bold text-neutral-900 transition-colors hover:border-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h8" />
          </svg>
          Fill a form instead
        </button>
      </div>
    ) : null;

  /* ── Customer OTP login modal ────────────────────────────────────────── */

  const otpModal = showOtp ? (
    <CustomerOtpModal
      mobile={booking?.customerMobile || ""}
      onClose={() => setShowOtp(false)}
      onVerified={() => {
        setShowOtp(false);
        void confirmBooking();
      }}
    />
  ) : null;

  /* ── Modal popup layout ──────────────────────────────────────────────── */

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
        {otpModal}
        <div className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[600px] sm:rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
              <h2 className="font-semibold text-neutral-900">Book Your Inspection</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {transcript}
          {inputBar}
        </div>
      </div>
    );
  }

  /* ── Standalone full-page layout ─────────────────────────────────────── */

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      {otpModal}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/inspection" aria-label="Inspection home">
            <BrandLogo size="sm" />
          </Link>
          <Link
            href="/inspection"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-5 py-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {/* Title */}
          <div className="border-b border-neutral-100 px-5 py-4">
            <h1 className="text-lg font-bold text-neutral-900">Book Your Inspection</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Choose one below. You pay securely online at the end.
            </p>
            <div className="mt-3">
              <BookingModeSwitch mode="chat" onChange={() => onFallback()} />
            </div>
          </div>

          {transcript}
          {inputBar}
        </div>

        {/* Sidebar (matches the form wizard) */}
        <aside className="hidden h-fit rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:block">
          <h2 className="text-sm font-semibold text-neutral-900">Why Book With Us?</h2>
          <ul className="mt-4 space-y-3 text-sm text-neutral-600">
            {[
              "Expert Inspectors",
              "300+ Inspection Points",
              "Advanced Equipment",
              "Digital Report in 24 Hrs",
              "100% Confidential",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl bg-neutral-50 p-4 text-center">
            <p className="text-xs font-medium text-neutral-500">Inspection fee</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{fee}</p>
          </div>
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-xs leading-relaxed text-red-900">
            🔒 Secure online payment. Your booking goes live to our inspection partners
            only after payment is confirmed.
          </div>
        </aside>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------------- */

function LockedSummary({
  booking,
  fee,
  submitting,
  error,
  onConfirm,
}: {
  booking: BookingDetails;
  fee: string;
  submitting: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const car = [booking.year || "", booking.make, booking.model].filter(Boolean).join(" ") || "—";
  const place = [booking.address, booking.city, booking.emirate].filter(Boolean).join(", ") || "—";
  const when = booking.date ? `${booking.date} · ${booking.slot || ""}`.trim() : "—";

  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 className="text-sm font-bold text-neutral-900">Review &amp; lock your booking</h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        These details are locked. Confirm to book, or use the form to start over.
      </p>

      <dl className="mt-4 divide-y divide-neutral-100">
        <Row label="Name" value={booking.customerName || "—"} />
        <Row label="Mobile" value={booking.customerMobile || "—"} />
        <Row label="Email" value={booking.customerEmail || "—"} />
        <Row label="Vehicle" value={car} />
        {booking.vin && <Row label="VIN" value={booking.vin} />}
        <Row label="Location" value={place} />
        <Row label="Date & Time" value={when} />
        {booking.notes && <Row label="Notes" value={booking.notes} />}
        <Row label="Inspection fee" value={fee} />
      </dl>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={submitting}
        className="mt-4 w-full rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Locking your booking…" : "Confirm & Lock Booking"}
      </button>
      <p className="mt-2 text-center text-[11px] text-neutral-500">
        🔒 You&apos;ll be taken to Stripe&apos;s secure checkout to pay the inspection fee.
      </p>
    </div>
  );
}

function ConfirmationCard({
  result,
  name,
  email,
  modal,
  onClose,
}: {
  result: InspectionBookingResult;
  name: string;
  email: string;
  modal: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-neutral-900">Booking Confirmed!</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Thanks {name.split(" ")[0] || ""}, your inspection is locked in.
      </p>

      <div className="mt-5 rounded-xl bg-neutral-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Your Job ID</p>
        <p className="mt-1 text-2xl font-bold tracking-wider text-red-700">{result.jobCode}</p>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        A confirmation has been sent to <span className="font-medium">{email}</span>. Our team will
        contact you to finalise the appointment.
      </p>

      {modal ? (
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          Done
        </button>
      ) : (
        <div className="mt-6 flex gap-3">
          <Link
            href="/inspection"
            className="flex-1 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Done
          </Link>
          <Link
            href="/inspection/book"
            className="flex-1 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Book another
          </Link>
        </div>
      )}
    </div>
  );
}

/* --- small helpers --------------------------------------------------------- */

function Bubble({ role, children }: { role: ChatMessage["role"]; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "rounded-br-sm bg-red-600 text-white"
            : "rounded-bl-sm bg-neutral-100 text-neutral-800"
        }`}
      >
        {typeof children === "string" ? linkify(children, isUser) : children}
      </div>
    </div>
  );
}

/** Turns any URL in a chat message into a tappable link (Google Maps pins show
 *  as a friendly "View on map" link). */
function linkify(text: string, onDark: boolean): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const isMap = /(google\.[^/]*\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(part);
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`font-medium underline underline-offset-2 ${
          onDark ? "text-white" : "text-red-600"
        } ${isMap ? "" : "break-all"}`}
      >
        {isMap ? "📍 View on map ↗" : part}
      </a>
    );
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
