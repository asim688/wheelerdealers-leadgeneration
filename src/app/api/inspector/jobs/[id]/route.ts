import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { isRecordable, TOTAL_ITEMS } from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

/** GET /api/inspector/jobs/[id] — full job detail + inspection items. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const inspectorId = getInspectorId(req);
  if (!inspectorId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const job = await prisma.inspectionJob.findFirst({
    where: { id, assignedInspectorId: inspectorId },
    include: {
      items: { orderBy: { order: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
      report: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Photo slots are evidence, not recorded parameters — exclude from progress.
  const recordable = job.items.filter((i) => isRecordable(i.itemKey));
  const answered = recordable.filter((i) => i.condition && i.condition.length > 0).length;

  return NextResponse.json({
    job: {
      id: job.id,
      jobCode: job.jobCode,
      status: job.status,
      customer: {
        name: job.customerName,
        mobile: job.customerMobile,
        email: job.customerEmail,
      },
      vehicle: {
        label: [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle",
        vin: job.vin,
        make: job.make,
        model: job.model,
        year: job.year,
        trim: job.trim,
        transmission: job.transmission,
        fuelType: job.fuelType,
      },
      location: {
        address: job.address,
        city: job.city,
        emirate: job.emirate,
        full: [job.address, job.city, job.emirate].filter(Boolean).join(", "),
      },
      scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
      scheduledSlot: job.scheduledSlot,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    },
    items: job.items.map((i) => ({
      id: i.id,
      section: i.section,
      itemKey: i.itemKey,
      label: i.label,
      condition: i.condition,
      comments: i.comments,
      value: (i.value as Record<string, string> | null) ?? null,
      order: i.order,
    })),
    photos: job.photos.map((p) => ({
      id: p.id,
      itemId: p.itemId,
      url: p.url,
      caption: p.caption,
    })),
    report: job.report
      ? {
          summary: job.report.summary,
          diagnosticScan: job.report.diagnosticScan,
          limitations: job.report.limitations,
          odometerKm: job.report.odometerKm,
          odometerStatus: job.report.odometerStatus,
          exteriorColor: job.report.exteriorColor,
          regionalSpecs: job.report.regionalSpecs,
          engineConfig: job.report.engineConfig,
          keysCount: job.report.keysCount,
          spareTyre: job.report.spareTyre,
          generatedAt: job.report.generatedAt.toISOString(),
        }
      : null,
    progress: {
      answered,
      total: recordable.length || TOTAL_ITEMS,
      started: job.items.length > 0,
    },
  });
}
