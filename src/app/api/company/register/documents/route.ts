import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, verifyCompanyUploadToken } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Vercel rejects request bodies over ~4.5 MB, so keep one file per request under it.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DOCS = 8;
const KINDS = ["trade_license", "vat_certificate", "iban_letter", "other"] as const;
type Kind = (typeof KINDS)[number];

/** Detects the real file type from its first bytes, ignoring the client-supplied MIME. */
function sniffType(b: Buffer): string | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

/**
 * POST /api/company/register/documents  (multipart/form-data)
 * Fields: token (from /register), kind, label (kind=other), file.
 * A still-pending applicant (upload token) can attach any document type;
 * trade licence, VAT certificate and IBAN letter are single-slot, so
 * re-uploading replaces the earlier file. A signed-in company (session
 * cookie) may only add its Bank IBAN Letter while its payout details are
 * incomplete — changing an existing letter goes through the admin team.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "company-docs", 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const tokenCompanyId = verifyCompanyUploadToken(form.get("token")?.toString());
  const sessionCompanyId = tokenCompanyId ? null : getCompanyId(req);
  const companyId = tokenCompanyId ?? sessionCompanyId;
  if (!companyId) {
    return NextResponse.json({ error: "Upload session expired. Please register again." }, { status: 401 });
  }
  const company = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: { id: true, approvalStatus: true, active: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const kind = form.get("kind")?.toString() as Kind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid document type." }, { status: 400 });
  }
  if (tokenCompanyId && company.approvalStatus !== "pending") {
    return NextResponse.json({ error: "Documents can only be added to a pending application." }, { status: 403 });
  }
  if (sessionCompanyId) {
    if (!company.active || kind !== "iban_letter") {
      return NextResponse.json({ error: "Only the Bank IBAN Letter can be added from your portal." }, { status: 403 });
    }
    const existingLetter = await prisma.companyDocument.findFirst({
      where: { companyId, kind: "iban_letter" },
      select: { id: true },
    });
    if (existingLetter) {
      return NextResponse.json(
        { error: "Your IBAN letter is already on file. Contact The Wheeler Dealers team to change it." },
        { status: 409 },
      );
    }
  }
  const label = (form.get("label")?.toString() ?? "").trim().slice(0, 80) || null;
  if (kind === "other" && !label) {
    return NextResponse.json({ error: "Please name the additional document." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Each file must be under 4 MB." }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffType(bytes);
  if (!mimeType) {
    return NextResponse.json({ error: "Please upload a PDF, JPG or PNG file." }, { status: 415 });
  }
  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";

  const count = await prisma.companyDocument.count({ where: { companyId } });
  const replacing = kind !== "other"
    ? await prisma.companyDocument.findFirst({ where: { companyId, kind }, select: { id: true } })
    : null;
  if (!replacing && count >= MAX_DOCS) {
    return NextResponse.json({ error: `You can attach up to ${MAX_DOCS} documents.` }, { status: 400 });
  }

  const data = { companyId, kind, label: kind === "other" ? label : null, fileName, mimeType, sizeBytes: bytes.length, data: bytes };
  const doc = replacing
    ? await prisma.companyDocument.update({ where: { id: replacing.id }, data })
    : await prisma.companyDocument.create({ data });

  return NextResponse.json({ ok: true, id: doc.id });
}
