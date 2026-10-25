import { prisma } from "./prisma";

/**
 * ----------------------------------------------------------------------------
 * Vehicle Inspection module — shared server helpers.
 * ----------------------------------------------------------------------------
 */

/** Flat inspection fee (display currency). Override via env or admin settings. */
export const INSPECTION_FEE = Number(process.env.INSPECTION_FEE_AED || 10);
export const INSPECTION_CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "AED";
/** Default partner payout per completed inspection (admin-configurable). */
export const PARTNER_PAYOUT_DEFAULT = Number(process.env.PARTNER_PAYOUT_AED || 200);

// --- Admin-configurable platform settings (PlatformSetting key-value) --------

const PRICE_KEY = "inspection_customer_price";
const PAYOUT_KEY = "inspection_partner_payout";
const OPEN_HOURS_KEY = "inspection_job_open_hours";

/** Default hours a live job stays open for acceptance before expiring. */
export const JOB_OPEN_HOURS_DEFAULT = Number(process.env.JOB_OPEN_HOURS || 1);

/** How long (hours) a live job stays open to companies, admin-configurable. */
export async function getJobOpenHours(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: OPEN_HOURS_KEY } });
  const v = row ? Number(row.value) : NaN;
  return Number.isFinite(v) && v > 0 ? v : JOB_OPEN_HOURS_DEFAULT;
}

/** Persists the job open window (admin only — callers must authorize). */
export async function setJobOpenHours(hours: number): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: OPEN_HOURS_KEY },
    create: { key: OPEN_HOURS_KEY, value: String(hours) },
    update: { value: String(hours) },
  });
}

/** Customer price + partner payout, from admin settings with env/static fallbacks. */
export async function getInspectionPricing(): Promise<{
  customerPrice: number;
  partnerPayout: number;
  currency: string;
}> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [PRICE_KEY, PAYOUT_KEY] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const customerPrice =
    Number.isFinite(map[PRICE_KEY]) && map[PRICE_KEY] > 0 ? map[PRICE_KEY] : INSPECTION_FEE;
  const partnerPayout =
    Number.isFinite(map[PAYOUT_KEY]) && map[PAYOUT_KEY] >= 0
      ? map[PAYOUT_KEY]
      : PARTNER_PAYOUT_DEFAULT;
  return { customerPrice, partnerPayout, currency: INSPECTION_CURRENCY };
}

/** Persists the marketplace pricing (admin only — callers must authorize). */
export async function setInspectionPricing(opts: {
  customerPrice?: number;
  partnerPayout?: number;
}): Promise<void> {
  const writes = [];
  if (opts.customerPrice !== undefined) {
    writes.push(
      prisma.platformSetting.upsert({
        where: { key: PRICE_KEY },
        create: { key: PRICE_KEY, value: String(opts.customerPrice) },
        update: { value: String(opts.customerPrice) },
      }),
    );
  }
  if (opts.partnerPayout !== undefined) {
    writes.push(
      prisma.platformSetting.upsert({
        where: { key: PAYOUT_KEY },
        create: { key: PAYOUT_KEY, value: String(opts.partnerPayout) },
        update: { value: String(opts.partnerPayout) },
      }),
    );
  }
  if (writes.length) await prisma.$transaction(writes);
}

/** Time slots offered by the booking wizard. */
export const INSPECTION_SLOTS = [
  "09:00 AM",
  "11:00 AM",
  "01:00 PM",
  "03:00 PM",
  "05:00 PM",
] as const;

/** Absolute site base URL for building customer links (report, etc.). */
export function getBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (vercel ? `https://${vercel}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Generates a human-friendly, per-day sequential job code, e.g.
 * `WD-260722-0015`. The 4-digit suffix resets each day.
 */
export async function generateJobCode(): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `WD-${yy}${mm}${dd}-`;
  // Max existing sequence (not count): deletions must never cause collisions.
  const last = await prisma.inspectionJob.findFirst({
    where: { jobCode: { startsWith: prefix } },
    orderBy: { jobCode: "desc" },
    select: { jobCode: true },
  });
  const lastSeq = last ? parseInt(last.jobCode.slice(prefix.length), 10) : 0;
  const seq = String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, "0");
  return `${prefix}${seq}`;
}

/**
 * ---------------------------------------------------------------------------
 * Notification providers (email via Resend, SMS/WhatsApp via Twilio).
 * Provider-ready: they SEND when the env keys are present, otherwise they log
 * the intent so local/dev and un-configured deploys keep working.
 * ---------------------------------------------------------------------------
 */

/** Sends an email via Resend if configured, else logs. Returns true if sent. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "The Wheeler Dealers <onboarding@resend.dev>";
  if (!key) {
    console.info(`[notify:email:stub] → ${to} | ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.error("Resend email failed:", res.status);
    return res.ok;
  } catch (err) {
    console.error("Resend email error:", err);
    return false;
  }
}

/** Sends an SMS or WhatsApp via Twilio if configured, else logs. */
export async function sendSms(to: string, body: string, whatsapp = false): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = whatsapp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) {
    console.info(`[notify:${whatsapp ? "whatsapp" : "sms"}:stub] → ${to} | ${body.slice(0, 60)}`);
    return false;
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: whatsapp ? `whatsapp:${to}` : to,
          From: whatsapp ? `whatsapp:${from}` : from,
          Body: body,
        }),
      },
    );
    if (!res.ok) console.error("Twilio send failed:", res.status);
    return res.ok;
  } catch (err) {
    console.error("Twilio send error:", err);
    return false;
  }
}

/**
 * Atomically marks a paid job as released to the marketplace and fires the
 * customer + company notifications. Safe to call from BOTH the Stripe webhook
 * and the checkout-return page at the same time: the conditional update lets
 * exactly one caller win, so notifications can never double-fire.
 */
export async function releasePaidJob(
  jobId: string,
  paymentRef?: string,
): Promise<boolean> {
  const openHours = await getJobOpenHours();
  const updated = await prisma.inspectionJob.updateMany({
    where: { id: jobId, status: "payment_pending" },
    data: {
      status: "available",
      paymentStatus: "paid",
      paymentProvider: "stripe",
      paymentRef: paymentRef ?? undefined,
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + openHours * 3_600_000),
    },
  });
  if (updated.count === 0) return false; // someone else already released it

  const job = await prisma.inspectionJob.findUnique({ where: { id: jobId } });
  if (job) {
    await Promise.allSettled([
      sendBookingNotifications(job),
      notifyCompaniesNewJob(job),
    ]);
  }
  return true;
}

/** Booking confirmation across email + SMS + WhatsApp (all provider-ready). */
export async function sendBookingNotifications(job: {
  jobCode: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  scheduledAt: Date | null;
  scheduledSlot: string | null;
}): Promise<void> {
  const when = job.scheduledAt
    ? `${job.scheduledAt.toDateString()} ${job.scheduledSlot ?? ""}`.trim()
    : "to be scheduled";
  const line = `Hi ${job.customerName}, your Wheeler Dealers inspection is booked. Job ID ${job.jobCode}, scheduled ${when}. We'll be in touch to confirm.`;
  const html = `<p>Hi ${escapeHtml(job.customerName)},</p>
<p>Your vehicle inspection is booked.</p>
<ul>
  <li><b>Job ID:</b> ${escapeHtml(job.jobCode)}</li>
  <li><b>Scheduled:</b> ${escapeHtml(when)}</li>
</ul>
<p>Our team will contact you to confirm the appointment.</p>
<p>— The Wheeler Dealers</p>`;

  await Promise.allSettled([
    sendEmail(job.customerEmail, `Inspection booked — ${job.jobCode}`, html),
    sendSms(job.customerMobile, line),
    sendSms(job.customerMobile, line, true),
  ]);
}

/** Report-ready notification with a link to the customer report page. */
export async function sendReportNotification(job: {
  jobCode: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  reportUrl: string;
}): Promise<void> {
  const line = `Hi ${job.customerName}, your vehicle inspection report for ${job.jobCode} is ready. View it: ${job.reportUrl}`;
  const html = `<p>Hi ${escapeHtml(job.customerName)},</p>
<p>Your vehicle inspection report is ready. It records the inspector's observations by vehicle system so you can make your own informed decision.</p>
<p><a href="${job.reportUrl}">View your full report</a></p>
<p>— The Wheeler Dealers</p>`;

  await Promise.allSettled([
    sendEmail(job.customerEmail, `Your inspection report — ${job.jobCode}`, html),
    sendSms(job.customerMobile, line),
    sendSms(job.customerMobile, line, true),
  ]);
}

/**
 * Marketplace broadcast: notify every approved, active inspection company that
 * a new job is available to accept. Email + SMS (provider-ready stubs).
 */
export async function notifyCompaniesNewJob(job: {
  jobCode: string;
  make: string | null;
  model: string | null;
  year: number | null;
  city: string | null;
  emirate: string | null;
  scheduledAt: Date | null;
  scheduledSlot: string | null;
}): Promise<void> {
  // Multi-tenant companies (preferred): WhatsApp the registered Point of
  // Contact + email. Legacy standalone inspector-companies still get email/SMS.
  const [companies, legacy] = await Promise.all([
    prisma.inspectionCompany.findMany({
      where: { active: true, approvalStatus: "approved" },
      select: { email: true, phone: true, pocMobile: true, pocEmail: true },
    }),
    prisma.inspector.findMany({
      where: { active: true, approvalStatus: "approved", companyId: null },
      select: { email: true, phone: true },
    }),
  ]);
  if (!companies.length && !legacy.length) return;

  const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ") || "Vehicle";
  const location = [job.city, job.emirate].filter(Boolean).join(", ") || "UAE";
  const when = job.scheduledAt
    ? `${job.scheduledAt.toDateString()} ${job.scheduledSlot ?? ""}`.trim()
    : "flexible";
  const dashUrl = `${getBaseUrl()}/company`;
  const line = `🚗 There is a job live on The Wheeler Dealers — ${vehicle} in ${location}, ${when}. First to accept wins: ${dashUrl}`;
  const html = `<p>New inspection available on The Wheeler Dealers marketplace.</p>
<ul>
  <li><b>Vehicle:</b> ${escapeHtml(vehicle)}</li>
  <li><b>Location:</b> ${escapeHtml(location)}</li>
  <li><b>Date/Time:</b> ${escapeHtml(when)}</li>
</ul>
<p><a href="${dashUrl}">Open your dashboard to ACCEPT this job</a> — first company to accept receives the assignment.</p>
<p>— The Wheeler Dealers</p>`;

  await Promise.allSettled([
    ...companies.flatMap((c) => {
      const mobile = c.pocMobile || c.phone;
      return [
        sendEmail(c.pocEmail || c.email, `New inspection available — ${vehicle} (${location})`, html),
        ...(mobile ? [sendSms(mobile, line, true)] : []), // WhatsApp to PoC
      ];
    }),
    ...legacy.flatMap((c) => [
      sendEmail(c.email, `New inspection available — ${vehicle} (${location})`, html),
      ...(c.phone ? [sendSms(c.phone, line)] : []),
    ]),
  ]);
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
