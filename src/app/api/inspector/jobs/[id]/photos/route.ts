import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getInspectorId } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

/** Detects the real image type from its first bytes, ignoring the client-supplied name and MIME. */
function sniffImage(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(4, 8).toString("latin1") === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(b.subarray(8, 12).toString("latin1"))) return "image/heic";
  return null;
}

/** Blob is the real store; local disk is a dev-only stand-in so QA can run without it. */
// Vercel added the store with a "WD_" prefix, so accept both env names.
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.WD_BLOB_READ_WRITE_TOKEN;
const hasBlob = () => Boolean(blobToken());
const canUseLocalFallback = () => process.env.NODE_ENV !== "production";

/** Writes the upload under public/uploads so the dev server can serve it back. */
async function storeLocally(bytes: Buffer, jobCode: string, ext: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "inspections", jobCode);
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.writeFile(path.join(dir, name), bytes);
  return `/uploads/inspections/${jobCode}/${name}`;
}

/**
 * POST /api/inspector/jobs/[id]/photos  (multipart/form-data)
 * ---------------------------------------------------------------------------
 * Uploads an inspection photo to Vercel Blob and links it to the job (and an
 * item, if `itemKey` is provided). Degrades gracefully when Blob isn't
 * configured (no BLOB_READ_WRITE_TOKEN) so local dev still works.
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
    select: { id: true, status: true, jobCode: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!hasBlob() && !canUseLocalFallback()) {
    return NextResponse.json(
      { error: "Photo storage isn't configured yet. Connect Vercel Blob to enable photo uploads." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  const itemKey = (form.get("itemKey") ?? "").toString().trim();
  const caption = (form.get("caption") ?? "").toString().trim().slice(0, 200) || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!OK_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be a non-empty file under 8 MB." }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImage(bytes);
  if (!contentType) {
    return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 415 });
  }

  let itemId: string | null = null;
  if (itemKey) {
    const item = await prisma.inspectionItem.findFirst({
      where: { jobId: job.id, itemKey },
      select: { id: true },
    });
    itemId = item?.id ?? null;
  }

  try {
    const ext = EXT[contentType];
    const url = hasBlob()
      ? (
          await put(`inspections/${job.jobCode}/${Date.now()}.${ext}`, bytes, {
            access: "public",
            contentType,
            addRandomSuffix: true,
            token: blobToken(),
          })
        ).url
      : await storeLocally(bytes, job.jobCode, ext);
    const photo = await prisma.inspectionPhoto.create({
      data: { jobId: job.id, itemId, url, caption },
    });
    return NextResponse.json({
      ok: true,
      photo: { id: photo.id, url: photo.url, itemId: photo.itemId },
    });
  } catch (err) {
    console.error("Photo upload failed:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}
