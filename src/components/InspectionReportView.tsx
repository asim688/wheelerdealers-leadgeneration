"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

/**
 * Customer-facing inspection report, styled as a branded "report book":
 * cover → inspection details + vehicle summary + pass/defect overview →
 * one card per section with PASS / ATTENTION / FAIL badges and photos →
 * findings & recommendations → thank-you back page. Print CSS gives one
 * A4 page per block so "Print / Save PDF" produces a clean document.
 */

interface Photo {
  url: string;
  caption: string | null;
}
interface ReportItem {
  label: string;
  condition: string | null;
  comments: string | null;
  photos: Photo[];
}
interface ReportSection {
  title: string;
  rated: number;
  total: number;
  pass: number;
  attention: number;
  fail: number;
  items: ReportItem[];
}
interface ReportData {
  jobCode: string;
  vehicle: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  bodyClass: string | null;
  transmission: string | null;
  fuelType: string | null;
  vin: string | null;
  location: string | null;
  customerName: string;
  inspectorName: string | null;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  completedAt: string | null;
  overallScore: number | null;
  summary: string | null;
  recommendations: string | null;
  odometerKm: number | null;
  odometerStatus: string | null;
  exteriorColor: string | null;
  regionalSpecs: string | null;
  keysCount: number | null;
  spareTyre: string | null;
  verdict: string | null;
  stats: { checked: number; pass: number; attention: number; fail: number };
  sections: ReportSection[];
  flagged: Array<{ section: string; label: string; condition: string | null; comments: string | null }>;
  photos: Photo[];
}

const BRAND = {
  site: "www.thewheelerdealers.com",
  email: "info@thewheelerdealers.com",
  bookTitle: "Comprehensive Inspection Report",
};

/** Customer-friendly badge for an inspector's rating. */
function badge(condition: string | null): { label: string; cls: string } {
  switch (condition) {
    case "Good":
      return { label: "PASS", cls: "bg-green-600 text-white" };
    case "Fair":
      return { label: "ATTENTION", cls: "bg-amber-500 text-white" };
    case "Poor":
    case "Fail":
      return { label: "FAIL", cls: "bg-red-600 text-white" };
    default:
      return { label: "N/A", cls: "bg-neutral-200 text-neutral-600" };
  }
}

/** Inspector's overall verdict as a coloured pill. */
function verdictBadge(v: string | null): { label: string; cls: string } | null {
  if (!v) return null;
  if (/^not/i.test(v)) return { label: v, cls: "bg-red-600 text-white" };
  if (/repair/i.test(v)) return { label: v, cls: "bg-amber-500 text-white" };
  return { label: v, cls: "bg-green-600 text-white" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase()
    .replace(/ /g, "-");
}

export default function InspectionReportView({ token }: { token: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/inspection/report/${token}`);
        if (res.ok) {
          setData(await res.json());
          setState("ok");
        } else {
          setState("notfound");
        }
      } catch {
        setState("notfound");
      }
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Loading report…
      </div>
    );
  }
  if (state === "notfound" || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
        <h1 className="text-xl font-bold text-neutral-900">Report not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This report link is invalid or the inspection isn&apos;t complete yet.
        </p>
        <Link href="/inspection" className="mt-4 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white">
          Back to inspections
        </Link>
      </div>
    );
  }

  const sections = data.sections.filter((s) => s.rated > 0 && s.title !== "Photos" && s.title !== "Summary");
  const { checked, pass, attention, fail } = data.stats;
  const passPct = checked ? Math.round((pass / checked) * 100) : 0;
  const attPct = checked ? Math.round((attention / checked) * 100) : 0;
  const failPct = checked ? Math.max(0, 100 - passPct - attPct) : 0;
  const verdict = verdictBadge(data.verdict);

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          .report-page { width: 210mm; margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; break-after: page; }
          .report-page:last-child { page-break-after: auto; break-after: auto; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .keep-with-next { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <header className="sticky top-0 z-30 border-b border-neutral-300 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between px-5 py-3">
          <Link href="/inspection"><BrandLogo size="sm" /></Link>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Download PDF
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[210mm] flex-col gap-6 py-6 print:gap-0 print:py-0">
        {/* ── Cover ─────────────────────────────────────────────────────── */}
        <Page dark className="relative flex flex-col justify-between overflow-hidden">
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-red-600/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-red-500/20 blur-3xl" />
          <div className="relative flex justify-center pt-14">
            <BrandLogo light size="lg" />
          </div>
          <div className="relative px-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">Vehicle Inspection</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Comprehensive
              <br />
              <span className="text-red-500">Inspection Report</span>
            </h1>
            <p className="mt-8 text-2xl font-semibold text-white">{data.vehicle}</p>
            <p className="mt-2 text-sm text-neutral-400">
              Prepared for <span className="font-medium text-neutral-200">{data.customerName}</span>
            </p>
            <div className="mx-auto mt-10 grid w-full max-w-md grid-cols-3 gap-2 rounded-2xl bg-white/10 px-4 py-4 text-sm text-neutral-200 backdrop-blur sm:gap-4 sm:px-8">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-400">Report No.</p>
                <p className="font-mono text-xs font-semibold sm:text-sm">{data.jobCode}</p>
              </div>
              <div className="border-l border-white/20 pl-2 sm:pl-4">
                <p className="text-[10px] uppercase tracking-wider text-neutral-400">Date</p>
                <p className="text-xs font-semibold sm:text-sm">{fmtDate(data.completedAt ?? data.scheduledAt)}</p>
              </div>
              <div className="border-l border-white/20 pl-2 sm:pl-4">
                <p className="text-[10px] uppercase tracking-wider text-neutral-400">Points</p>
                <p className="text-xs font-semibold sm:text-sm">{checked}</p>
              </div>
            </div>
          </div>
          <div className="relative mx-4 mb-6 grid grid-cols-2 gap-3 rounded-2xl bg-black/60 px-5 py-4 text-sm text-neutral-300 sm:mx-8 sm:mb-8 sm:px-8 sm:py-5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Website</p>
              <p className="truncate text-xs font-semibold text-white sm:text-sm">{BRAND.site}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Email</p>
              <p className="truncate text-xs font-semibold text-white sm:text-sm">{BRAND.email}</p>
            </div>
          </div>
        </Page>

        {/* ── Inspection details + vehicle summary + overview ───────────── */}
        <Page>
          <PageHeader />
          <Card>
            <p className="text-xs font-medium text-neutral-500">Inspection Details</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Date" value={fmtDate(data.completedAt ?? data.scheduledAt)} />
              <Detail label="Time" value={data.scheduledSlot ?? "—"} />
              <Detail label="Inspection Type" value={`${checked}-Point`} />
              <Detail label="VIN Number" value={data.vin ?? "—"} mono />
            </div>
          </Card>

          <SectionBar title="Vehicle Summary" />
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="inline-block border-b-4 border-red-600 pb-1 text-2xl font-bold text-neutral-900">
                {data.make ?? "Vehicle"}
              </p>
              <p className="mt-1 text-sm text-neutral-500">{[data.model, data.trim].filter(Boolean).join(" ")}</p>
              {data.photos[0] ? (
                <figure className="avoid-break mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.photos[0].url} alt={data.photos[0].caption || data.vehicle} className="aspect-[4/3] w-full rounded-2xl bg-neutral-100 object-contain" />
                  {data.photos[0].caption && <figcaption className="mt-2 break-words text-xs leading-relaxed text-neutral-600">{data.photos[0].caption}</figcaption>}
                </figure>
              ) : (
                <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100 text-xs text-neutral-400">
                  No vehicle photo
                </div>
              )}
            </div>
            <Card>
              <dl className="divide-y divide-neutral-100 text-sm">
                <Row k="Make" v={data.make} />
                <Row k="Model" v={data.model} />
                <Row k="Model Year" v={data.year} />
                <Row k="Trim" v={data.trim} />
                <Row k="Body Type" v={data.bodyClass} />
                <Row k="Regional Specs" v={data.regionalSpecs} />
                <Row k="Transmission" v={data.transmission} />
                <Row k="Fuel Type" v={data.fuelType} />
                <Row k="Exterior Colour" v={data.exteriorColor} />
                <Row k="Odometer" v={data.odometerKm != null ? `${data.odometerKm.toLocaleString()} km${data.odometerStatus ? ` · ${data.odometerStatus}` : ""}` : data.odometerStatus} />
                <Row k="Number of Keys" v={data.keysCount} />
                <Row k="Spare Tyre" v={data.spareTyre} />
                <Row k="Inspection Location" v={data.location} />
                <Row k="Inspector" v={data.inspectorName} />
              </dl>
            </Card>
          </div>

          <div className="avoid-break mt-5 grid items-center gap-6 rounded-2xl bg-neutral-900 p-7 text-white sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-2xl font-bold">Report Overview</h2>
              {verdict && (
                <span className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${verdict.cls}`}>
                  <Dot cls="bg-white/80" /> {verdict.label}
                </span>
              )}
              <p className="mt-3 text-sm text-neutral-400">
                {checked} inspection points checked. {pass} passed, {attention} need attention, {fail} failed.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li className="flex items-center gap-2"><Dot cls="bg-green-500" /> Pass — {passPct}%</li>
                <li className="flex items-center gap-2"><Dot cls="bg-amber-400" /> Attention — {attPct}%</li>
                <li className="flex items-center gap-2"><Dot cls="bg-red-500" /> Fail — {failPct}%</li>
              </ul>
              {data.overallScore != null && (
                <p className="mt-4 text-sm text-neutral-300">
                  Overall condition score{" "}
                  <span className="text-xl font-bold text-white">{data.overallScore}</span>
                  <span className="text-neutral-500">/10</span>
                </p>
              )}
            </div>
            <Donut pass={passPct} attention={attPct} fail={failPct} />
          </div>
        </Page>

        {/* ── Section results (flow across pages; cards never split) ────── */}
        <Page flow>
          <PageHeader />
          {sections.map((s) => (
            <div key={s.title} className="mb-6">
              <SectionBar
                title={s.title}
                right={`${s.pass} pass · ${s.attention} attention · ${s.fail} fail`}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {s.items.map((it, i) => {
                  const b = badge(it.condition);
                  return (
                    <div key={i} className="avoid-break rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-neutral-900">{it.label}</p>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${b.cls}`}>
                          {b.label}
                        </span>
                      </div>
                      {it.comments && <p className="mt-1.5 text-xs text-neutral-500">{it.comments}</p>}
                      {it.photos.length > 0 && (
                        <div className={`mt-3 grid gap-2 ${it.photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {it.photos.slice(0, 4).map((p, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={j} src={p.url} alt={p.caption || it.label} className="aspect-[4/3] w-full rounded-xl object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Page>

        {/* ── Findings, recommendations, photos ─────────────────────────── */}
        <Page>
          <PageHeader />
          <SectionBar title="Inspector's Findings" />
          {verdict && (
            <div className={`avoid-break mt-4 flex items-center gap-3 rounded-2xl px-5 py-4 ${verdict.cls}`}>
              <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Verdict</span>
              <span className="text-lg font-bold">{verdict.label}</span>
            </div>
          )}
          {data.flagged.length === 0 ? (
            <Card className="mt-4 border border-green-200 bg-green-50">
              <p className="text-sm font-semibold text-green-800">No failed points were found during this inspection.</p>
            </Card>
          ) : (
            <Card className="mt-4 border border-red-200 bg-red-50">
              <p className="text-sm font-semibold text-red-800">
                {data.flagged.length} point{data.flagged.length === 1 ? "" : "s"} failed and need attention
              </p>
              <ul className="mt-3 space-y-2 text-sm text-red-900">
                {data.flagged.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-2 text-[10px] font-bold leading-5 text-white">FAIL</span>
                    <span>
                      <b>{f.section}:</b> {f.label}
                      {f.comments ? <span className="text-red-700"> — {f.comments}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.summary && (
            <Card className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Summary</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-800">{data.summary}</p>
            </Card>
          )}
          {data.recommendations && (
            <Card className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recommended Repairs</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-800">{data.recommendations}</p>
            </Card>
          )}

          {data.photos.length > 1 && (
            <>
              <SectionBar title="Vehicle Photos" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.photos.slice(1, 13).map((p, i) => (
                  <figure key={i} className="avoid-break min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || `Vehicle photo ${i + 2}`} className="aspect-[4/3] w-full rounded-xl bg-neutral-100 object-contain" />
                    {p.caption && <figcaption className="mt-2 break-words text-xs leading-relaxed text-neutral-600">{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </>
          )}
        </Page>

        {/* ── Back page ─────────────────────────────────────────────────── */}
        <Page dark className="relative flex flex-col items-center justify-between overflow-hidden text-center">
          <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-red-600/25 blur-3xl" />
          <div />
          <div className="relative px-10">
            <h2 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Thank You for Choosing
              <br />
              <span className="text-red-500">The Wheeler Dealers</span>
            </h2>
            <p className="mt-6 text-sm text-neutral-400">{BRAND.site}</p>
            <p className="mt-16 text-sm text-neutral-400">Buy. Sell. Trade. Smarter.</p>
            <div className="mt-16 flex justify-center">
              <BrandLogo light size="md" />
            </div>
          </div>
          <p className="relative mx-10 mb-8 text-[10px] leading-relaxed text-neutral-500">
            This report reflects the condition of the vehicle at the time and place of inspection, based on a visual
            and functional check by a Wheeler Dealers inspector. It is not a warranty or guarantee of future
            performance. Report No. {data.jobCode}.
          </p>
        </Page>
      </main>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Page({
  children,
  dark = false,
  flow = false,
  className = "",
}: {
  children: React.ReactNode;
  dark?: boolean;
  /** Content taller than one page flows onto the next instead of being clipped to A4. */
  flow?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`report-page mx-auto w-full max-w-[210mm] rounded-2xl shadow-lg print:shadow-none ${
        flow ? "" : "min-h-[297mm]"
      } ${dark ? "bg-neutral-950" : "bg-neutral-100 p-6 sm:p-8"} ${className}`}
    >
      {children}
    </section>
  );
}

function PageHeader() {
  return (
    <div className="mb-5 flex items-center justify-between">
      <BrandLogo size="sm" />
      <span className="text-xs text-neutral-400">{BRAND.bookTitle}</span>
    </div>
  );
}

function SectionBar({ title, right }: { title: string; right?: string }) {
  return (
    <div className="keep-with-next mt-5 flex items-center justify-between rounded-xl bg-neutral-900 px-5 py-3 text-white">
      <h2 className="text-base font-semibold">{title}</h2>
      {right && <span className="text-xs text-neutral-400">{right}</span>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>{children}</div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold text-neutral-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="font-semibold text-neutral-900">{v ?? "—"}</dd>
    </div>
  );
}

function Dot({ cls }: { cls: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

/** Pass / attention / fail donut using a conic gradient (prints cleanly). */
function Donut({ pass, attention, fail }: { pass: number; attention: number; fail: number }) {
  const a = pass;
  const b = pass + attention;
  const style = {
    background: `conic-gradient(#22c55e 0 ${a}%, #fbbf24 ${a}% ${b}%, #ef4444 ${b}% 100%)`,
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  } as React.CSSProperties;
  return (
    <div className="relative mx-auto h-40 w-40 rounded-full" style={style}>
      <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-neutral-900">
        <span className="text-3xl font-extrabold text-white">{pass}%</span>
        <span className="text-[11px] uppercase tracking-wider text-neutral-400">Pass</span>
      </div>
      {fail > 0 && (
        <span className="absolute -right-2 -top-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {fail}% fail
        </span>
      )}
    </div>
  );
}
