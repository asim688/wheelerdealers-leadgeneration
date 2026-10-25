"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

/**
 * Customer-facing inspection report in The Wheeler Dealers' document format:
 * a plain A4 record of observations by vehicle system (numbered sections
 * 01–14) with navy parameter tables, photographic evidence and the scope /
 * customer-decision statement. It deliberately contains no pass/fail labels,
 * score, percentage or recommendation — "We document the facts. The customer
 * makes the decision."
 *
 * Print: the running header/footer live in a table <thead>/<tfoot> so they
 * repeat on every printed page; rows never split across pages.
 */

interface Photo {
  url: string;
  caption: string | null;
}
interface ReportRow {
  label: string;
  observation: string;
  comments: string | null;
  photos: Photo[];
}
interface ReportSection {
  number: string;
  title: string;
  items: ReportRow[];
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
  odometerKm: number | null;
  odometerStatus: string | null;
  exteriorColor: string | null;
  regionalSpecs: string | null;
  engineConfig: string | null;
  keysCount: number | null;
  spareTyre: string | null;
  diagnosticScan: string | null;
  summary: string | null;
  limitations: string | null;
  recorded: number;
  legacy: boolean;
  sections: ReportSection[];
  coverPhoto: Photo | null;
  photoGroups: Array<{ group: string; photos: Photo[] }>;
}

const BRAND = {
  name: "THE WHEELER DEALERS",
  sub: "INDEPENDENT VEHICLE INSPECTION",
  site: "www.thewheelerdealers.com",
  email: "info@thewheelerdealers.com",
  tagline: "We document the facts. The customer makes the decision.",
};

const NOT_RECORDED = "Not recorded";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function dash(v: string | number | null | undefined): string {
  return v == null || v === "" ? "—" : String(v);
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

  const total = data.sections.reduce((n, s) => n + s.items.length, 0);
  const n12 = String(data.sections.length + 2).padStart(2, "0");
  const n13 = String(data.sections.length + 3).padStart(2, "0");
  const n14 = String(data.sections.length + 4).padStart(2, "0");
  const when = `${fmtDate(data.completedAt ?? data.scheduledAt)}${data.scheduledSlot ? ` / ${data.scheduledSlot}` : ""}`;
  const odometer =
    data.odometerKm != null
      ? `${data.odometerKm.toLocaleString()} km${data.odometerStatus ? `; ${data.odometerStatus.toLowerCase()}` : ""}`
      : dash(data.odometerStatus);

  return (
    <div className="min-h-screen bg-neutral-200 text-neutral-900 print:bg-white">
      <style>{`
        @page { size: A4; margin: 10mm 10mm 12mm; }
        @media print {
          .report-sheet { width: auto; margin: 0; box-shadow: none; padding: 0; }
          .report-head { display: table-header-group; }
          .report-foot { display: table-footer-group; }
          tr, figure, .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          h2 { break-after: avoid; page-break-after: avoid; }
          .report-sheet thead.navy th, .navy { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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

      <main className="mx-auto max-w-[210mm] py-6 print:py-0">
        <table className="report-sheet w-full border-collapse bg-white shadow-lg print:shadow-none">
          <thead className="report-head">
            <tr>
              <td className="px-4 pt-6 pb-3 sm:px-8 print:px-0 print:pt-0">
                <div className="navy flex items-center justify-between gap-3 rounded-sm bg-[#1e3a5f] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  <span className="shrink-0">{BRAND.name}</span>
                  <span className="text-right font-medium tracking-[0.14em] text-white/80">Vehicle Inspection Report</span>
                </div>
              </td>
            </tr>
          </thead>
          <tfoot className="report-foot">
            <tr>
              <td className="px-4 pt-3 pb-6 sm:px-8 print:px-0 print:pb-0">
                <div className="flex items-center justify-between border-t border-neutral-300 pt-2 text-[9px] text-neutral-500">
                  <span>Report No. {data.jobCode} · Record of observations at the stated time and place; not a certification or guarantee.</span>
                  <span>{BRAND.site}</span>
                </div>
              </td>
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td className="px-4 py-2 align-top sm:px-8 print:px-0">
                {/* ── Title block ─────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xl font-extrabold tracking-tight text-[#1e3a5f]">{BRAND.name}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{BRAND.sub}</p>
                    <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">Vehicle Inspection Report</h1>
                    <p className="mt-1 text-sm text-neutral-600">
                      {data.vehicle} · Report No. <span className="font-mono">{data.jobCode}</span>
                    </p>
                    <p className="text-sm text-neutral-600">Prepared for {data.customerName}</p>
                  </div>
                  <BrandLogo size="md" />
                </div>
                <div className="mt-4 h-1 w-full bg-[#2b7a8c]" />

                {/* ── Vehicle details ─────────────────────────────────── */}
                <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
                  <Table head={["Vehicle details", "Recorded information"]} widths={["38%", "62%"]}>
                    <Row k="Make / model" v={[data.make, data.model].filter(Boolean).join(" ") || "—"} />
                    <Row k="Model year / regional specification" v={[data.year, data.regionalSpecs].filter(Boolean).join(" / ") || "—"} />
                    <Row k="VIN" v={dash(data.vin)} mono />
                    <Row k="Odometer" v={odometer} />
                    <Row k="Fuel / engine / transmission" v={[data.fuelType, data.engineConfig, data.transmission].filter(Boolean).join(" / ") || "—"} />
                    <Row k="Exterior colour / vehicle type" v={[data.exteriorColor, data.bodyClass].filter(Boolean).join(" / ") || "—"} />
                    <Row k="Keys / spare tyre" v={[data.keysCount != null ? `${data.keysCount} key${data.keysCount === 1 ? "" : "s"}` : null, data.spareTyre ? `spare tyre ${data.spareTyre.toLowerCase()}` : null].filter(Boolean).join(" / ") || "—"} />
                    <Row k="Inspection date / time" v={when} />
                    <Row k="Inspection location" v={dash(data.location)} />
                    <Row k="Inspector" v={dash(data.inspectorName)} />
                    <Row k="Inspection framework" v={`${total}-parameter inspection; ${data.recorded} recorded`} />
                  </Table>
                  {data.coverPhoto && (
                    <figure className="avoid-break w-full sm:w-56">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={data.coverPhoto.url} alt={data.coverPhoto.caption || data.vehicle} className="aspect-[4/3] w-full rounded-sm border border-neutral-300 bg-neutral-100 object-cover" />
                      <figcaption className="mt-1 text-[10px] text-neutral-500">{data.coverPhoto.caption || "Vehicle as presented for inspection"}</figcaption>
                    </figure>
                  )}
                </div>

                {/* ── Purpose and reading guide ───────────────────────── */}
                <h2 className="mt-7 text-lg font-bold text-[#1e3a5f]">Purpose and reading guide</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-neutral-700">
                  This report records observations by vehicle system. It does not certify the vehicle, grade overall
                  quality, or recommend whether it should be purchased. The customer makes the purchasing decision. No
                  pass/fail labels, overall score, pass percentage, or defect percentage are used.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-neutral-700">
                  <b>Observation wording:</b> &ldquo;No obvious issue observed&rdquo; records that nothing was found during
                  this check and is not a guarantee that a component is fault-free; &ldquo;Wear or damage observed&rdquo;
                  describes a finding, with details in the comment column; &ldquo;Not assessed / unavailable&rdquo;
                  identifies an inspection limitation; &ldquo;{NOT_RECORDED}&rdquo; means no entry was made for that
                  parameter.
                </p>
                {data.legacy && (
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                    This inspection was recorded with an earlier checklist; its entries have been reworded into the neutral
                    observation terms above.
                  </p>
                )}

                {/* ── 01 Vehicle identification ──────────────────────── */}
                <SectionHeading number="01" title="Vehicle identification and general details" />
                <Table head={["Parameter", "Observation / record"]} widths={["38%", "62%"]}>
                  <Row k="Make" v={dash(data.make)} />
                  <Row k="Model" v={dash([data.model, data.trim].filter(Boolean).join(" ") || null)} />
                  <Row k="Model year" v={dash(data.year)} />
                  <Row k="Regional specifications" v={dash(data.regionalSpecs)} />
                  <Row k="VIN / chassis number" v={dash(data.vin)} mono />
                  <Row k="Transmission type" v={dash(data.transmission)} />
                  <Row k="Engine configuration" v={dash(data.engineConfig)} />
                  <Row k="Odometer authenticity" v={dash(data.odometerStatus)} />
                  <Row k="Odometer reading" v={data.odometerKm != null ? `${data.odometerKm.toLocaleString()} km` : "—"} />
                  <Row k="Fuel type" v={dash(data.fuelType)} />
                  <Row k="Vehicle type" v={dash(data.bodyClass)} />
                  <Row k="Exterior colour" v={dash(data.exteriorColor)} />
                  <Row k="Spare tyre availability" v={dash(data.spareTyre)} />
                  <Row k="Number of keys" v={dash(data.keysCount)} />
                </Table>

                {/* ── 02–11 Recorded parameters ──────────────────────── */}
                {data.sections.map((s) => (
                  <div key={s.title}>
                    <SectionHeading number={s.number} title={s.title} />
                    <Table head={["Parameter", "Observation / record", "Comment / observations"]} widths={["30%", "36%", "34%"]}>
                      {s.items.map((it, i) => (
                        <tr key={i} className="border-b border-neutral-200 align-top odd:bg-white even:bg-neutral-50">
                          <td className="px-3 py-2 text-[11px] font-semibold text-neutral-800">{it.label}</td>
                          <td className={`px-3 py-2 text-[11px] ${it.observation === NOT_RECORDED ? "text-neutral-400" : "text-neutral-800"}`}>
                            {it.observation}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-neutral-700">
                            {it.comments || <span className="text-neutral-400">—</span>}
                            {it.photos.length > 0 && (
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {it.photos.slice(0, 4).map((p, j) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={j} src={p.url} alt={p.caption || `${it.label} photo ${j + 1}`} className="h-12 w-16 rounded-sm border border-neutral-300 object-cover" />
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                ))}

                {/* ── 12 Diagnostic scan and inspector comments ──────── */}
                <SectionHeading number={n12} title="Diagnostic scan and inspector comments" />
                <Table head={["Parameter", "Observation / record"]} widths={["30%", "70%"]}>
                  <Row k="Diagnostic scan history" v={data.diagnosticScan || NOT_RECORDED} muted={!data.diagnosticScan} pre />
                  <Row k="Additional observations" v={data.summary || "No additional observations recorded."} muted={!data.summary} pre />
                  <Row k="Inspection limitations" v={data.limitations || "No limitations recorded."} muted={!data.limitations} pre />
                </Table>

                {/* ── 13 Photographic evidence ───────────────────────── */}
                <SectionHeading number={n13} title="Photographic evidence and attachments" />
                {data.photoGroups.length === 0 ? (
                  <p className="mt-2 text-[12px] text-neutral-500">No photographs were attached to this report.</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    {data.photoGroups.map((g) => (
                      <div key={g.group} className="avoid-break">
                        <div className="navy flex items-center justify-between bg-[#2b7a8c] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          <span>{g.group}</span>
                          <span className="font-medium normal-case tracking-normal text-white/80">{g.photos.length} photo{g.photos.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 border border-t-0 border-neutral-300 p-2 sm:grid-cols-4">
                          {g.photos.map((p, i) => (
                            <figure key={i} className="min-w-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={p.caption || `${g.group} ${i + 1}`} className="aspect-[4/3] w-full rounded-sm bg-neutral-100 object-cover" />
                              {p.caption && <figcaption className="mt-1 break-words text-[10px] leading-snug text-neutral-600">{p.caption}</figcaption>}
                            </figure>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 14 Scope, limitations and customer decision ────── */}
                <div className="avoid-break">
                <SectionHeading number={n14} title="Scope, limitations and customer decision" />
                <p className="mt-2 text-[12px] leading-relaxed text-neutral-700">
                  This report is a record of observations made during the inspection at the stated time. A visual,
                  non-invasive inspection may not identify concealed, intermittent or future faults. Where access or test
                  conditions limited the assessment, the limitation is stated in the report.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-neutral-700">
                  The report does not certify that the vehicle is safe, fault-free, mechanically sound, approved or
                  suitable for purchase. No finding should be interpreted as a guarantee. The customer is responsible for
                  reviewing the information and making their own purchasing decision.
                </p>
                <div className="avoid-break mt-5 border-l-4 border-[#1e3a5f] bg-neutral-50 px-4 py-3">
                  <p className="text-xs font-bold tracking-wide text-[#1e3a5f]">{BRAND.name}</p>
                  <p className="mt-0.5 text-sm text-neutral-800">{BRAND.tagline}</p>
                  <p className="mt-2 text-[10px] text-neutral-500">
                    {BRAND.site} · {BRAND.email} · Report No. {data.jobCode}
                  </p>
                </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </main>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function SectionHeading({ number, title }: { number: string; title: string }) {
  return <h2 className="mt-7 text-lg font-bold text-[#1e3a5f]">{number}. {title}</h2>;
}

function Table({
  head,
  widths,
  children,
}: {
  head: string[];
  widths: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="mt-2 w-full border-collapse border border-neutral-300 text-left">
      <colgroup>
        {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
      </colgroup>
      <thead className="navy">
        <tr className="bg-[#1e3a5f] text-white">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ k, v, mono = false, muted = false, pre = false }: { k: string; v: string; mono?: boolean; muted?: boolean; pre?: boolean }) {
  return (
    <tr className="border-b border-neutral-200 align-top odd:bg-white even:bg-neutral-50">
      <td className="px-3 py-2 text-[11px] font-semibold text-neutral-800">{k}</td>
      <td className={`px-3 py-2 text-[11px] ${muted ? "text-neutral-400" : "text-neutral-800"} ${mono ? "font-mono" : ""} ${pre ? "whitespace-pre-line" : ""}`}>{v}</td>
    </tr>
  );
}
