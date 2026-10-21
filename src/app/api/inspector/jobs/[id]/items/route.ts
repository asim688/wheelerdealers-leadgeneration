import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";

export const runtime = "nodejs";

interface ItemPatch {
  itemKey: string;
  condition?: string | null;
  comments?: string | null;
}

/**
 * PATCH /api/inspector/jobs/[id]/items
 * ---------------------------------------------------------------------------
 * Autosave endpoint. Body: { items: [{ itemKey, condition?, comments? }] }.
 * Updates the matching per-job inspection items. Returns the new answered count.
 */
export async function PATCH(
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
    select: { id: true, status: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "completed") {
    return NextResponse.json({ error: "This inspection is already submitted." }, { status: 409 });
  }

  let body: { items?: ItemPatch[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const patches = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
  if (!patches.length) {
    return NextResponse.json({ error: "No items to save." }, { status: 400 });
  }

  const clean = (v: unknown, max: number): string | null => {
    if (v == null) return null;
    const s = v.toString().trim();
    return s.length ? s.slice(0, max) : null;
  };

  await prisma.$transaction(
    patches
      .filter((p) => p && typeof p.itemKey === "string")
      .map((p) =>
        prisma.inspectionItem.updateMany({
          where: { jobId: job.id, itemKey: p.itemKey },
          data: {
            ...(p.condition !== undefined ? { condition: clean(p.condition, 20) } : {}),
            ...(p.comments !== undefined ? { comments: clean(p.comments, 1000) } : {}),
          },
        }),
      ),
  );

  // One round trip instead of two separate COUNT queries — Neon latency makes
  // every extra query a real cost on this hot autosave path.
  const [tally] = await prisma.$queryRaw<{ answered: bigint; total: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE "condition" IS NOT NULL) AS answered,
           COUNT(*) AS total
    FROM "InspectionItem"
    WHERE "jobId" = ${job.id}
  `;

  return NextResponse.json({
    ok: true,
    answered: Number(tally?.answered ?? 0),
    total: Number(tally?.total ?? 0),
  });}
