"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import CustomerOtpModal from "./CustomerOtpModal";
import BookingModeSwitch from "./BookingModeSwitch";
import LocationPicker from "./LocationPicker";
import { useInspectionFee } from "./useInspectionFee";
import type {
  InspectionBookingResult,
  SelectedLocation,
  VinDecodeResult,
} from "@/lib/types";

/**
 * Public vehicle inspection booking form. Mirrors the AI assistant's questions:
 * 1) your details + car + any other details, 2) location + date + time,
 * then Review and Confirm.
 */

const STEPS = [
  "Your Details & Car",
  "Location, Date & Time",
  "Review",
  "Confirm",
] as const;

const SLOTS = ["09:00 AM", "11:00 AM", "01:00 PM", "03:00 PM", "05:00 PM"];
const EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Customer {
  name: string;
  mobile: string;
  email: string;
}
interface Vehicle {
  vin: string;
  make: string;
  model: string;
  year: string;
  bodyClass: string;
  trim: string;
  transmission: string;
  fuelType: string;
}
interface Location {
  address: string;
  city: string;
  emirate: string;
  lat?: number;
  lng?: number;
}
interface Schedule {
  date: string;
  slot: string;
}

export default function InspectionBookingWizard({
  onSwitchToChat,
}: {
  onSwitchToChat?: () => void;
}) {
  const fee = useInspectionFee();
  const [step, setStep] = useState(0); // 0-indexed step; STEPS.length = confirmed screen
  const [customer, setCustomer] = useState<Customer>({ name: "", mobile: "", email: "" });
  const [vehicle, setVehicle] = useState<Vehicle>({
    vin: "",
    make: "",
    model: "",
    year: "",
    bodyClass: "",
    trim: "",
    transmission: "",
    fuelType: "",
  });
  const [location, setLocation] = useState<Location>({ address: "", city: "", emirate: "" });
  const [notes, setNotes] = useState("");
  const [schedule, setSchedule] = useState<Schedule>({ date: "", slot: "" });

  const [decoding, setDecoding] = useState(false);
  const [decodeMsg, setDecodeMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InspectionBookingResult | null>(null);
  const [showOtp, setShowOtp] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  // --- validation per step ------------------------------------------------
  function stepValid(s: number): boolean {
    switch (s) {
      case 0:
        return (
          customer.name.trim().length > 1 &&
          customer.mobile.trim().length >= 7 &&
          EMAIL_RE.test(customer.email.trim()) &&
          vehicle.make.trim().length > 0 &&
          vehicle.model.trim().length > 0 &&
          /^\d{4}$/.test(vehicle.year.trim())
        );
      case 1:
        return (
          location.address.trim().length > 3 &&
          location.emirate.trim().length > 0 &&
          schedule.date.trim().length > 0 &&
          schedule.slot.trim().length > 0
        );
      default:
        return true;
    }
  }

  async function decodeVin() {
    const vin = vehicle.vin.trim().toUpperCase();
    if (vin.length < 5) {
      setDecodeMsg("Enter a valid chassis number (VIN).");
      return;
    }
    setDecoding(true);
    setDecodeMsg("");
    try {
      const res = await fetch("/api/sell/vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin }),
      });
      const data: VinDecodeResult = await res.json();
      if (data.decoded) {
        setVehicle((v) => ({
          ...v,
          vin,
          make: data.make || v.make,
          model: data.model || v.model,
          year: data.year ? String(data.year) : v.year,
          bodyClass: data.bodyClass || v.bodyClass,
          trim: data.trim || v.trim,
          transmission: data.transmission || v.transmission,
          fuelType: data.fuelType || v.fuelType,
        }));
        setDecodeMsg(
          data.partial
            ? "Found the make and year — please confirm the model below."
            : "Vehicle details decoded. Please confirm below.",
        );
      } else {
        setDecodeMsg(`${data.message || "Couldn't decode that VIN."} Please enter details manually.`);
      }
    } catch {
      setDecodeMsg("Network error decoding the VIN. Please enter details manually.");
    } finally {
      setDecoding(false);
    }
  }

  function next() {
    if (!stepValid(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/inspection/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.name.trim(),
          customerMobile: customer.mobile.trim(),
          customerEmail: customer.email.trim(),
          vin: vehicle.vin.trim() || undefined,
          make: vehicle.make.trim() || undefined,
          model: vehicle.model.trim() || undefined,
          year: vehicle.year.trim() ? Number(vehicle.year) : undefined,
          bodyClass: vehicle.bodyClass.trim() || undefined,
          trim: vehicle.trim.trim() || undefined,
          transmission: vehicle.transmission.trim() || undefined,
          fuelType: vehicle.fuelType.trim() || undefined,
          notes: notes.trim() || undefined,
          address: location.address.trim(),
          city: location.city.trim() || undefined,
          emirate: location.emirate.trim() || undefined,
          lat: location.lat,
          lng: location.lng,
          date: schedule.date || undefined,
          slot: schedule.slot || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const booking = data as InspectionBookingResult;
        if (booking.payUrl) {
          // Online payment enabled — hand off to the hosted checkout page.
          window.location.href = booking.payUrl;
          return;
        }
        setResult(booking);
        setStep(STEPS.length); // -> confirmation screen
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

  const confirmed = step >= STEPS.length && result;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      {showOtp && (
        <CustomerOtpModal
          mobile={customer.mobile.trim()}
          onClose={() => setShowOtp(false)}
          onVerified={() => {
            setShowOtp(false);
            void submit();
          }}
        />
      )}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/inspection" aria-label="Inspection home">
            <BrandLogo size="sm" />
          </Link>
          <Link href="/inspection" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
            Cancel
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        {confirmed ? (
          <Confirmation result={result!} customer={customer} />
        ) : (
          <>
            {/* Stepper */}
            <ol className="mb-8 flex items-center justify-between gap-1 overflow-x-auto">
              {STEPS.map((label, i) => (
                <li key={label} className="flex flex-1 min-w-[80px] flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <span className={`hidden h-0.5 flex-1 sm:block ${i === 0 ? "opacity-0" : i <= step ? "bg-red-500" : "bg-neutral-200"}`} />
                    <span
                      className={`mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        i < step
                          ? "border-red-600 bg-red-600 text-white"
                          : i === step
                            ? "border-red-600 bg-white text-red-600"
                            : "border-neutral-300 bg-white text-neutral-400"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </span>
                    <span className={`hidden h-0.5 flex-1 sm:block ${i === STEPS.length - 1 ? "opacity-0" : i < step ? "bg-red-500" : "bg-neutral-200"}`} />
                  </div>
                  <span className={`mt-1.5 text-[11px] font-medium ${i === step ? "text-red-600" : "text-neutral-500"}`}>
                    {label}
                  </span>
                </li>
              ))}
            </ol>

            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              {/* Form card */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h1 className="text-xl font-bold text-neutral-900">Book Your Vehicle Inspection</h1>
                {onSwitchToChat && (
                  <div className="mt-3">
                    <BookingModeSwitch mode="form" onChange={() => onSwitchToChat()} />
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
                    {step + 1}
                  </span>
                  {STEPS[step]}
                </div>

                <div className="mt-6">
                  {step === 0 && (
                    <div className="space-y-8">
                      <section>
                        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Your details</h2>
                        <CustomerStep value={customer} onChange={setCustomer} />
                      </section>
                      <section>
                        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Your car</h2>
                        <VehicleStep
                          value={vehicle}
                          onChange={setVehicle}
                          onDecode={decodeVin}
                          decoding={decoding}
                          decodeMsg={decodeMsg}
                          notes={notes}
                          onNotes={setNotes}
                        />
                      </section>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="space-y-8">
                      <section>
                        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Where is the car?</h2>
                        <LocationStep value={location} onChange={setLocation} />
                      </section>
                      <section>
                        <h2 className="mb-3 text-sm font-semibold text-neutral-900">When?</h2>
                        <ScheduleStep value={schedule} onChange={setSchedule} minDate={today} />
                      </section>
                    </div>
                  )}
                  {step === 2 && (
                    <ReviewStep
                      customer={customer}
                      vehicle={vehicle}
                      location={location}
                      schedule={schedule}
                      notes={notes}
                      fee={fee}
                    />
                  )}
                  {step === 3 && <ConfirmStep />}
                </div>

                {error && (
                  <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                {/* Nav */}
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={back}
                    disabled={step === 0}
                    className="rounded-md px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Back
                  </button>
                  {step < STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={next}
                      disabled={!stepValid(step)}
                      className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save &amp; Continue
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting}
                      className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Booking…" : "Confirm Booking"}
                    </button>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <aside className="hidden h-fit rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:block">
                <h2 className="text-sm font-semibold text-neutral-900">Why Book With Us?</h2>
                <ul className="mt-4 space-y-3 text-sm text-neutral-600">
                  <SideItem>Expert Inspectors</SideItem>
                  <SideItem>300+ Inspection Points</SideItem>
                  <SideItem>Advanced Equipment</SideItem>
                  <SideItem>Digital Report in 24 Hrs</SideItem>
                  <SideItem>100% Confidential</SideItem>
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
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// --- Steps ------------------------------------------------------------------

function CustomerStep({ value, onChange }: { value: Customer; onChange: (v: Customer) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Full Name" required>
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Enter your full name"
          className={inputCls}
        />
      </Field>
      <Field label="Mobile Number" required>
        <input
          value={value.mobile}
          onChange={(e) => onChange({ ...value, mobile: e.target.value })}
          placeholder="Enter mobile number"
          inputMode="tel"
          className={inputCls}
        />
      </Field>
      <Field label="Email Address" required>
        <input
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          placeholder="Enter email address"
          inputMode="email"
          className={inputCls}
        />
      </Field>
      <p className="text-[11px] text-neutral-400">
        🔒 Your information is safe with us and only used for this booking.
      </p>
    </div>
  );
}

function VehicleStep({
  value,
  onChange,
  // TODO: VIN decode is hidden for now; uncomment the VIN block below to re-enable.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDecode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  decoding,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  decodeMsg,
  notes,
  onNotes,
}: {
  value: Vehicle;
  onChange: (v: Vehicle) => void;
  onDecode: () => void;
  decoding: boolean;
  decodeMsg: string;
  notes: string;
  onNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Make" required>
          <input value={value.make} onChange={(e) => onChange({ ...value, make: e.target.value })} placeholder="e.g. Toyota" className={inputCls} />
        </Field>
        <Field label="Model" required>
          <input value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="e.g. Corolla" className={inputCls} />
        </Field>
        <Field label="Year" required>
          <input value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="e.g. 2019" inputMode="numeric" className={inputCls} />
        </Field>
      </div>

      {/* TODO: VIN decode is hidden for now. Uncomment this block to bring it back.
      <Field label="Chassis Number (VIN) — optional">
        <div className="flex gap-2">
          <input
            value={value.vin}
            onChange={(e) => onChange({ ...value, vin: e.target.value.toUpperCase() })}
            placeholder="Enter VIN to auto-fill make, model and year"
            maxLength={17}
            className={`${inputCls} uppercase tracking-wide`}
          />
          <button
            type="button"
            onClick={onDecode}
            disabled={decoding}
            className="shrink-0 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {decoding ? "Decoding…" : "Decode"}
          </button>
        </div>
      </Field>
      {decodeMsg && <p className="text-xs text-neutral-500">{decodeMsg}</p>}
      */}

      <Field label="Any other details — optional">
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Anything we should know about the car or your availability"
          rows={3}
          className={inputCls}
        />
      </Field>
    </div>
  );
}

function LocationStep({ value, onChange }: { value: Location; onChange: (v: Location) => void }) {
  const pick = useCallback(
    (loc: SelectedLocation) => {
      onChange({
        address: loc.formattedAddress,
        city: loc.city ?? "",
        emirate: matchEmirate(loc.emirate) || value.emirate,
        lat: loc.lat,
        lng: loc.lng,
      });
    },
    [onChange, value.emirate],
  );

  return (
    <div className="space-y-4">
      <Field label="Search your address">
        <LocationPicker onSelect={pick} />
      </Field>
      <Field label="Address" required>
        <textarea
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value, lat: undefined, lng: undefined })}
          placeholder="Building / street / area where the car will be"
          rows={3}
          className={inputCls}
        />
      </Field>
      <Field label="Emirate" required>
        <select value={value.emirate} onChange={(e) => onChange({ ...value, emirate: e.target.value })} className={inputCls}>
          <option value="">Select…</option>
          {EMIRATES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/** Maps a geocoder's state name ("Dubai Emirate", "Ras al-Khaimah") to our emirate list. */
function matchEmirate(raw?: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const r = norm(raw ?? "");
  return r ? (EMIRATES.find((e) => r.includes(norm(e))) ?? "") : "";
}

function ScheduleStep({ value, onChange, minDate }: { value: Schedule; onChange: (v: Schedule) => void; minDate: string }) {
  return (
    <div className="space-y-5">
      <Field label="Preferred Date" required>
        <input
          type="date"
          min={minDate}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className={inputCls}
        />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">
          Preferred Time <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...value, slot: s })}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                value.slot === s
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-neutral-300 text-neutral-700 hover:border-red-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  customer,
  vehicle,
  location,
  schedule,
  notes,
  fee,
}: {
  customer: Customer;
  vehicle: Vehicle;
  location: Location;
  schedule: Schedule;
  notes: string;
  fee: string;
}) {
  const car = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—";
  const when = schedule.date ? `${schedule.date} · ${schedule.slot || ""}`.trim() : "—";
  const place = [location.address, location.city, location.emirate].filter(Boolean).join(", ") || "—";
  return (
    <dl className="divide-y divide-neutral-100">
      <ReviewRow label="Name" value={customer.name} />
      <ReviewRow label="Mobile" value={customer.mobile} />
      <ReviewRow label="Email" value={customer.email} />
      <ReviewRow label="Vehicle" value={car} />
      {vehicle.vin && <ReviewRow label="VIN" value={vehicle.vin} />}
      <ReviewRow label="Location" value={place} />
      <ReviewRow label="Date & Time" value={when} />
      {notes.trim() && <ReviewRow label="Notes" value={notes.trim()} />}
      <ReviewRow label="Inspection fee" value={fee} />
    </dl>
  );
}

function ConfirmStep() {
  return (
    <div className="rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
      <p className="font-medium text-neutral-800">Almost done!</p>
      <p className="mt-1">
        By confirming, you&apos;ll be taken to Stripe&apos;s secure checkout to pay the
        inspection fee. Once payment is confirmed you&apos;ll receive a Job ID and a
        confirmation via SMS, email and WhatsApp.
      </p>
    </div>
  );
}

function Confirmation({ result, customer }: { result: InspectionBookingResult; customer: Customer }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-neutral-900">Booking Confirmed!</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Thanks {customer.name.split(" ")[0] || ""}, your inspection is booked.
      </p>

      <div className="mt-5 rounded-xl bg-neutral-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Your Job ID</p>
        <p className="mt-1 text-2xl font-bold tracking-wider text-red-700">{result.jobCode}</p>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        A confirmation has been sent to <span className="font-medium">{customer.email}</span>.
        Our team will contact you to finalise the appointment.
      </p>

      <div className="mt-6 flex gap-3">
        <Link href="/inspection" className="flex-1 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
          Done
        </Link>
        <Link href="/inspection/book" className="flex-1 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700">
          Book another
        </Link>
      </div>
    </div>
  );
}

// --- small helpers ----------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

function SideItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-600">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children}
    </li>
  );
}
