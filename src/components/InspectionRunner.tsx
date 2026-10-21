"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONDITION_OPTIONS } from "@/lib/inspectionChecklist";
import type { InspectorItem } from "@/lib/types";

/**
 * The digital inspection form: 9 sections of points, each rated Good/Fair/Poor/
 * Fail/N-A with comments, plus a Review & Submit step. Autosaves as you go.
 */

interface Answer {
  condition: string | null;
  comments: string | null;
}

const CONDITION_TONE: Record<string, string> = {
  Good: "border-green-500 bg-green-50 text-green-700",
  Fair: "border-amber-500 bg-amber-50 text-amber-700",
  Poor: "border-orange-500 bg-orange-50 text-orange-700",
  Fail: "border-red-500 bg-red-50 text-red-700",
  "N/A": "border-neutral-400 bg-neutral-100 text-neutral-600",
};

export default function InspectionRunner({
  jobId,
  jobCode,
  vehicle,
  onExit,
  onCompleted,
}: {
  jobId: string;
  jobCode: string;
  vehicle: string;
  onExit: () => void;
  onCompleted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InspectorItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [activeSection, setActiveSection] = useState(0);
  const [mode, setMode] = useState<"form" | "review">("form");
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Array<{ url: string; caption: string | null }>>([]);
  const [photoMsg, setPhotoMsg] = useState("");

  const pending = useRef<Record<string, Answer>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const resaveQueued = useRef(false);
  const lsKey = `wd_insp_${jobId}`;

  // Persist the local queue of unsynced edits so an offline reload keeps them.
  const persistPending = useCallback(() => {
    try {
      localStorage.setItem(lsKey, JSON.stringify(pending.current));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [lsKey]);

  // Load (and start if needed).
  useEffect(() => {
    (async () => {
      try {
        let res = await fetch(`/api/inspector/jobs/${jobId}`);
        let data = await res.json();
        if (res.ok && !data.progress.started && !["completed", "report_submitted"].includes(data.job.status)) {
          await fetch(`/api/inspector/jobs/${jobId}/start`, { method: "POST" });
          res = await fetch(`/api/inspector/jobs/${jobId}`);
          data = await res.json();
        }
        if (res.ok) {
          const its: InspectorItem[] = data.items;
          setItems(its);
          const ans: Record<string, Answer> = {};
          for (const i of its) ans[i.itemKey] = { condition: i.condition, comments: i.comments };
          setAnswers(ans);
          setReadOnly(["completed", "report_submitted"].includes(data.job.status));
          // Map item ids -> keys to tally photos per item.
          const idToKey: Record<string, string> = {};
          for (const i of its) idToKey[i.id] = i.itemKey;
          const counts: Record<string, number> = {};
          for (const p of data.photos as { itemId: string | null }[]) {
            const key = p.itemId ? idToKey[p.itemId] : undefined;
            if (key) counts[key] = (counts[key] || 0) + 1;
          }
          setPhotoCounts(counts);
          setPhotos(
            (data.photos as Array<{ url: string; caption: string | null }>).map((p) => ({
              url: p.url,
              caption: p.caption,
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const uploadPhoto = useCallback(
    async (itemKey: string, file: File) => {
      setPhotoMsg("");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("itemKey", itemKey);
      try {
        const res = await fetch(`/api/inspector/jobs/${jobId}/photos`, { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.ok) {
          setPhotoCounts((c) => ({ ...c, [itemKey]: (c[itemKey] || 0) + 1 }));
          if (data.photo?.url) setPhotos((prev) => [...prev, { url: data.photo.url, caption: null }]);
        } else {
          setPhotoMsg(data.error || "Photo upload failed.");
        }
      } catch {
        setPhotoMsg("Network error uploading photo.");
      }
    },
    [jobId],
  );

  const sections = useMemo(() => {
    const map = new Map<string, InspectorItem[]>();
    for (const i of items) {
      if (!map.has(i.section)) map.set(i.section, []);
      map.get(i.section)!.push(i);
    }
    return Array.from(map.entries()).map(([title, list]) => ({ title, list }));
  }, [items]);

  const total = items.length;
  const answered = useMemo(
    () => Object.values(answers).filter((a) => a.condition && a.condition.length > 0).length,
    [answers],
  );

  const flush = useCallback(async () => {
    // Serialise autosaves: a slow request must never let the next keystroke
    // open a second (then third…) parallel connection to the database.
    if (inFlight.current) {
      resaveQueued.current = true;
      return inFlight.current;
    }

    const run = async () => {
      const batch = { ...pending.current };
      const keys = Object.keys(batch);
      if (!keys.length) return;
      const payload = keys.map((itemKey) => ({
        itemKey,
        condition: batch[itemKey].condition,
        comments: batch[itemKey].comments,
      }));
      // Offline: keep the queue on device and surface an offline indicator.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSaving("offline");
        persistPending();
        return;
      }
      setSaving("saving");
      try {
        const res = await fetch(`/api/inspector/jobs/${jobId}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: payload }),
        });
        if (!res.ok) throw new Error("save failed");
        // Clear only the keys we synced (leave any concurrent new edits queued).
        for (const k of keys) if (pending.current[k] === batch[k]) delete pending.current[k];
        persistPending();
        setSaving("saved");
        setTimeout(() => setSaving((s) => (s === "saved" ? "idle" : s)), 1200);
      } catch {
        // Network failed — keep the queue and retry when back online.
        setSaving("offline");
        persistPending();
      }
    };

    const task = (async () => {
      try {
        await run();
        // Edits made while the request was in flight still need syncing.
        while (resaveQueued.current && Object.keys(pending.current).length) {
          resaveQueued.current = false;
          await run();
        }
      } finally {
        resaveQueued.current = false;
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    return task;
  }, [jobId, persistPending]);

  // Offline support: restore unsynced edits from this device + react to
  // connectivity changes (auto-sync the queue when the connection returns).
  useEffect(() => {
    if (loading || readOnly) return;
    setOnline(navigator.onLine);
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, Answer>;
        if (saved && Object.keys(saved).length) {
          pending.current = { ...pending.current, ...saved };
          setAnswers((prev) => ({ ...prev, ...saved }));
          if (navigator.onLine) void flush();
          else setSaving("offline");
        }
      }
    } catch {
      /* storage unavailable — ignore */
    }
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => {
      setOnline(false);
      setSaving("offline");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [loading, readOnly, lsKey, flush]);

  function queueSave(itemKey: string, patch: Answer) {
    pending.current[itemKey] = patch;
    persistPending();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  function setAnswer(itemKey: string, field: keyof Answer, value: string | null) {
    setAnswers((prev) => {
      const nextAnswer = { ...(prev[itemKey] || { condition: null, comments: null }), [field]: value };
      queueSave(itemKey, nextAnswer);
      return { ...prev, [itemKey]: nextAnswer };
    });
  }

  async function submit(summary: string, recommendations: string, details: ReportDetails) {
    setSubmitting(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    await flush();
    try {
      const res = await fetch(`/api/inspector/jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, recommendations, ...details }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        try {
          localStorage.removeItem(lsKey);
        } catch {
          /* ignore */
        }
        onCompleted();
      } else setError(data.error || "Could not submit. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">Preparing inspection…</div>;
  }

  const pct = total ? Math.round((answered / total) * 100) : 0;
  const section = sections[activeSection];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <button onClick={onExit} className="text-xs font-medium text-neutral-500 hover:text-neutral-800">← Exit</button>
            <p className="truncate text-sm font-semibold text-neutral-900">{vehicle}</p>
            <p className="font-mono text-[11px] text-neutral-400">{jobCode}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-neutral-900">{answered}/{total}</p>
            <p className={`text-[11px] ${saving === "offline" ? "font-medium text-amber-600" : "text-neutral-400"}`}>
              {saving === "saving"
                ? "Saving…"
                : saving === "saved"
                  ? "Saved ✓"
                  : saving === "offline"
                    ? "Offline — saved on device"
                    : "points rated"}
            </p>
          </div>
        </div>
        {!online && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700">
            You&apos;re offline. Your ratings are saved on this device and will sync automatically when the connection returns.
          </div>
        )}
        <div className="h-1 w-full bg-neutral-100">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-6">
        {/* Section nav */}
        <nav className="hidden w-48 shrink-0 lg:block">
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => {
              const done = s.list.filter((it) => answers[it.itemKey]?.condition).length;
              return (
                <li key={s.title}>
                  <button
                    onClick={() => { setMode("form"); setActiveSection(i); }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
                      mode === "form" && i === activeSection ? "bg-red-50 font-medium text-red-700" : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    <span className="truncate">{i + 1}. {s.title}</span>
                    <span className="ml-2 text-[11px] text-neutral-400">{done}/{s.list.length}</span>
                  </button>
                </li>
              );
            })}
            <li className="pt-2">
              <button
                onClick={() => setMode("review")}
                className={`w-full rounded-md px-3 py-2 text-left font-medium transition-colors ${mode === "review" ? "bg-red-50 text-red-700" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                Review &amp; Submit
              </button>
            </li>
          </ol>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {mode === "form" && section ? (
            <SectionForm
              key={section.title}
              title={section.title}
              index={activeSection}
              count={sections.length}
              items={section.list}
              answers={answers}
              photoCounts={photoCounts}
              photoMsg={photoMsg}
              readOnly={readOnly}
              onSet={setAnswer}
              onUploadPhoto={uploadPhoto}
              onPrev={() => setActiveSection((s) => Math.max(0, s - 1))}
              onNext={() =>
                activeSection < sections.length - 1
                  ? setActiveSection((s) => s + 1)
                  : setMode("review")
              }
            />
          ) : (
            <ReviewSubmit
              sections={sections}
              answers={answers}
              answered={answered}
              total={total}
              photos={photos}
              readOnly={readOnly}
              submitting={submitting}
              error={error}
              onBack={() => setMode("form")}
              onSubmit={submit}
              onDone={onCompleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Section form -----------------------------------------------------------

function SectionForm({
  title,
  index,
  count,
  items,
  answers,
  photoCounts,
  photoMsg,
  readOnly,
  onSet,
  onUploadPhoto,
  onPrev,
  onNext,
}: {
  title: string;
  index: number;
  count: number;
  items: InspectorItem[];
  answers: Record<string, Answer>;
  photoCounts: Record<string, number>;
  photoMsg: string;
  readOnly: boolean;
  onSet: (itemKey: string, field: keyof Answer, value: string | null) => void;
  onUploadPhoto: (itemKey: string, file: File) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h2 className="font-semibold text-neutral-900">
          <span className="text-red-600">{index + 1}.</span> {title}
        </h2>
        <span className="text-xs text-neutral-400">Section {index + 1} of {count}</span>
      </div>

      {photoMsg && (
        <p className="mx-5 mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{photoMsg}</p>
      )}

      <ul className="divide-y divide-neutral-100">
        {items.map((it) => {
          const a = answers[it.itemKey] || { condition: null, comments: null };
          const photos = photoCounts[it.itemKey] || 0;
          return (
            <li key={it.itemKey} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-neutral-800">{it.label}</p>
                <PhotoButton
                  count={photos}
                  disabled={readOnly}
                  onPick={(f) => onUploadPhoto(it.itemKey, f)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CONDITION_OPTIONS.map((c) => {
                  const on = a.condition === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onSet(it.itemKey, "condition", on ? null : c)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        on ? CONDITION_TONE[c] : "border-neutral-300 text-neutral-500 hover:border-neutral-400"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <input
                value={a.comments || ""}
                disabled={readOnly}
                onChange={(e) => onSet(it.itemKey, "comments", e.target.value)}
                placeholder="Add a comment (optional)…"
                className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-red-400 disabled:bg-neutral-50"
              />
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
        <button onClick={onPrev} disabled={index === 0} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">
          Previous
        </button>
        <button onClick={onNext} className="rounded-md bg-red-600 px-6 py-2 text-sm font-semibold text-white hover:bg-red-700">
          {index < count - 1 ? "Save & Next" : "Review & Submit"}
        </button>
      </div>
    </div>
  );
}

function PhotoButton({ count, disabled, onPick }: { count: number; disabled?: boolean; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={`flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          count > 0 ? "border-green-400 bg-green-50 text-green-700" : "border-neutral-300 text-neutral-500 hover:border-red-400"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
        {count > 0 ? count : "Photo"}
      </button>
    </>
  );
}

// --- Review & Submit --------------------------------------------------------

/** Vehicle facts observed at inspection time, printed in the customer report. */
interface ReportDetails {
  odometerKm: string;
  odometerStatus: string;
  exteriorColor: string;
  regionalSpecs: string;
  keysCount: string;
  spareTyre: string;
  verdict: string;
}

const ODOMETER_STATUS = ["Genuine", "Suspected tampering", "Not verified"];
const REGIONAL_SPECS = ["GCC", "American", "Japanese", "European", "Korean", "Other"];
const SPARE_TYRE = ["Available", "Not available", "Repair kit"];
const VERDICTS = ["Recommended", "Recommended with repairs", "Not recommended"];

function ReviewSubmit({
  sections,
  answers,
  answered,
  total,
  photos,
  readOnly,
  submitting,
  error,
  onBack,
  onSubmit,
  onDone,
}: {
  sections: { title: string; list: InspectorItem[] }[];
  answers: Record<string, Answer>;
  answered: number;
  total: number;
  photos: Array<{ url: string; caption: string | null }>;
  readOnly: boolean;
  submitting: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (summary: string, recommendations: string, details: ReportDetails) => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [details, setDetails] = useState<ReportDetails>({
    odometerKm: "",
    odometerStatus: "Genuine",
    exteriorColor: "",
    regionalSpecs: "GCC",
    keysCount: "",
    spareTyre: "Available",
    verdict: "",
  });
  const setD = (k: keyof ReportDetails, v: string) => setDetails((d) => ({ ...d, [k]: v }));
  const fieldCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

  const flagged = sections
    .flatMap((s) => s.list)
    .filter((it) => {
      const c = answers[it.itemKey]?.condition;
      return c === "Poor" || c === "Fail";
    });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-bold text-neutral-900">Review &amp; Submit</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {answered} of {total} points rated.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {sections.map((s) => {
            const done = s.list.filter((it) => answers[it.itemKey]?.condition).length;
            const complete = done === s.list.length;
            return (
              <div key={s.title} className="rounded-xl border border-neutral-200 p-3">
                <p className="text-sm font-medium text-neutral-800">{s.title}</p>
                <p className={`text-xs ${complete ? "text-green-600" : "text-neutral-400"}`}>
                  {done}/{s.list.length} {complete ? "✓" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h3 className="text-sm font-semibold text-red-700">Flagged items ({flagged.length})</h3>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {flagged.slice(0, 12).map((it) => (
              <li key={it.itemKey}>• {it.section}: {it.label}</li>
            ))}
            {flagged.length > 12 && <li className="text-red-500">…and {flagged.length - 12} more</li>}
          </ul>
        </div>
      )}

      {photos.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Photos ({photos.length})</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt={p.caption || `Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Vehicle details for the report</h3>
          <p className="mt-0.5 text-xs text-neutral-500">Shown in the customer&apos;s Vehicle Summary.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Odometer reading (km)</span>
              <input value={details.odometerKm} onChange={(e) => setD("odometerKm", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 55285" className={fieldCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Odometer status</span>
              <select value={details.odometerStatus} onChange={(e) => setD("odometerStatus", e.target.value)} className={fieldCls}>
                {ODOMETER_STATUS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Exterior colour</span>
              <input value={details.exteriorColor} onChange={(e) => setD("exteriorColor", e.target.value)} placeholder="e.g. Grey" className={fieldCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Regional specs</span>
              <select value={details.regionalSpecs} onChange={(e) => setD("regionalSpecs", e.target.value)} className={fieldCls}>
                {REGIONAL_SPECS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Number of keys</span>
              <input value={details.keysCount} onChange={(e) => setD("keysCount", e.target.value.replace(/\D/g, "").slice(0, 1))} inputMode="numeric" placeholder="e.g. 2" className={fieldCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Spare tyre</span>
              <select value={details.spareTyre} onChange={(e) => setD("spareTyre", e.target.value)} className={fieldCls}>
                {SPARE_TYRE.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          </div>

          <p className="mt-5 mb-1.5 text-sm font-medium text-neutral-700">Overall verdict</p>
          <div className="flex flex-wrap gap-2">
            {VERDICTS.map((v) => {
              const on = details.verdict === v;
              const tone = v === "Recommended" ? "border-green-600 bg-green-50 text-green-700" : v === "Not recommended" ? "border-red-600 bg-red-50 text-red-700" : "border-amber-500 bg-amber-50 text-amber-700";
              return (
                <button key={v} type="button" onClick={() => setD("verdict", on ? "" : v)} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${on ? tone : "border-neutral-300 text-neutral-500 hover:border-neutral-400"}`}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Summary (optional)</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Overall condition summary… (auto-generated if left blank)" className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Repair recommendations (optional)</label>
          <textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} rows={3} placeholder="Recommended repairs… (auto-filled from flagged items if blank)" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500" />
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-md px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
          Back to form
        </button>
        {readOnly ? (
          <button onClick={onDone} className="rounded-md bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">
            Done
          </button>
        ) : (
          <button
            onClick={() => onSubmit(summary, recommendations, details)}
            disabled={submitting}
            className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Report for Review"}
          </button>
        )}
      </div>
    </div>
  );
}
