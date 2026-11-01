"use client";

import { useState } from "react";
import VerifyField from "./VerifyField";
import { normaliseEmail, verificationKey } from "@/lib/contactValidation";

/**
 * Booking step: verify the customer's email with a 6-digit code. Done once
 * per customer account — the verified email is saved and reused next time.
 */
export default function CustomerEmailVerifyModal({
  email: initialEmail,
  onClose,
  onVerified,
}: {
  email: string;
  onClose: () => void;
  onVerified: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const normalised = normaliseEmail(email);
  const proof = normalised ? proofs[verificationKey("email", normalised)] : undefined;

  async function save(proofToken: string, value: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customer/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, proofs: [proofToken] }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) onVerified(value);
      else setError(data.error || "Could not save your email. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="email-verify-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="email-verify-title" className="text-lg font-bold text-neutral-900">Verify your email</h2>
            <p className="mt-1 text-sm text-neutral-500">
              We&apos;ll send your booking confirmation and inspection report here. Enter the 6-digit code we email you — you only need to do this once.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">✕</button>
        </div>

        <div className="mt-5">
          <VerifyField
            channel="email"
            id="booking-email"
            label="Email"
            value={email}
            onChange={setEmail}
            proofs={proofs}
            onProof={(k, p) => {
              setProofs((c) => ({ ...c, [k]: p }));
              const value = k.slice("email:".length);
              void save(p, value);
            }}
            required
          />
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {proof && !error && (
          <p className="mt-3 text-sm text-green-700">{busy ? "Saving…" : "Email verified — continuing your booking…"}</p>
        )}
        {proof && error && normalised && (
          <button
            onClick={() => void save(proof, normalised)}
            disabled={busy}
            className="mt-3 w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
