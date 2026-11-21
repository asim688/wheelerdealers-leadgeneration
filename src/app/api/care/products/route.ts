import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fitsVehicle } from "@/lib/care";

export const runtime = "nodejs";

/** GET /api/care/products?category=battery&make=Toyota&model=Camry&year=2020&q=… — active catalogue, filtered by vehicle fit. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const make = sp.get("make")?.trim() || undefined;
  const model = sp.get("model")?.trim() || undefined;
  const year = Number(sp.get("year")) || null;
  const q = sp.get("q")?.trim().toLowerCase();
  const rows = await prisma.careProduct.findMany({
    where: { active: true, ...(category ? { category } : {}) },
    orderBy: [{ category: "asc" }, { priceFils: "asc" }],
  });
  const products = rows
    .filter((p) => fitsVehicle(p.compatibility, { make, model, year }))
    .filter((p) => !q || `${p.name} ${p.brand ?? ""} ${p.description ?? ""} ${p.category}`.toLowerCase().includes(q))
    .map((p) => ({
      id: p.id,
      category: p.category,
      name: p.name,
      brand: p.brand,
      description: p.description,
      imageUrl: p.imageUrl,
      priceFils: p.priceFils,
      installFils: p.installFils,
      deliveryFils: p.deliveryFils,
      compatibility: p.compatibility,
      universal: !p.compatibility?.trim(),
      inStock: p.inStock,
      sample: p.sample,
    }));
  return NextResponse.json({ products });
}
