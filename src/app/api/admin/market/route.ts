import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import type { AdminMarketListing } from "@/lib/types";

export const runtime = "nodejs";

const SORTABLE = new Set(["createdAt", "priceAed", "year", "make", "mileageKm"]);

/**
 * GET /api/admin/market — browse the scraped CarListing market data.
 *
 * Query params:
 *   q          free-text (make, model, trim, title, location)
 *   source     exact source (dubizzle | yallamotor | ...)
 *   make       exact make
 *   year       exact year
 *   minPrice / maxPrice   AED
 *   sort       createdAt | priceAed | year | make | mileageKm
 *   order      asc | desc
 *   page / pageSize (max 100)
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const source = (sp.get("source") ?? "").trim();
  const make = (sp.get("make") ?? "").trim();
  const year = Number(sp.get("year"));
  const minPrice = Number(sp.get("minPrice"));
  const maxPrice = Number(sp.get("maxPrice"));

  const sort = SORTABLE.has(sp.get("sort") ?? "") ? sp.get("sort")! : "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));

  const and: Prisma.CarListingWhereInput[] = [];
  if (source) and.push({ source });
  if (make) and.push({ make });
  if (Number.isFinite(year) && year > 1900) and.push({ year });
  if (Number.isFinite(minPrice) && minPrice > 0)
    and.push({ priceAed: { gte: Math.round(minPrice) } });
  if (Number.isFinite(maxPrice) && maxPrice > 0)
    and.push({ priceAed: { lte: Math.round(maxPrice) } });
  if (q) {
    const insensitive = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { make: insensitive },
        { model: insensitive },
        { trim: insensitive },
        { title: insensitive },
        { location: insensitive },
      ],
    });
  }
  const where: Prisma.CarListingWhereInput = and.length ? { AND: and } : {};

  const [total, rows, sources, makes] = await Promise.all([
    prisma.carListing.count({ where }),
    prisma.carListing.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.carListing.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.carListing.findMany({
      select: { make: true },
      distinct: ["make"],
      orderBy: { make: "asc" },
    }),
  ]);

  const listings: AdminMarketListing[] = rows.map((l) => ({
    id: l.id,
    title: l.title ?? "",
    make: l.make,
    model: l.model ?? "",
    trim: l.trim ?? "",
    year: l.year,
    mileageKm: l.mileageKm,
    specs: l.specs ?? "",
    transmission: l.transmission ?? "",
    priceAed: l.priceAed,
    location: l.location ?? "",
    source: l.source,
    createdAt: l.createdAt.toISOString(),
  }));

  return NextResponse.json({
    listings,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    facets: {
      sources: sources.map((s) => ({ source: s.source, count: s._count._all })),
      makes: makes.map((m) => m.make).filter(Boolean),
    },
  });
}
