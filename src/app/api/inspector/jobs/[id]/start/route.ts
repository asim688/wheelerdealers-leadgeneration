import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { flattenChecklist } from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

/**
 * POST /api/inspector/jobs/[id]/start
 * ---------------------------------------------------------------------------
 * Begins an inspection: materialises the checklist template into per-job
 * InspectionItem rows (once) and marks the job in_progress. Idempotent — if
 * items already exist it just returns the current state.
 */
export async function POST(
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
    include: { _count: { select: { items: true } } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job._count.items === 0) {
    const rows = flattenChecklist().map((r) => ({
      jobId: job.id,
      section: r.section,
      itemKey: r.itemKey,
      label: r.label,
      order: r.order,
    }));
    await prisma.inspectionItem.createMany({ data: rows });
  }

  // Only an active (accepted/assigned) job can move to in_progress — never
  // regress a submitted or completed job.
  if (["accepted", "assigned", "in_progress"].includes(job.status)) {
    await prisma.inspectionJob.update({
      where: { id: job.id },
      data: {
        status: "in_progress",
        startedAt: job.startedAt ?? new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
