import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import type { AdminLead } from "@/lib/types";

export const runtime = "nodejs";

const SORTABLE = new Set(["createdAt", "estimateMin", "year", "make", "name"]);

/**
 * GET /api/admin/leads
 * Full server-side search, filtering, sorting and pagination.
 *
 * Query params:
 *   q          free-text (name, email, mobile, make, model)
 *   intent     sell | trade | buy | dealer
 *   make       exact make
 *   condition  exact condition
 *   accident   exact accident value
 *   inspection booked | none
 *   dateFrom / dateTo   ISO dates (createdAt range)
 *   minPrice / maxPrice AED (matches on the estimate band)
 *   sort       createdAt | estimateMin | year | make | name
 *   order      asc | desc
 *   page       1-based (default 1)
 *   pageSize   default 20 (max 100)
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const intent = (sp.get("intent") ?? "").trim();
  const make = (sp.get("make") ?? "").trim();
  const condition = (sp.get("condition") ?? "").trim();
  const accident = (sp.get("accident") ?? "").trim();
  const inspection = (sp.get("inspection") ?? "").trim();
  const dateFrom = (sp.get("dateFrom") ?? "").trim();
  const dateTo = (sp.get("dateTo") ?? "").trim();
  const minPrice = Number(sp.get("minPrice"));
  const maxPrice = Number(sp.get("maxPrice"));

  const sort = SORTABLE.has(sp.get("sort") ?? "") ? sp.get("sort")! : "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));

  const and: Prisma.LeadWhereInput[] = [];

  if (intent) and.push({ intent });
  if (make) and.push({ make });
  if (condition) and.push({ condition });
  if (accident) and.push({ accident });
  if (inspection === "booked") and.push({ inspectionType: { not: null } });
  if (inspection === "none") and.push({ inspectionType: null });

  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999); // inclusive end-of-day
      createdAt.lte = d;
    }
    and.push({ createdAt });
  }

  // Price band overlap: lead's [min,max] intersects the requested [min,max].
  if (Number.isFinite(minPrice) && minPrice > 0) {
    and.push({ estimateMax: { gte: Math.round(minPrice) } });
  }
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    and.push({ estimateMin: { lte: Math.round(maxPrice) } });
  }

  if (q) {
    const insensitive = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { name: insensitive },
        { email: insensitive },
        { mobile: insensitive },
        { make: insensitive },
        { model: insensitive },
      ],
    });
  }

  const where: Prisma.LeadWhereInput = and.length ? { AND: and } : {};

  const [total, rows, allMakes, allIntents, allConditions] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.findMany({
      where: { make: { not: null } },
      select: { make: true },
      distinct: ["make"],
      orderBy: { make: "asc" },
    }),
    prisma.lead.findMany({ select: { intent: true }, distinct: ["intent"] }),
    prisma.lead.findMany({
      where: { condition: { not: null } },
      select: { condition: true },
      distinct: ["condition"],
    }),
  ]);

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "AED";
  const leads: AdminLead[] = rows.map((l) => ({
    id: l.id,
    intent: l.intent,
    createdAt: l.createdAt.toISOString(),
    make: l.make ?? "",
    model: l.model ?? "",
    year: l.year,
    mileage: l.mileage,
    condition: l.condition ?? "",
    accident: l.accident,
    serviceHistory: l.serviceHistory,
    previousOwners: l.previousOwners,
    warranty: l.warranty,
    keys: l.keys,
    modifications: l.modifications,
    estimateMin: l.estimateMin,
    estimateMax: l.estimateMax,
    currency: l.currency ?? currency,
    name: l.name ?? "",
    mobile: l.mobile ?? "",
    email: l.email ?? "",
    inspectionType: l.inspectionType,
    inspectionSlot: l.inspectionSlot,
    inspectionAt: l.inspectionAt ? l.inspectionAt.toISOString() : null,
  }));

  return NextResponse.json({
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    facets: {
      makes: allMakes.map((m) => m.make).filter(Boolean) as string[],
      intents: allIntents.map((i) => i.intent).filter(Boolean),
      conditions: allConditions.map((c) => c.condition).filter(Boolean) as string[],
    },
  });
}

/**
 * DELETE /api/admin/leads — bulk delete by ids.
 * Body: { ids: string[] }. Cascades to the lead's auction + bids first.
 */
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x) => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const auctions = await prisma.auction.findMany({
    where: { leadId: { in: ids } },
    select: { id: true },
  });
  const auctionIds = auctions.map((a) => a.id);
  if (auctionIds.length) {
    await prisma.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
    await prisma.auction.deleteMany({ where: { id: { in: auctionIds } } });
  }
  const result = await prisma.lead.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ ok: true, deleted: result.count });
}

