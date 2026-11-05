"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Report review workspace (Account Manager + super admin): job summary, link
 * to the full report preview, audited edits, return-to-inspector, approve
 * (red "Report verified" stamp + delivery to the customer) and activity log.
 */

interface ReviewItem {
  itemKey: string;
  section: string;
  label: string;
  options: string[];
  valueFields: Array<{ key: string; label: string; unit?: string; placeholder: string }>;
  condition: string | null;
  comments: string | null;
  value: Record<string, string> | null;
}

interface ReviewData {
  reviewer: { type: "admin" | "manager"; name: string };
  job: {
    id: string;
    jobCode: string;
    status: string;
    vehicle: string;
    vin: string | null;
    location: string;
    customerName: string;
    scheduledAt: string | null;
    scheduledSlot: string | null;
    reportSubmittedAt: string | null;
    completedAt: string | null;
    company: string | null;
    inspector: { name: string; email: string; phone: string | null } | null;
  };
  report: (Record<string, string | number | null> & {
    verifiedAt: string | null;
    verifiedByName: string | null;
    returnedAt: string | null;
    returnNote: string | null;
  }) | null;
  items: ReviewItem[];
  activity: Array<{ id: string; action: string; detail: string | null; actorType: string; actorName: string | null; createdAt: string }>;
}

const REPORT_FIELDS: Array<{ key: string; label: string; multiline?: boolean; numeric?: boolean }> = [
  { key: "odometerKm", label: "Odometer (km)", numeric: true },
  { key: "odometerStatus", label: "Odometer authenticity" },
  { key: "exteriorColor", label: "Exterior colour" },
  { key: "regionalSpecs", label: "Regional specifications" },
  { key: "engineConfig", label: "Engine configuration" },
  { key: "keysCount", label: "Number of keys", numeric: true },
  { key: "spareTyre", label: "Spare tyre" },
  { key: "diagnosticScan", label: "Diagnostic scan history", multiline: true },
  { key: "summary", label: "Additional observations", multiline: true },
  { key: "limitations", label: "Inspection limitations", multiline: true },
];

const ACTION_LABEL: Record<string, string> = {
  submitted: "Submitted",
  edited: "Edited",
  returned: "Returned to inspector",
  approved: "Verified & sent",
};

function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

type ItemDraft = { condition: string | null; comments: string | null; value: Record<string, string> | null };

export default function ReportReview({
  jobId,
  as,
  onClose,
  onChanged,
}: {
  jobId: string;
  /** Which portal is acting (recorded in the activity log). */
  as: "admin" | "manager";
  onClose: () => void;
  onChanged: () => void;
}) {
  const hdr = { "x-review-as": as };
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "return" | "save">("");
  const [mode, setMode] = useState<"view" | "edit" | "return">("view");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Record<string, ItemDraft>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/review/jobs/${jobId}`, { headers: { "x-review-as": as } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error || "Could not load this report.");
      return;
    }
    setData(d);
    setItems(Object.fromEntries((d.items as ReviewItem[]).map((i) => [i.itemKey, { condition: i.condition, comments: i.comments, value: i.value }])));
    setFields(Object.fromEntries(REPORT_FIELDS.map((f) => [f.key, d.report?.[f.key] == null ? "" : String(d.report[f.key])])));
  }, [jobId, as]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => {
    const map = new Map<string, ReviewItem[]>();
    for (const i of data?.items ?? []) {
      if (!map.has(i.section)) map.set(i.section, []);
      map.get(i.section)!.push(i);
    }
    return Array.from(map.entries());
  }, [data]);

  const canAct = data?.job.status === "report_submitted";

  async function approve() {
    if (!data || !window.confirm(`Verify report ${data.job.jobCode}? It will be stamped "Report verified by The Wheeler Dealers" and sent to the customer.`)) return;
    setBusy("approve");
    setError("");
    const res = await fetch(`/api/review/jobs/${jobId}/approve`, { method: "POST", headers: hdr });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(d.error || "Could not verify the report.");
    setNotice("✅ Report verified and sent to the customer.");
    onChanged();
    await load();
  }

  async function sendBack() {
    setBusy("return");
    setError("");
    const res = await fetch(`/api/review/jobs/${jobId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdr },
      body: JSON.stringify({ note }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(d.error || "Could not return the report.");
    setNotice("Report returned to the inspector for correction.");
    setMode("view");
    setNote("");
    onChanged();
    await load();
  }

  async function saveEdits() {
    if (!data) return;
    const changedItems = data.items
      .filter((i) => {
        const d = items[i.itemKey];
        return d && (d.condition !== i.condition || (d.comments ?? "") !== (i.comments ?? "") || JSON.stringify(d.value ?? null) !== JSON.stringify(i.value ?? null));
      })
      .map((i) => ({ itemKey: i.itemKey, ...items[i.itemKey] }));
    const changedFields = Object.fromEntries(
      REPORT_FIELDS.filter((f) => (data.report?.[f.key] == null ? "" : String(data.report[f.key])) !== (fields[f.key] ?? "")).map((f) => [f.key, fields[f.key]]),
    );
    if (!changedItems.length && !Object.keys(changedFields).length) {
      setMode("view");
      return;
    }
    setBusy("save");
    setError("");
    const res = await fetch(`/api/review/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...hdr },
      body: JSON.stringify({ items: changedItems, report: changedFields }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(d.error || "Could not save your changes.");
    setNotice(`Saved ${d.changed} change${d.changed === 1 ? "" : "s"} (recorded in the activity log).`);
    setMode("view");
    onChanged();
    await load();
  }

  const input = "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-red-500";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-3xl flex-col bg-neutral-50 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Report review</p>
            <p className="truncate font-semibold text-neutral-900">
              {data ? `${data.job.jobCode} · ${data.job.vehicle}` : "Loading…"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            Close ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

          {data && (
            <>
              {/* Summary */}
              <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
                <Info k="Status" v={statusText(data)} />
                <Info k="Company" v={data.job.company} />
                <Info k="Inspector" v={data.job.inspector ? `${data.job.inspector.name} · ${data.job.inspector.phone ?? data.job.inspector.email}` : null} />
                <Info k="Customer" v={data.job.customerName} />
                <Info k="VIN" v={data.job.vin} />
                <Info k="Location" v={data.job.location} />
                <Info k="Scheduled" v={data.job.scheduledAt ? `${new Date(data.job.scheduledAt).toLocaleDateString("en-GB")} ${data.job.scheduledSlot ?? ""}` : null} />
                <Info k="Submitted" v={fmtDateTime(data.job.reportSubmittedAt)} />
                {data.report?.verifiedAt && <Info k="Verified" v={`${data.report.verifiedByName} · ${fmtDateTime(data.report.verifiedAt)}`} />}
                {data.report?.returnNote && <Info k="Returned with note" v={data.report.returnNote} />}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <a href={`/review/${jobId}?as=${as}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100">
                  Open full report preview ↗
                </a>
                {canAct && mode === "view" && (
                  <>
                    <button onClick={() => setMode("edit")} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100">
                      Edit report
                    </button>
                    <button onClick={() => setMode("return")} className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                      Return to inspector
                    </button>
                    <button onClick={approve} disabled={busy !== ""} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      {busy === "approve" ? "Verifying…" : "Verify & send to customer"}
                    </button>
                  </>
                )}
              </div>
              {!canAct && (
                <p className="text-xs text-neutral-500">
                  {data.job.status === "completed"
                    ? "This report is verified and was sent to the customer."
                    : "Nothing to verify right now — actions appear when the inspector submits the report."}
                </p>
              )}

              {/* Return */}
              {mode === "return" && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <label className="mb-1.5 block text-sm font-semibold text-amber-900">What should the inspector correct?</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={input} placeholder="e.g. Please add tread depth for the spare tyre and a photo of the front-left brake disc." />
                  <div className="mt-3 flex gap-2">
                    <button onClick={sendBack} disabled={busy !== "" || note.trim().length < 3} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                      {busy === "return" ? "Sending…" : "Send back to inspector"}
                    </button>
                    <button onClick={() => setMode("view")} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
                  </div>
                </div>
              )}

              {/* Edit */}
              {mode === "edit" && (
                <div className="space-y-4 rounded-xl border border-neutral-300 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-900">Edit report — every change is recorded with your name</p>
                    <div className="flex gap-2">
                      <button onClick={() => void load().then(() => setMode("view"))} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Discard</button>
                      <button onClick={saveEdits} disabled={busy !== ""} className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                        {busy === "save" ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>

                  <details open className="rounded-lg border border-neutral-200">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">Vehicle details &amp; inspector comments</summary>
                    <div className="grid gap-3 p-3 sm:grid-cols-2">
                      {REPORT_FIELDS.map((f) => (
                        <label key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
                          <span className="mb-1 block text-xs font-medium text-neutral-600">{f.label}</span>
                          {f.multiline ? (
                            <textarea value={fields[f.key] ?? ""} onChange={(e) => setFields((c) => ({ ...c, [f.key]: e.target.value }))} rows={2} className={input} />
                          ) : (
                            <input value={fields[f.key] ?? ""} inputMode={f.numeric ? "numeric" : undefined} onChange={(e) => setFields((c) => ({ ...c, [f.key]: f.numeric ? e.target.value.replace(/\D/g, "") : e.target.value }))} className={input} />
                          )}
                        </label>
                      ))}
                    </div>
                  </details>

                  {sections.map(([title, list]) => (
                    <details key={title} className="rounded-lg border border-neutral-200">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">{title}</summary>
                      <ul className="divide-y divide-neutral-100">
                        {list.map((it) => {
                          const d = items[it.itemKey] ?? { condition: null, comments: null, value: null };
                          const set = (patch: Partial<ItemDraft>) => setItems((c) => ({ ...c, [it.itemKey]: { ...d, ...patch } }));
                          return (
                            <li key={it.itemKey} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_1.2fr]">
                              <p className="text-sm text-neutral-800">{it.label}</p>
                              <div className="space-y-1.5">
                                <select value={d.condition ?? ""} onChange={(e) => set({ condition: e.target.value || null })} className={input}>
                                  <option value="">Not recorded</option>
                                  {it.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                                {it.valueFields.length > 0 && (
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {it.valueFields.map((f) => (
                                      <input
                                        key={f.key}
                                        value={d.value?.[f.key] ?? ""}
                                        placeholder={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}
                                        aria-label={f.label}
                                        onChange={(e) => {
                                          const next = { ...(d.value ?? {}) };
                                          if (e.target.value.trim()) next[f.key] = e.target.value.trim();
                                          else delete next[f.key];
                                          set({ value: Object.keys(next).length ? next : null });
                                        }}
                                        className={input}
                                      />
                                    ))}
                                  </div>
                                )}
                                <input value={d.comments ?? ""} onChange={(e) => set({ comments: e.target.value })} placeholder="Comment" className={input} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ))}
                </div>
              )}

              {/* Activity */}
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Activity</p>
                {data.activity.length === 0 ? (
                  <p className="text-sm text-neutral-400">No activity yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.activity.map((a) => (
                      <li key={a.id} className="text-sm">
                        <p className="text-neutral-800">
                          <b>{ACTION_LABEL[a.action] ?? a.action}</b> · {a.actorName ?? a.actorType}
                          <span className="text-xs text-neutral-400"> · {fmtDateTime(a.createdAt)}</span>
                        </p>
                        {a.detail && <p className="whitespace-pre-line text-xs text-neutral-600">{a.detail}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function statusText(d: ReviewData): string {
  if (d.job.status === "report_submitted") return "Awaiting verification";
  if (d.job.status === "completed") return "Verified & sent to customer";
  if (d.report?.returnedAt && d.job.status === "in_progress") return "Returned to inspector";
  return d.job.status.replace(/_/g, " ");
}

function Info({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{k}</p>
      <p className="break-words text-neutral-800">{v || "—"}</p>
    </div>
  );
}
