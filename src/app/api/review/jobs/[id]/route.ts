import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitRequest } from "@/lib/rateLimit";
import { applyReviewerEdits, findReviewableJob, getReviewer, REPORT_EDIT_FIELDS, type ItemEdit } from "@/lib/review";
import { isRecordable, itemType, optionsFor, VALUE_FIELDS } from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

/**
 * GET /api/review/jobs/[id] — everything a reviewer (account manager / super
 * admin) needs: job summary, every recorded parameter with its options, the
 * Section 01/12 report fields and the review activity log.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  if (!(await findReviewableJob(reviewer, id))) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const job = await prisma.inspectionJob.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" } },
      report: true,
      inspector: { select: { name: true, email: true, phone: true } },
      acceptedByCompany: { select: { name: true } },
      activity: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const r = job.report;

  return NextResponse.json({
    reviewer: { type: reviewer.type, name: reviewer.name },
    job: {
      id: job.id,
      jobCode: job.jobCode,
      status: job.status,
      vehicle: [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle",
      vin: job.vin,
      location: [job.address, job.city, job.emirate].filter(Boolean).join(", "),
      customerName: job.customerName,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      scheduledSlot: job.scheduledSlot,
      reportSubmittedAt: job.reportSubmittedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      company: job.acceptedByCompany?.name ?? null,
      inspector: job.inspector,
    },
    report: r
      ? {
          ...Object.fromEntries(Object.keys(REPORT_EDIT_FIELDS).map((k) => [k, (r as Record<string, unknown>)[k] ?? null])),
          verifiedAt: r.verifiedAt?.toISOString() ?? null,
          verifiedByName: r.verifiedByName,
          returnedAt: r.returnedAt?.toISOString() ?? null,
          returnNote: r.returnNote,
        }
      : null,
    items: job.items
      .filter((i) => isRecordable(i.itemKey) && i.section !== "Photos" && i.section !== "Summary")
      .map((i) => {
        const type = itemType(i.itemKey);
        return {
          itemKey: i.itemKey,
          section: i.section,
          label: i.label,
          options: optionsFor(type),
          valueFields: VALUE_FIELDS[type] ?? [],
          condition: i.condition,
          comments: i.comments,
          value: (i.value as Record<string, string> | null) ?? null,
        };
      }),
    activity: job.activity.map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      actorType: a.actorType,
      actorName: a.actorName,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

/** PATCH /api/review/jobs/[id] — body { items?: ItemEdit[], report?: {...} }. Audited reviewer edits. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimitRequest(req, "review-edit", 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  const reviewer = await getReviewer(req);
  if (!reviewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  if (!(await findReviewableJob(reviewer, id))) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let body: { items?: ItemEdit[]; report?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await applyReviewerEdits(
    reviewer,
    id,
    Array.isArray(body.items) ? body.items : [],
    body.report && typeof body.report === "object" ? body.report : {},
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, changed: result.changed });
}
