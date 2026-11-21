import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminIdentity } from "@/lib/adminIdentity";
import { SAMPLE_PRODUCTS, fils } from "@/lib/care";

export const runtime = "nodejs";

/** POST /api/admin/care/products/sample — load the demo catalogue (marked "sample"); DELETE removes it. */
export async function POST(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (await prisma.careProduct.count({ where: { sample: true } })) return NextResponse.json({ error: "Sample products are already loaded." }, { status: 409 });
  await prisma.careProduct.createMany({
    data: SAMPLE_PRODUCTS.map((p) => ({
      category: p.category,
      name: p.name,
      brand: p.brand,
      description: p.description,
      priceFils: fils(p.priceAed),
      installFils: p.installAed == null ? null : fils(p.installAed),
      deliveryFils: p.deliveryAed == null ? null : fils(p.deliveryAed),
      compatibility: p.compatibility ?? null,
      sample: true,
    })),
  });
  return NextResponse.json({ ok: true, count: SAMPLE_PRODUCTS.length });
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminIdentity(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const done = await prisma.careProduct.deleteMany({ where: { sample: true } });
  return NextResponse.json({ ok: true, removed: done.count });
}
