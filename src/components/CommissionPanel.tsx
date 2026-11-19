"use client";

import { useCallback, useEffect, useState } from "react";
import { computeSplit, fmtAed, type CommissionType } from "@/lib/commission";

/**
 * Set / change one company's commission (percentage of the VAT-exclusive amount, or a fixed AED amount)
 * and see every past change. Used by the Super Admin (company page) and the Account Manager (own companies).
 */

interface HistoryRow {
  id: string;
  label: string;
  previousLabel: string | null;
  note: string | null;
  by: string | null;
  role: string | null;
  at: string;
  active: boolean;
}

interface Payload {
  company: { id: string; name: string };
  current: { type: CommissionType; value: number; label: string } | null;
  history: HistoryRow[];
}

const ROLE: Record<string, string> = { admin: "Admin", account_manager: "Account Manager" };
const EXAMPLE_GROSS_FILS = 42000; // AED 420 incl. VAT, the worked example agreed with the client

export default function CommissionPanel({
  companyId,
  as,
  onChanged,
  onUnauthorized,
}: {
  companyId: string;
  as: "admin" | "manager";
  onChanged?: () => void;
  onUnauthorized?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [type, setType] = useState<CommissionType>("percentage");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/commission/${companyId}`, { headers: { "x-review-as": as } });
    if (res.status === 401) return onUnauthorized?.();
    if (res.ok) {
      const d: Payload = await res.json();
      setData(d);
      if (d.current) {
        setType(d.current.type);
        setAmount(String(d.current.type === "percentage" ? d.current.value / 100 : d.current.value / 100));
      }
    }
  }, [companyId, as, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const n = Number(amount);
  const preview =
    amount !== "" && Number.isFinite(n) && n > 0
      ? computeSplit(EXAMPLE_GROSS_FILS, { type, value: Math.round(n * 100) })
      : null;

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/commission/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-review-as": as },
        body: JSON.stringify({ type, amount: n, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) return onUnauthorized?.();
      if (!res.ok) return setError(d.error || "Could not save the commission.");
      setNote("");
      setSaved(true);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-neutral-400">Loading…</p>;

  const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Current commission</p>
        {data.current ? (
          <p className="mt-1 text-3xl font-bold text-neutral-900">
            {data.current.label}
            <span className="ml-2 text-sm font-normal text-neutral-500">{data.current.type === "percentage" ? "of the amount excluding VAT" : "per inspection"}</span>
          </p>
        ) : (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Not set — this company <b>cannot accept jobs</b> until a commission is saved.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm font-medium">
            {(["percentage", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-4 py-2.5 ${type === t ? "bg-red-600 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
              >
                {t === "percentage" ? "Percentage %" : "Fixed AED"}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder={type === "percentage" ? "e.g. 15" : "e.g. 50"}
              className={input}
              aria-label="Commission amount"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{type === "percentage" ? "%" : "AED"}</span>
          </div>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. agreed on call" className={`${input} mt-3`} />

        {preview && (
          <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
            {preview.ok ? (
              <>
                <p className="mb-1 font-semibold text-neutral-700">Example: customer pays AED {fmtAed(preview.split.grossFils)} (VAT included)</p>
                <p>
                  VAT AED {fmtAed(preview.split.vatFils)} → amount AED {fmtAed(preview.split.netFils)} → Wheeler Dealers <b>AED {fmtAed(preview.split.commissionFils)}</b> · company <b>AED {fmtAed(preview.split.partnerFils)}</b>
                </p>
              </>
            ) : (
              <p className="text-red-600">{preview.error}</p>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Saved. It applies to jobs the company accepts from now on; jobs already accepted keep their old rate.</p>}
        <button
          onClick={save}
          disabled={busy || !amount || !(n > 0)}
          className="mt-4 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : data.current ? "Change commission" : "Set commission"}
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Change history</p>
        {data.history.length === 0 ? (
          <p className="text-sm text-neutral-400">No commission has been set yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
                <span>
                  <b className="text-neutral-900">{h.label}</b>
                  {h.previousLabel && <span className="ml-2 text-neutral-400">was {h.previousLabel}</span>}
                  {h.active && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">current</span>}
                  <span className="ml-2 text-neutral-600">by {h.by ?? "—"}{h.role ? ` (${ROLE[h.role] ?? h.role})` : ""}</span>
                  {h.note && <span className="block text-xs text-neutral-500">“{h.note}”</span>}
                </span>
                <span className="text-xs text-neutral-500">{new Date(h.at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
