"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { normaliseTarget, verificationKey, type VerifyChannel } from "@/lib/contactValidation";
import { FIREBASE_PHONE_ENABLED, firebaseErrorMessage, getFirebaseAuth } from "@/lib/firebaseClient";

/**
 * An email or UAE-mobile input with built-in ownership verification:
 * "Send code" → 6-digit code → "Verified ✓". Proof tokens are stored by the
 * parent in a map keyed by `channel:normalisedValue`, so two fields holding
 * the same value (e.g. company email = PoC email) share one verification, and
 * editing a verified value automatically un-verifies it.
 *
 * Mobile codes use Firebase Phone Auth (same as customer booking) whenever the
 * NEXT_PUBLIC_FIREBASE_* config is present: the SMS is sent and checked in the
 * browser and /api/verify/firebase turns the Firebase ID token into a proof.
 * Without Firebase config (local dev) the server flow shows a dev code.
 */
export default function VerifyField({
  channel,
  label,
  value,
  onChange,
  proofs,
  onProof,
  placeholder,
  required = false,
  disabled = false,
  id,
}: {
  channel: VerifyChannel;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  proofs: Record<string, string>;
  onProof: (key: string, proof: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const recaptchaHostRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const useFirebase = channel === "sms" && FIREBASE_PHONE_ENABLED;

  const normalised = normaliseTarget(channel, value);
  const key = normalised ? verificationKey(channel, normalised) : null;
  const verified = !!(key && proofs[key]);
  const awaitingCode = !!normalised && sentTo === normalised && !verified;

  function resetVerifier() {
    try {
      verifierRef.current?.clear();
    } catch {
      /* already cleared */
    }
    verifierRef.current = null;
  }
  useEffect(() => resetVerifier, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendWithFirebase(target: string) {
    try {
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      const auth = await getFirebaseAuth();
      resetVerifier();
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaHostRef.current!, { size: "invisible" });
      confirmationRef.current = await signInWithPhoneNumber(auth, target, verifierRef.current);
      setSentTo(target);
      setCode("");
      setCooldown(30);
      setInfo(`We sent a 6-digit code by SMS to ${target}.`);
    } catch (err) {
      resetVerifier();
      confirmationRef.current = null;
      setError(firebaseErrorMessage(err));
    }
  }

  async function checkWithFirebase(target: string) {
    if (!confirmationRef.current) {
      setError("Please request a new code.");
      setSentTo(null);
      return;
    }
    try {
      const result = await confirmationRef.current.confirm(code);
      const idToken = await result.user.getIdToken();
      const res = await fetch("/api/verify/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      // Only our proof matters; never keep a Firebase browser session around.
      try {
        const { signOut } = await import("firebase/auth");
        await signOut(await getFirebaseAuth());
      } catch {
        /* best effort */
      }
      if (!res.ok || !data.ok || !data.proof) {
        setError(data.error || "Verification failed — please try again.");
        return;
      }
      if (data.target !== target) {
        setError("The verified number doesn't match this field. Please try again.");
        return;
      }
      onProof(verificationKey("sms", target), data.proof);
      confirmationRef.current = null;
      resetVerifier();
      setSentTo(null);
      setCode("");
      setInfo("");
    } catch (err) {
      setError(firebaseErrorMessage(err));
    }
  }

  async function send() {
    if (!normalised || busy) return;
    setBusy("send");
    setError("");
    setInfo("");
    setDevCode("");
    if (useFirebase) {
      await sendWithFirebase(normalised);
      setBusy(null);
      return;
    }
    try {
      const res = await fetch("/api/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target: normalised }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSentTo(normalised);
        setCode("");
        setCooldown(Number(data.resendInSec) || 30);
        setInfo(channel === "email" ? `We emailed a 6-digit code to ${normalised}.` : `We sent a 6-digit code by SMS to ${normalised}.`);
        if (data.devCode) setDevCode(String(data.devCode));
      } else {
        const wait = Number(res.headers.get("Retry-After"));
        if (wait > 0) setCooldown(wait);
        setError(data.error || "Couldn't send the code. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    if (!normalised || busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy("check");
    setError("");
    if (useFirebase) {
      await checkWithFirebase(normalised);
      setBusy(null);
      return;
    }
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target: normalised, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.proof) {
        onProof(verificationKey(channel, data.target || normalised), data.proof);
        setSentTo(null);
        setCode("");
        setInfo("");
        setDevCode("");
      } else {
        setError(data.error || "That code didn't work. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 disabled:bg-neutral-50";
  const showFormatHint = value.trim().length > 0 && !normalised;

  return (
    <div>
      {useFirebase && <div ref={recaptchaHostRef} />}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-neutral-700">{label}</label>
        {normalised && (
          verified ? (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">Verified ✓</span>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Not verified</span>
          )
        )}
      </div>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setError("");
          }}
          type={channel === "email" ? "email" : "tel"}
          inputMode={channel === "email" ? "email" : "tel"}
          autoComplete={channel === "email" ? "email" : "tel"}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={`${inputCls} ${verified ? "border-green-400" : ""}`}
        />
        {!verified && (
          <button
            type="button"
            onClick={send}
            disabled={!normalised || disabled || busy !== null || cooldown > 0}
            className="shrink-0 rounded-md border border-red-600 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-transparent"
          >
            {busy === "send" ? "Sending…" : cooldown > 0 && awaitingCode ? `Resend ${cooldown}s` : awaitingCode ? "Resend" : cooldown > 0 ? `Wait ${cooldown}s` : "Send code"}
          </button>
        )}
      </div>

      {showFormatHint && (
        <p className="mt-1 text-xs text-neutral-500">
          {channel === "email" ? "Enter a valid email address." : "UAE mobile only, e.g. 05X XXX XXXX or +9715XXXXXXXX."}
        </p>
      )}

      {awaitingCode && (
        <div className="mt-2 rounded-md bg-neutral-50 p-3">
          {info && <p className="mb-2 text-xs text-neutral-600">{info}</p>}
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void check();
                }
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              aria-label="Verification code"
              className={`${inputCls} tracking-[0.3em]`}
            />
            <button
              type="button"
              onClick={check}
              disabled={busy !== null || code.length !== 6}
              className="shrink-0 rounded-md bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "check" ? "Checking…" : "Verify"}
            </button>
          </div>
          {devCode && <p className="mt-2 text-[11px] text-neutral-400">Dev mode — code: <span className="font-mono">{devCode}</span></p>}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
