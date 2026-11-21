import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/rateLimit";
import { generateCareCode } from "@/lib/care";

export const runtime = "nodejs";

/** GET /api/care/orders — the signed-in customer's product orders. */
export async function GET(req: NextRequest) {
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Not authenticated", loginRequired: true }, { status: 401 });
  const orders = await prisma.careOrder.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({
    orders: orders.map((o) => ({ id: o.id, code: o.code, status: o.status, totalFils: o.totalFils, items: o.items, fulfilment: o.fulfilment, createdAt: o.createdAt.toISOString() })),
  });
}

/**
 * POST /api/care/orders { items: [{ productId, qty }], fulfilment: "delivery" | "installation", address, emirate, vehicle }
 * Prices are always re-read from the catalogue; the client's totals are never trusted.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, "care-order", 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  const customerId = getCustomerId(req);
  if (!customerId) return NextResponse.json({ error: "Please verify your mobile number to place the order.", loginRequired: true }, { status: 401 });
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return NextResponse.json({ error: "Please sign in again.", loginRequired: true }, { status: 401 });

  let b: { items?: Array<{ productId?: string; qty?: number }>; fulfilment?: string; address?: string; emirate?: string; vehicle?: string; customerName?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const lines = (b.items ?? []).filter((i) => i.productId && Number.isInteger(i.qty) && i.qty! > 0 && i.qty! <= 10);
  if (!lines.length) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  const fulfilment = b.fulfilment === "installation" ? "installation" : "delivery";
  const address = (b.address ?? "").trim();
  const name = (b.customerName ?? customer.name ?? "").trim();
  if (!address) return NextResponse.json({ error: "Please add the delivery / installation address." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Please add your name." }, { status: 400 });

  const products = await prisma.careProduct.findMany({ where: { id: { in: lines.map((l) => l.productId!) }, active: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  if (lines.some((l) => !byId.get(l.productId!)?.inStock)) return NextResponse.json({ error: "One of the items is no longer available. Please refresh your cart." }, { status: 409 });

  const items = lines.map((l) => {
    const p = byId.get(l.productId!)!;
    return { productId: p.id, name: p.name, brand: p.brand, qty: l.qty!, unitFils: p.priceFils, installFils: fulfilment === "installation" ? p.installFils ?? 0 : 0, deliveryFils: p.deliveryFils ?? 0 };
  });
  const subtotalFils = items.reduce((s, i) => s + i.unitFils * i.qty, 0);
  // Installation charge per unit; delivery charged once (highest delivery fee in the cart).
  const chargesFils =
    items.reduce((s, i) => s + i.installFils * i.qty, 0) + (fulfilment === "delivery" ? Math.max(0, ...items.map((i) => i.deliveryFils)) : 0);

  const order = await prisma.careOrder.create({
    data: {
      code: await generateCareCode("ORD"),
      customerId,
      customerName: name.slice(0, 120),
      customerMobile: customer.mobile,
      customerEmail: customer.emailVerifiedAt ? customer.email : null,
      items,
      fulfilment,
      address: address.slice(0, 400),
      emirate: (b.emirate ?? "").slice(0, 40) || null,
      vehicle: (b.vehicle ?? "").slice(0, 120) || null,
      subtotalFils,
      chargesFils,
      totalFils: subtotalFils + chargesFils,
    },
  });
  return NextResponse.json({ ok: true, id: order.id, code: order.code, totalFils: order.totalFils });
}
