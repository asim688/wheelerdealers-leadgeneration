import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { productInput } from "@/lib/careProducts";

export const runtime = "nodejs";

/** GET /api/admin/care/products — whole catalogue, including inactive items. */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const products = await prisma.careProduct.findMany({ orderBy: [{ category: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json({ products });
}

/** POST /api/admin/care/products — add a product (prices in AED, VAT inclusive). */
export async function POST(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = productInput(await req.json().catch(() => null), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = await prisma.careProduct.create({ data: parsed.data as Parameters<typeof prisma.careProduct.create>[0]["data"] });
  return NextResponse.json({ ok: true, id: p.id });
}
