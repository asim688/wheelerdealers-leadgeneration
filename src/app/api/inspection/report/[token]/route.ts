import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/inspection/report/[token]
 * ---------------------------------------------------------------------------
 * Public, unguessable customer report link. Returns the completed inspection
 * report (vehicle, score, section results, photos, summary) for the given
 * report token. 404 unless the job exists and is completed.
 */
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

  // Photos attached to specific points, keyed by item id; the rest are general.
  // Photos on the checklist's "Photos" section (front/rear/odometer…) are the
  // vehicle gallery, so they count as general too.
  const gallerySectionItemIds = new Set(
    job.items.filter((i) => i.section === "Photos").map((i) => i.id),
  );
  const photosByItem = new Map<string, Array<{ url: string; caption: string | null }>>();
  const generalPhotos: Array<{ url: string; caption: string | null }> = [];
  for (const p of job.photos) {
    const photo = { url: p.url, caption: p.caption };
    if (p.itemId && !gallerySectionItemIds.has(p.itemId)) {
      if (!photosByItem.has(p.itemId)) photosByItem.set(p.itemId, []);
      photosByItem.get(p.itemId)!.push(photo);
    } else {
      generalPhotos.push(photo);
    }
  }

  // Group items by section, keeping only rated points for the customer view.
  type Item = {
    label: string;
    condition: string | null;
    comments: string | null;
    photos: Array<{ url: string; caption: string | null }>;
  };
  const sectionsMap = new Map<string, Item[]>();
  for (const i of job.items) {
    if (!sectionsMap.has(i.section)) sectionsMap.set(i.section, []);
    sectionsMap.get(i.section)!.push({
      label: i.label,
      condition: i.condition,
      comments: i.comments,
      photos: photosByItem.get(i.id) ?? [],
    });
  }
  const sections = Array.from(sectionsMap.entries()).map(([title, items]) => {
    const rated = items.filter((it) => it.condition);
    const counted = rated.filter((it) => it.condition !== "N/A");
    return {
      title,
      rated: rated.length,
      total: items.length,
      pass: counted.filter((it) => it.condition === "Good").length,
      attention: counted.filter((it) => it.condition === "Fair").length,
      fail: counted.filter((it) => it.condition === "Poor" || it.condition === "Fail").length,
      items: rated,
    };
  });

  const flagged = job.items
    .filter((i) => i.condition === "Poor" || i.condition === "Fail")
    .map((i) => ({ section: i.section, label: i.label, condition: i.condition, comments: i.comments }));

  // Overall pass / attention / defect split across all rated (non-N/A) points.
  const counted = job.items.filter((i) => i.condition && i.condition !== "N/A");
  const stats = {
    checked: counted.length,
    pass: counted.filter((i) => i.condition === "Good").length,
    attention: counted.filter((i) => i.condition === "Fair").length,
    fail: counted.filter((i) => i.condition === "Poor" || i.condition === "Fail").length,
  };

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
    overallScore: job.report?.overallScore ?? null,
    summary: job.report?.summary ?? null,
    recommendations: job.report?.recommendations ?? null,
    odometerKm: job.report?.odometerKm ?? null,
    odometerStatus: job.report?.odometerStatus ?? null,
    exteriorColor: job.report?.exteriorColor ?? null,
    regionalSpecs: job.report?.regionalSpecs ?? null,
    keysCount: job.report?.keysCount ?? null,
    spareTyre: job.report?.spareTyre ?? null,
    verdict: job.report?.verdict ?? null,
    stats,
    sections,
    flagged,
    photos: generalPhotos,
  });
}
