"use client";

import { useEffect, useState } from "react";
import { normaliseTarget, verificationKey, type VerifyChannel } from "@/lib/contactValidation";

/**
 * An email or UAE-mobile input with built-in ownership verification:
 * "Send code" → 6-digit code → "Verified ✓". Proof tokens are stored by the
 * parent in a map keyed by `channel:normalisedValue`, so two fields holding
 * the same value (e.g. company email = PoC email) share one verification, and
 * editing a verified value automatically un-verifies it.
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

  const normalised = normaliseTarget(channel, value);
  const key = normalised ? verificationKey(channel, normalised) : null;
  const verified = !!(key && proofs[key]);
  const awaitingCode = !!normalised && sentTo === normalised && !verified;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    if (!normalised || busy) return;
    setBusy("send");
    setError("");
    setInfo("");
    setDevCode("");
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
