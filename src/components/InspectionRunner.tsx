"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isRecordable,
  itemType,
  NOT_ASSESSED,
  optionsFor,
  PHOTO_SECTION_TITLE,
  VALUE_FIELDS,
  type ItemType,
} from "@/lib/inspectionChecklist";
import type { InspectorItem, InspectorReportFields } from "@/lib/types";

/**
 * The digital inspection form. The inspector walks the client's checklist
 * section by section and records a neutral observation (plus measurements
 * and photos where relevant) for every parameter — facts only, no pass/fail
 * or verdict. Ends with a Review & Submit step that captures the Section 01
 * vehicle details and Section 12 inspector comments. Autosaves as you go.
 */

interface Answer {
  condition: string | null;
  comments: string | null;
  value: Record<string, string> | null;
}

const EMPTY: Answer = { condition: null, comments: null, value: null };

/**
 * Report section number for the i-th checklist section. Sections 02–11 are
 * the recorded parameters; the photo section is 13 (12 is the diagnostic scan
 * and inspector comments captured at review).
 */
function sectionNumber(index: number, isPhotos: boolean): string {
  return String(index + (isPhotos ? 3 : 2)).padStart(2, "0");
}

/** Visual tone per observation — informational, not a grade. */
function toneFor(option: string): string {
  if (option === NOT_ASSESSED) return "border-neutral-400 bg-neutral-100 text-neutral-600";
  if (/damage|scratch|repaint|replaced/i.test(option)) return "border-amber-500 bg-amber-50 text-amber-800";
  return "border-sky-600 bg-sky-50 text-sky-800";
}

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
  const [navOpen, setNavOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Array<{ url: string; caption: string | null }>>([]);
  const [photoMsg, setPhotoMsg] = useState("");
  const [savedReport, setSavedReport] = useState<InspectorReportFields | null>(null);

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
          for (const i of its) ans[i.itemKey] = { condition: i.condition, comments: i.comments, value: i.value ?? null };
          setAnswers(ans);
          setReadOnly(["completed", "report_submitted"].includes(data.job.status));
          setSavedReport(data.report ?? null);
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
    return Array.from(map.entries()).map(([title, list]) => ({
      title,
      list,
      isPhotos: title === PHOTO_SECTION_TITLE || title === "Photos",
    }));
  }, [items]);

  const recordableKeys = useMemo(
    () => items.filter((i) => isRecordable(i.itemKey)).map((i) => i.itemKey),
    [items],
  );
  const total = recordableKeys.length;
  const answered = useMemo(
    () => recordableKeys.filter((k) => answers[k]?.condition).length,
    [answers, recordableKeys],
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
        value: batch[itemKey].value,
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

  function setAnswer(itemKey: string, patch: Partial<Answer>) {
    setAnswers((prev) => {
      const nextAnswer = { ...(prev[itemKey] || EMPTY), ...patch };
      queueSave(itemKey, nextAnswer);
      return { ...prev, [itemKey]: nextAnswer };
    });
  }

  async function submit(fields: ReportFormFields) {
    setSubmitting(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    await flush();
    try {
      const res = await fetch(`/api/inspector/jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
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

  const pickSection = (i: number) => {
    setMode("form");
    setActiveSection(i);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };
  const pickReview = () => {
    setMode("review");
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };
  const sectionDone = (s: (typeof sections)[number]) =>
    s.isPhotos
      ? s.list.filter((it) => photoCounts[it.itemKey]).length
      : s.list.filter((it) => answers[it.itemKey]?.condition).length;
  const currentLabel =
    mode === "review"
      ? "Vehicle details, comments & submit"
      : section
        ? `${sectionNumber(activeSection, section.isPhotos)}. ${section.title}`
        : "Sections";

  // Shared by the desktop sidebar and the mobile dropdown.
  const sectionList = (
    <ol className="space-y-1 text-sm">
      {sections.map((s, i) => {
        const done = sectionDone(s);
        return (
          <li key={s.title}>
            <button
              onClick={() => pickSection(i)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left transition-colors lg:py-2 ${
                mode === "form" && i === activeSection ? "bg-red-50 font-medium text-red-700" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <span className="truncate">{sectionNumber(i, s.isPhotos)}. {s.title}</span>
              <span className={`ml-2 shrink-0 text-[11px] ${done === s.list.length ? "font-semibold text-green-600" : "text-neutral-400"}`}>
                {done}/{s.list.length}
              </span>
            </button>
          </li>
        );
      })}
      <li className="pt-2">
        <button
          onClick={pickReview}
          className={`w-full rounded-md px-3 py-2.5 text-left font-medium leading-snug transition-colors lg:py-2 ${mode === "review" ? "bg-red-50 text-red-700" : "text-neutral-600 hover:bg-neutral-100"}`}
        >
          Vehicle details, comments &amp; submit
        </button>
      </li>
    </ol>
  );
  const factsNote = (
    <p className="rounded-md bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
      Record what you observe. The report documents facts only — no pass/fail, score or recommendation.
    </p>
  );

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
                    : "parameters recorded"}
            </p>
          </div>
        </div>
        {!online && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700">
            You&apos;re offline. Your entries are saved on this device and will sync automatically when the connection returns.
          </div>
        )}

        {/* Phone/tablet: section switcher (the sidebar is desktop-only) */}
        <div className="border-t border-neutral-100 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Section — tap to switch</span>
              <span className="block truncate text-sm font-semibold text-red-700">{currentLabel}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-neutral-500 transition-transform ${navOpen ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {navOpen && (
            <div className="max-h-[65vh] overflow-y-auto border-t border-neutral-100 bg-white px-3 pb-3 pt-2">
              {sectionList}
              <div className="mt-3">{factsNote}</div>
            </div>
          )}
        </div>
        <div className="h-1 w-full bg-neutral-100">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-6">
        {/* Desktop: sticky sidebar that scrolls on its own so every entry stays reachable */}
        <nav className="sticky top-28 hidden max-h-[calc(100vh-8rem)] w-60 shrink-0 self-start overflow-y-auto pr-1 lg:block">
          {sectionList}
          <div className="mt-4">{factsNote}</div>
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
              isPhotos={section.isPhotos}
              answers={answers}
              photoCounts={photoCounts}
              photoMsg={photoMsg}
              readOnly={readOnly}
              onSet={setAnswer}
              onUploadPhoto={uploadPhoto}
              onPrev={() => pickSection(Math.max(0, activeSection - 1))}
              onNext={() =>
                activeSection < sections.length - 1
                  ? pickSection(activeSection + 1)
                  : pickReview()
              }
            />
          ) : (
            <ReviewSubmit
              sections={sections}
              answers={answers}
              photoCounts={photoCounts}
              answered={answered}
              total={total}
              photos={photos}
              readOnly={readOnly}
              savedReport={savedReport}
              submitting={submitting}
              error={error}
              onBack={() => pickSection(activeSection)}
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
  isPhotos,
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
  isPhotos: boolean;
  answers: Record<string, Answer>;
  photoCounts: Record<string, number>;
  photoMsg: string;
  readOnly: boolean;
  onSet: (itemKey: string, patch: Partial<Answer>) => void;
  onUploadPhoto: (itemKey: string, file: File) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h2 className="font-semibold text-neutral-900">
          <span className="text-red-600">{sectionNumber(index, isPhotos)}.</span> {title}
        </h2>
        <span className="text-xs text-neutral-400">Section {index + 1} of {count}</span>
      </div>

      {isPhotos && (
        <p className="mx-5 mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Attach real photographs for each group. Photos of specific findings can also be added on the parameter itself.
        </p>
      )}
      {photoMsg && (
        <p className="mx-5 mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{photoMsg}</p>
      )}

      <ul className="divide-y divide-neutral-100">
        {items.map((it) => {
          const a = answers[it.itemKey] || EMPTY;
          const type: ItemType = itemType(it.itemKey);
          const options = optionsFor(type);
          const fields = VALUE_FIELDS[type] ?? [];
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

              {options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {options.map((c) => {
                    const on = a.condition === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={readOnly}
                        onClick={() => onSet(it.itemKey, { condition: on ? null : c })}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          on ? toneFor(c) : "border-neutral-300 text-neutral-500 hover:border-neutral-400"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              )}

              {fields.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-0.5 block text-[11px] text-neutral-500">
                        {f.label}{f.unit ? ` (${f.unit})` : ""}
                      </span>
                      <input
                        value={a.value?.[f.key] || ""}
                        disabled={readOnly}
                        inputMode="decimal"
                        placeholder={f.placeholder}
                        onChange={(e) => {
                          const next = { ...(a.value || {}) };
                          const v = e.target.value.trim();
                          if (v) next[f.key] = v;
                          else delete next[f.key];
                          onSet(it.itemKey, { value: Object.keys(next).length ? next : null });
                        }}
                        className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-red-400 disabled:bg-neutral-50"
                      />
                    </label>
                  ))}
                </div>
              )}

              {type !== "photo" && (
                <input
                  value={a.comments || ""}
                  disabled={readOnly}
                  onChange={(e) => onSet(it.itemKey, { comments: e.target.value })}
                  placeholder="Comment / observation (optional)…"
                  className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-red-400 disabled:bg-neutral-50"
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
        <button onClick={onPrev} disabled={index === 0} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">
          Previous
        </button>
        <button onClick={onNext} className="rounded-md bg-red-600 px-6 py-2 text-sm font-semibold text-white hover:bg-red-700">
          {index < count - 1 ? "Save & Next" : "Continue to details"}
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

/** Section 01 vehicle facts + Section 12 inspector comments sent on submit. */
interface ReportFormFields {
  odometerKm: string;
  odometerStatus: string;
  exteriorColor: string;
  regionalSpecs: string;
  engineConfig: string;
  keysCount: string;
  spareTyre: string;
  diagnosticScan: string;
  summary: string;
  limitations: string;
}

const ODOMETER_STATUS = [
  "No indication of alteration observed",
  "Indication of alteration observed",
  "Not assessed / unavailable",
];
const REGIONAL_SPECS = ["GCC", "American", "Japanese", "European", "Korean", "Other"];
const SPARE_TYRE = ["Available", "Not available", "Repair kit"];

function ReviewSubmit({
  sections,
  answers,
  photoCounts,
  answered,
  total,
  photos,
  readOnly,
  savedReport,
  submitting,
  error,
  onBack,
  onSubmit,
  onDone,
}: {
  sections: { title: string; list: InspectorItem[]; isPhotos: boolean }[];
  answers: Record<string, Answer>;
  photoCounts: Record<string, number>;
  answered: number;
  total: number;
  photos: Array<{ url: string; caption: string | null }>;
  readOnly: boolean;
  savedReport: InspectorReportFields | null;
  submitting: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (fields: ReportFormFields) => void;
  onDone: () => void;
}) {
  const [fields, setFields] = useState<ReportFormFields>({
    odometerKm: savedReport?.odometerKm != null ? String(savedReport.odometerKm) : "",
    odometerStatus: savedReport?.odometerStatus ?? ODOMETER_STATUS[0],
    exteriorColor: savedReport?.exteriorColor ?? "",
    regionalSpecs: savedReport?.regionalSpecs ?? "GCC",
    engineConfig: savedReport?.engineConfig ?? "",
    keysCount: savedReport?.keysCount != null ? String(savedReport.keysCount) : "",
    spareTyre: savedReport?.spareTyre ?? "Available",
    diagnosticScan: savedReport?.diagnosticScan ?? "",
    summary: savedReport?.summary ?? "",
    limitations: savedReport?.limitations ?? "",
  });
  const setF = (k: keyof ReportFormFields, v: string) => setFields((d) => ({ ...d, [k]: v }));
  const fieldCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500 disabled:bg-neutral-50";
  const unrecorded = total - answered;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-bold text-neutral-900">Review &amp; Submit</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {answered} of {total} parameters recorded.
          {unrecorded > 0 && !readOnly && (
            <span className="text-amber-700"> {unrecorded} not yet recorded — they will be listed under inspection limitations.</span>
          )}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {sections.map((s) => {
            const done = s.isPhotos
              ? s.list.filter((it) => photoCounts[it.itemKey]).length
              : s.list.filter((it) => answers[it.itemKey]?.condition).length;
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

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900">
          <span className="text-red-600">01.</span> Vehicle identification and general details
        </h3>
        <p className="mt-0.5 text-xs text-neutral-500">Recorded at inspection time; make, model, year and VIN come from the booking.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Odometer reading (km)</span>
            <input value={fields.odometerKm} disabled={readOnly} onChange={(e) => setF("odometerKm", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 55285" className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Odometer authenticity</span>
            <select value={fields.odometerStatus} disabled={readOnly} onChange={(e) => setF("odometerStatus", e.target.value)} className={fieldCls}>
              {ODOMETER_STATUS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Exterior colour</span>
            <input value={fields.exteriorColor} disabled={readOnly} onChange={(e) => setF("exteriorColor", e.target.value)} placeholder="e.g. Grey" className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Regional specifications</span>
            <select value={fields.regionalSpecs} disabled={readOnly} onChange={(e) => setF("regionalSpecs", e.target.value)} className={fieldCls}>
              {REGIONAL_SPECS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Engine configuration</span>
            <input value={fields.engineConfig} disabled={readOnly} onChange={(e) => setF("engineConfig", e.target.value)} placeholder="e.g. 4-cylinder" className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Number of keys</span>
            <input value={fields.keysCount} disabled={readOnly} onChange={(e) => setF("keysCount", e.target.value.replace(/\D/g, "").slice(0, 1))} inputMode="numeric" placeholder="e.g. 2" className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Spare tyre availability</span>
            <select value={fields.spareTyre} disabled={readOnly} onChange={(e) => setF("spareTyre", e.target.value)} className={fieldCls}>
              {SPARE_TYRE.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900">
          <span className="text-red-600">12.</span> Diagnostic scan and inspector comments
        </h3>
        <p className="mt-0.5 text-xs text-neutral-500">Factual notes only — describe what was found, not whether the vehicle should be bought.</p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Diagnostic scan history</span>
          <textarea value={fields.diagnosticScan} disabled={readOnly} onChange={(e) => setF("diagnosticScan", e.target.value)} rows={2} placeholder="e.g. One stored fault code found (module / code / status if known); or: no stored fault codes found" className={fieldCls} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Additional observations</span>
          <textarea value={fields.summary} disabled={readOnly} onChange={(e) => setF("summary", e.target.value)} rows={3} placeholder="e.g. All brake discs show surface scoring; see photographs." className={fieldCls} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Inspection limitations</span>
          <textarea value={fields.limitations} disabled={readOnly} onChange={(e) => setF("limitations", e.target.value)} rows={2} placeholder="Components not checked or not accessible and the reason (auto-filled from unrecorded parameters if left blank)" className={fieldCls} />
        </label>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-md px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
          Back to checklist
        </button>
        {readOnly ? (
          <button onClick={onDone} className="rounded-md bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">
            Done
          </button>
        ) : (
          <button
            onClick={() => onSubmit(fields)}
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
