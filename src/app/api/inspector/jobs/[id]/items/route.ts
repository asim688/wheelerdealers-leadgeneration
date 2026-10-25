import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";
import { itemType, optionsFor, VALUE_KEYS } from "@/lib/inspectionChecklist";

export const runtime = "nodejs";

interface ItemPatch {
  itemKey: string;
  condition?: string | null;
  comments?: string | null;
  value?: Record<string, unknown> | null;
}

/**
 * PATCH /api/inspector/jobs/[id]/items
 * ---------------------------------------------------------------------------
 * Autosave endpoint. Body: { items: [{ itemKey, condition?, comments?, value? }] }.
 * `condition` must be one of the neutral observation choices for the item's
 * type; `value` carries structured measurements (tyre DOT/tread, paint
 * thickness). Returns the recorded count (photo slots excluded).
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
  const cleanCondition = (itemKey: string, v: unknown): string | null => {
    const s = clean(v, 60);
    if (!s) return null;
    return optionsFor(itemType(itemKey)).includes(s) ? s : null;
  };
  // Keep only known measurement keys with short string values; an empty
  // object clears the column.
  const cleanValue = (v: unknown): Prisma.InputJsonObject | typeof Prisma.JsonNull => {
    if (!v || typeof v !== "object") return Prisma.JsonNull;
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const s = clean(raw, 20);
      if (VALUE_KEYS.has(k) && s) out[k] = s;
    }
    return Object.keys(out).length ? out : Prisma.JsonNull;
  };

  await prisma.$transaction(
    patches
      .filter((p) => p && typeof p.itemKey === "string")
      .map((p) =>
        prisma.inspectionItem.updateMany({
          where: { jobId: job.id, itemKey: p.itemKey },
          data: {
            ...(p.condition !== undefined ? { condition: cleanCondition(p.itemKey, p.condition) } : {}),
            ...(p.comments !== undefined ? { comments: clean(p.comments, 1000) } : {}),
            ...(p.value !== undefined ? { value: cleanValue(p.value) } : {}),
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
    WHERE "jobId" = ${job.id} AND "itemKey" NOT LIKE 'photos.%'
  `;

  return NextResponse.json({
    ok: true,
    answered: Number(tally?.answered ?? 0),
    total: Number(tally?.total ?? 0),
  });
}
