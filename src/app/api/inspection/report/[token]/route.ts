import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  describeObservation,
  INSPECTION_SECTIONS,
  isLegacyCondition,
  itemType,
  PHOTO_SECTION_TITLE,
  type ItemValue,
} from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

/**
 * GET /api/inspection/report/[token]
 * ---------------------------------------------------------------------------
 * Public, unguessable customer report link. Returns the completed inspection
 * as a factual record — vehicle identification, every parameter's observation
 * grouped by numbered section, inspector comments and photo groups. Nothing
 * here grades, scores or recommends the vehicle: the customer decides.
 * 404 unless the job exists and is completed.
 */

const LEGACY_SECTION_ORDER = [
  "Tyres & Brakes",
  "Exterior",
  "Interior",
  "Electrical",
  "Mechanical",
  "Underbody",
  "Road Test",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const job = await prisma.inspectionJob.findUnique({
    where: { reportToken: token },
    include: {
      items: { orderBy: { order: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
      report: true,
      inspector: { select: { name: true } },
    },
  });

  if (!job || job.status !== "completed") {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  type Photo = { url: string; caption: string | null };
  const itemById = new Map(job.items.map((i) => [i.id, i]));

  // Photos attached to recorded parameters are shown against that parameter;
  // photos on the gallery slots (current "photos.*" or legacy "Photos"
  // section) and unattached photos form the Section 13 photo groups.
  const photosByItem = new Map<string, Photo[]>();
  const photoGroups = new Map<string, Photo[]>();
  const addGroup = (name: string, p: Photo) => {
    if (!photoGroups.has(name)) photoGroups.set(name, []);
    photoGroups.get(name)!.push(p);
  };
  for (const p of job.photos) {
    const photo = { url: p.url, caption: p.caption };
    const item = p.itemId ? itemById.get(p.itemId) : undefined;
    if (item && itemType(item.itemKey) !== "photo") {
      if (!photosByItem.has(item.id)) photosByItem.set(item.id, []);
      photosByItem.get(item.id)!.push(photo);
      addGroup(`Specific observation — ${item.label}`, photo);
    } else {
      addGroup(item ? item.label : "General", photo);
    }
  }
  // Cover image: a gallery/unattached photo only — never a specific finding.
  const isGallery = (p: { itemId: string | null }) =>
    !p.itemId || itemType(itemById.get(p.itemId)?.itemKey ?? "") === "photo";
  const coverPhoto =
    job.photos.find((p) => {
      const item = p.itemId ? itemById.get(p.itemId) : undefined;
      return item && itemType(item.itemKey) === "photo" && /exterior|front/i.test(item.label);
    }) ??
    job.photos.find(isGallery) ??
    null;

  // Group recorded parameters by section, in the client's section order.
  type Row = {
    label: string;
    observation: string;
    comments: string | null;
    photos: Photo[];
  };
  const bySection = new Map<string, Row[]>();
  let legacy = false;
  for (const i of job.items) {
    if (itemType(i.itemKey) === "photo" || i.section === "Photos" || i.section === "Summary") continue;
    if (isLegacyCondition(i.condition)) legacy = true;
    if (!bySection.has(i.section)) bySection.set(i.section, []);
    bySection.get(i.section)!.push({
      label: i.label,
      observation: describeObservation(i.itemKey, i.condition, i.value as ItemValue | null),
      comments: i.comments,
      photos: photosByItem.get(i.id) ?? [],
    });
  }
  const order = [
    ...INSPECTION_SECTIONS.filter((s) => s.title !== PHOTO_SECTION_TITLE).map((s) => s.title),
    ...LEGACY_SECTION_ORDER,
  ];
  const titles = Array.from(bySection.keys()).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const sections = titles.map((title, idx) => ({
    number: String(idx + 2).padStart(2, "0"),
    title,
    items: bySection.get(title)!,
  }));
  const recorded = sections.reduce(
    (n, s) => n + s.items.filter((it) => it.observation !== "Not recorded").length,
    0,
  );

  const r = job.report;
  // Legacy reports auto-generated a scored summary ("Inspected N points — …
  // Overall score X/10."); strip that wording and keep any inspector notes.
  const summary =
    r?.summary
      ?.replace(/Inspected \d+ points — [^.]*\./g, "")
      .replace(/Overall score [\d.]+\/10\./g, "")
      .replace(/\s{2,}/g, " ")
      .trim() || null;

  return NextResponse.json({
    jobCode: job.jobCode,
    vehicle: [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle",
    make: job.make,
    model: job.model,
    year: job.year,
    trim: job.trim,
    bodyClass: job.bodyClass,
    transmission: job.transmission,
    fuelType: job.fuelType,
    vin: job.vin,
    location: [job.city, job.emirate].filter(Boolean).join(", ") || null,
    customerName: job.customerName,
    inspectorName: job.inspector?.name ?? null,
    scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
    scheduledSlot: job.scheduledSlot,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    odometerKm: r?.odometerKm ?? null,
    odometerStatus: r?.odometerStatus ?? null,
    exteriorColor: r?.exteriorColor ?? null,
    regionalSpecs: r?.regionalSpecs ?? null,
    engineConfig: r?.engineConfig ?? null,
    keysCount: r?.keysCount ?? null,
    spareTyre: r?.spareTyre ?? null,
    diagnosticScan: r?.diagnosticScan ?? null,
    summary,
    limitations: r?.limitations ?? null,
    recorded,
    legacy,
    sections,
    coverPhoto: coverPhoto ? { url: coverPhoto.url, caption: coverPhoto.caption } : null,
    photoGroups: Array.from(photoGroups.entries()).map(([group, photos]) => ({ group, photos })),
  });
}
