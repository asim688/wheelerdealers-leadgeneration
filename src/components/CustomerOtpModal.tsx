"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { FIREBASE_PHONE_ENABLED, getFirebaseAuth } from "@/lib/firebaseClient";
import { normaliseMobile } from "@/lib/phone";

/**
 * CustomerOtpModal
 * ---------------------------------------------------------------------------
 * Mobile-number OTP login shown when a booking requires a verified customer.
 * Flow: request code → enter 6-digit code → verify → onVerified() (caller
 * retries the booking).
 *
 * When the NEXT_PUBLIC_FIREBASE_* config is present, Firebase Phone Auth sends
 * and checks the SMS in the browser (UAE numbers only) and our server verifies
 * the resulting ID token. Otherwise the server-side OTP flow is used; in dev
 * with no SMS provider the API returns devCode for easy testing.
 */

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return "That mobile number doesn't look right. Please check it and try again.";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/invalid-verification-code":
      return "Incorrect code. Please try again.";
    case "auth/code-expired":
      return "That code has expired. Please request a new one.";
    case "auth/captcha-check-failed":
      return "Security check failed. Please refresh the page and try again.";
    case "auth/operation-not-allowed":
      return "SMS verification isn't available for this number right now.";
    case "auth/network-request-failed":
      return "Network error — please check your connection and try again.";
    default:
      return "We couldn't complete the verification. Please try again.";
  }
}

export default function CustomerOtpModal({
  mobile: initialMobile,
  onVerified,
  onClose,
}: {
  mobile?: string;
  onVerified: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"mobile" | "code">("mobile");
  const [mobile, setMobile] = useState(initialMobile ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const recaptchaHostRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function resetVerifier() {
    try {
      verifierRef.current?.clear();
    } catch {
      /* already cleared */
    }
    verifierRef.current = null;
  }

  useEffect(() => resetVerifier, []);

  async function requestFirebaseCode() {
    const e164 = normaliseMobile(mobile);
    if (!e164 || !/^\+9715\d{8}$/.test(e164)) {
      setError("Please enter a UAE mobile number (e.g. 05x xxx xxxx).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      const auth = await getFirebaseAuth();
      resetVerifier();
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaHostRef.current!, { size: "invisible" });
      confirmationRef.current = await signInWithPhoneNumber(auth, e164, verifierRef.current);
      setStep("code");
      setCode("");
    } catch (err) {
      resetVerifier();
      setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyFirebaseCode() {
    if (!confirmationRef.current) {
      setError("Please request a new code.");
      setStep("mobile");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await confirmationRef.current.confirm(code);
      const idToken = await result.user.getIdToken();
      const res = await fetch("/api/customer/otp/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed — please try again.");
        return;
      }
      // Our own session cookie is set; the Firebase session isn't needed.
      try {
        const { signOut } = await import("firebase/auth");
        await signOut(await getFirebaseAuth());
      } catch {
        /* best effort */
      }
      onVerified();
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (FIREBASE_PHONE_ENABLED) {
      await requestFirebaseCode();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customer/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (res.ok) {
        setDevCode(data.devCode ?? null);
        setStep("code");
        setCode("");
      } else {
        setError(data.error || "Could not send the code. Check the mobile number.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (FIREBASE_PHONE_ENABLED) {
      await verifyFirebaseCode();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customer/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code }),
      });
      const data = await res.json();
      if (res.ok) {
        onVerified();
      } else {
        setError(data.error || "Invalid code — please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {/* Host for Firebase's invisible reCAPTCHA; must stay mounted. */}
        <div ref={recaptchaHostRef} />
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Verify your mobile</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {step === "mobile"
                ? "We'll send a one-time code to confirm your booking."
                : `Enter the 6-digit code sent to ${mobile}.`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        {step === "mobile" ? (
          <form onSubmit={requestCode} className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">Mobile number</label>
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
              inputMode="tel"
              placeholder="05x xxx xxxx"
              className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
            />
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5">
            {devCode && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                Dev code: <span className="font-mono font-bold">{devCode}</span>
              </p>
            )}
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">One-time code</label>
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-red-500"
            />
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-4 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
            <div className="mt-3 flex justify-between text-xs">
              <button type="button" onClick={() => setStep("mobile")} className="text-neutral-500 hover:text-neutral-800">
                ← Change number
              </button>
              <button type="button" onClick={() => void requestCode()} disabled={busy} className="font-medium text-red-600 hover:underline disabled:opacity-50">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
