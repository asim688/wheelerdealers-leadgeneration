import crypto from "node:crypto";
import { getBaseUrl } from "./inspection";

/**
 * ----------------------------------------------------------------------------
 * Tamara — buy-now-pay-later checkout (UAE). Dependency-free REST client.
 * ----------------------------------------------------------------------------
 * Flow: create checkout → customer pays on Tamara → Tamara redirects back and
 * posts an `order_approved` notification → we authorise + capture the order
 * (a service paid up-front is fulfilled at booking) → the job is released.
 *
 * Required env:
 *   TAMARA_API_TOKEN           merchant API token (Bearer)
 *   TAMARA_NOTIFICATION_TOKEN  HS256 secret Tamara signs webhook JWTs with
 * Optional:
 *   TAMARA_API_URL             default https://api.tamara.co (sandbox: https://api-sandbox.tamara.co)
 * ----------------------------------------------------------------------------
 */

const API_URL = () => (process.env.TAMARA_API_URL || "https://api.tamara.co").replace(/\/$/, "");

export function isTamaraConfigured(): boolean {
  return !!process.env.TAMARA_API_TOKEN && !!process.env.TAMARA_NOTIFICATION_TOKEN;
}

async function tamaraFetch<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const token = process.env.TAMARA_API_TOKEN;
  if (!token) return { ok: false, status: 0, error: "Tamara is not configured" };
  try {
    const res = await fetch(`${API_URL()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data as { message?: string } | null)?.message || text.slice(0, 300) || res.statusText;
      console.error(`Tamara ${init?.method ?? "GET"} ${path} failed:`, res.status, msg);
      return { ok: false, status: res.status, error: msg };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    console.error(`Tamara ${path} error:`, err);
    return { ok: false, status: 0, error: "Could not reach Tamara" };
  }
}

export interface TamaraInstalmentOption {
  instalments: number;
  minAmount: number;
  maxAmount: number;
}

/** Instalment plans the merchant account offers for this amount (empty when none / on error). */
export async function getTamaraInstalmentOptions(amount: number, currency = "AED"): Promise<TamaraInstalmentOption[]> {
  const q = new URLSearchParams({ country: "AE", currency, order_value: String(amount) });
  const res = await tamaraFetch<Array<{ name: string; supported_instalments?: Array<{ instalments: number; min_limit: { amount: number }; max_limit: { amount: number } }> }>>(
    `/checkout/payment-types?${q}`,
  );
  if (!res.ok || !Array.isArray(res.data)) return [];
  const plan = res.data.find((p) => p.name === "PAY_BY_INSTALMENTS");
  return (plan?.supported_instalments ?? [])
    .map((o) => ({ instalments: o.instalments, minAmount: o.min_limit.amount, maxAmount: o.max_limit.amount }))
    .filter((o) => amount >= o.minAmount && amount <= o.maxAmount)
    .sort((a, b) => a.instalments - b.instalments);
}

const splitName = (full: string): { first: string; last: string } => {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] }; // Tamara requires both
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
};

/** Tamara wants the national number without country code, e.g. 50xxxxxxx. */
const localPhone = (mobile: string): string => mobile.replace(/\D/g, "").replace(/^(00)?971/, "").replace(/^0/, "");

export interface TamaraJob {
  id: string;
  jobCode: string;
  fee: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  address: string | null;
  city: string | null;
  emirate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  customerCreatedAt?: Date | null;
}

const money = (amount: number, currency: string) => ({ amount: Number(amount.toFixed(2)), currency });

function orderItems(job: TamaraJob) {
  const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ");
  return [
    {
      reference_id: job.id,
      type: "Digital",
      name: `Vehicle inspection${vehicle ? ` - ${vehicle}` : ""} (${job.jobCode})`.slice(0, 255),
      sku: "WD-INSPECTION",
      quantity: 1,
      unit_price: money(job.fee, job.currency),
      tax_amount: money(0, job.currency), // the fee is VAT-inclusive; Tamara's tax field is for tax added on top
      discount_amount: money(0, job.currency),
      total_amount: money(job.fee, job.currency),
    },
  ];
}

const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

/** Creates a Tamara checkout session. The customer picks 2/3/4 instalments on Tamara's page. */
export async function createTamaraCheckout(job: TamaraJob): Promise<{ url: string; orderId: string; checkoutId: string } | null> {
  const base = getBaseUrl();
  const name = splitName(job.customerName);
  const ret = (kind: "paid" | "cancelled" | "failed") =>
    `${base}/inspection/book?${kind === "paid" ? "paid=1" : "cancelled=1"}&provider=tamara&job=${encodeURIComponent(job.jobCode)}`;
  const body = {
    order_reference_id: job.id,
    order_number: job.jobCode,
    total_amount: money(job.fee, job.currency),
    tax_amount: money(0, job.currency),
    shipping_amount: money(0, job.currency),
    description: `The Wheeler Dealers vehicle inspection ${job.jobCode}`,
    country_code: "AE",
    locale: "en_US",
    payment_type: "PAY_BY_INSTALMENTS",
    items: orderItems(job),
    consumer: { first_name: name.first, last_name: name.last, phone_number: localPhone(job.customerMobile), email: job.customerEmail },
    shipping_address: {
      first_name: name.first,
      last_name: name.last,
      line1: (job.address || "Inspection at customer location").slice(0, 255),
      city: job.city || job.emirate || "Dubai",
      region: job.emirate || undefined,
      country_code: "AE",
      phone_number: localPhone(job.customerMobile),
    },
    merchant_url: { success: ret("paid"), failure: ret("failed"), cancel: ret("cancelled"), notification: `${base}/api/inspection/pay/tamara/webhook` },
    platform: "The Wheeler Dealers (Next.js)",
    risk_assessment: {
      is_premium_customer: false,
      account_creation_date: fmtDate(job.customerCreatedAt ?? new Date()),
      total_order_count: 0,
      date_first_paid: null,
      date_last_paid: null,
      account_security: { is_phone_verified: true, is_email_verified: true, last_verification_method: "OTP" },
    },
  };
  const res = await tamaraFetch<{ order_id: string; checkout_id: string; checkout_url: string; status: string }>("/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.data?.checkout_url) return null;
  return { url: res.data.checkout_url, orderId: res.data.order_id, checkoutId: res.data.checkout_id };
}

export interface TamaraOrder {
  order_id: string;
  order_reference_id: string;
  status: string; // new | approved | authorised | fully_captured | partially_captured | canceled | declined | expired | fully_refunded | ...
  total_amount?: { amount: number; currency: string };
  payment_type?: string;
  instalments?: number;
}

export async function getTamaraOrder(orderId: string): Promise<TamaraOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const res = await tamaraFetch<TamaraOrder>(`/orders/${orderId}`);
  return res.ok ? res.data : null;
}

/** approved → authorised (or straight to fully_captured when auto-capture is on). Idempotent on Tamara's side. */
export async function authoriseTamaraOrder(orderId: string): Promise<{ status: string } | null> {
  const res = await tamaraFetch<{ order_id: string; status: string }>(`/orders/${orderId}/authorise`, { method: "POST", body: "{}" });
  if (res.ok) return { status: res.data.status };
  // Already authorised / captured: treat as success so a retry can proceed.
  const current = await getTamaraOrder(orderId);
  return current && ["authorised", "fully_captured", "partially_captured"].includes(current.status) ? { status: current.status } : null;
}

/** Captures the full amount: the inspection is a prepaid service, so it is "fulfilled" at booking. */
export async function captureTamaraOrder(orderId: string, job: TamaraJob): Promise<boolean> {
  const res = await tamaraFetch<{ status: string }>("/payments/capture", {
    method: "POST",
    body: JSON.stringify({
      order_id: orderId,
      total_amount: money(job.fee, job.currency),
      tax_amount: money(0, job.currency),
      shipping_amount: money(0, job.currency),
      discount_amount: money(0, job.currency),
      items: orderItems(job),
      shipping_info: {
        shipped_at: new Date().toISOString(),
        shipping_company: "The Wheeler Dealers",
        tracking_number: job.jobCode,
        tracking_url: `${getBaseUrl()}/account`,
      },
    }),
  });
  if (res.ok) return true;
  const current = await getTamaraOrder(orderId);
  return !!current && ["fully_captured", "partially_captured"].includes(current.status);
}

/**
 * Makes an approved order paid on Tamara's side: authorise, then capture.
 * Returns the final Tamara status, or null when the order is not (yet) paid by the customer.
 */
export async function settleTamaraOrder(orderId: string, job: TamaraJob): Promise<string | null> {
  const order = await getTamaraOrder(orderId);
  if (!order || order.order_reference_id !== job.id) return null;
  let status = order.status;
  if (status === "approved") {
    const auth = await authoriseTamaraOrder(orderId);
    if (!auth) return null;
    status = auth.status;
  }
  if (status === "authorised") {
    if (await captureTamaraOrder(orderId, job)) status = "fully_captured";
  }
  return ["authorised", "fully_captured", "partially_captured"].includes(status) ? status : null;
}

/**
 * Verifies the `tamaraToken` JWT (HS256, signed with the notification token) that Tamara
 * attaches to every webhook as a query parameter and Bearer header.
 */
export function verifyTamaraToken(token: string | null | undefined): boolean {
  const secret = process.env.TAMARA_NOTIFICATION_TOKEN;
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, sig] = parts;
  try {
    const alg = (JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: string }).alg;
    if (alg !== "HS256") return false;
    const expected = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return !claims.exp || claims.exp * 1000 > Date.now() - 5 * 60_000;
  } catch {
    return false;
  }
}
