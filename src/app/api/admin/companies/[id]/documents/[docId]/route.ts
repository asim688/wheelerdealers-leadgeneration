import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/admin/companies/[id]/documents/[docId] — admin-only file download. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id, docId } = await params;
  const doc = await prisma.companyDocument.findFirst({ where: { id: docId, companyId: id } });
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(doc.sizeBytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
