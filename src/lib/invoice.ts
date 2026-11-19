import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getBaseUrl, sendEmail } from "@/lib/inspection";
import { esc, brandEmail } from "@/lib/emailTemplates";
import { fmtAed } from "@/lib/commission";

/** The legal entity that issues the invoice (per the DIEZ trade licence and FTA registration). */
export const INVOICE_SELLER = {
  legalName: "NOVASYNERGY BUSINESS SOLUTIONS - FZCO",
  trn: "105496389500001",
  licenseNo: "88055",
  licenseAuthority: "Dubai Integrated Economic Zones Authority (DIEZ)",
  addressLines: ["DSO-IFZA, IFZA Properties", "Dubai Silicon Oasis, Dubai, United Arab Emirates"],
  representedLine: "thewheelerdealers.com is represented by Novasynergy Business Solutions FZCO",
} as const;

export const invoiceNumber = (seq: number): string => `WD-INV-${String(seq).padStart(6, "0")}`;

export const invoiceUrl = (token: string): string => `${getBaseUrl()}/api/invoice/${token}`;

/**
 * Issues the customer's tax invoice for a paid job. Idempotent: a job gets one
 * invoice, and a parallel caller that loses the race returns the existing one.
 */
export async function issueInvoice(jobId: string) {
  const existing = await prisma.taxInvoice.findUnique({ where: { jobId } });
  if (existing) return existing;

  const job = await prisma.inspectionJob.findUnique({
    where: { id: jobId },
    include: { payment: true },
  });
  if (!job || job.paymentStatus !== "paid" || !job.payment) return null;

  const vehicle = [job.year, job.make, job.model].filter(Boolean).join(" ");
  const description = [
    "Vehicle inspection service",
    vehicle || null,
    job.vin ? `VIN ${job.vin}` : null,
    `Job ${job.jobCode}`,
  ]
    .filter(Boolean)
    .join(" - ");

  try {
    return await prisma.taxInvoice.create({
      data: {
        jobId,
        supplyDate: job.paidAt ?? new Date(),
        customerName: job.customerName,
        customerEmail: job.customerEmail,
        description,
        currency: job.currency,
        grossFils: job.payment.grossFils,
        vatFils: job.payment.vatFils,
        netFils: job.payment.netFils,
      },
    });
  } catch {
    return prisma.taxInvoice.findUnique({ where: { jobId } });
  }
}

// Standard PDF fonts only cover Latin-1; anything else (e.g. Arabic) would throw.
const latin = (s: string) => s.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?");

type InvoiceData = NonNullable<Awaited<ReturnType<typeof issueInvoice>>>;

const PAYMENT_METHOD_LABEL: Record<string, string> = { stripe: "card", tamara: "Tamara" };

async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/logo.jpeg`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Renders the invoice as an A4 PDF. */
export async function buildInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tax Invoice ${invoiceNumber(inv.seq)}`);
  pdf.setAuthor(INVOICE_SELLER.legalName);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 44;
  const ink = rgb(0.09, 0.09, 0.09);
  const grey = rgb(0.4, 0.4, 0.4);
  const red = rgb(0.86, 0.15, 0.15);
  const line = rgb(0.85, 0.85, 0.85);

  const text = (t: string, x: number, y: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(latin(t), { x, y, size, font: f, color });
  const right = (t: string, xRight: number, y: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(latin(t), { x: xRight - f.widthOfTextAtSize(latin(t), size), y, size, font: f, color });
  const rule = (y: number) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: line });
  // Word-wraps into lines no wider than `maxW`.
  const wrap = (t: string, maxW: number, size: number, f: PDFFont): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of latin(t).split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > maxW && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };

  const jobRow = await prisma.inspectionJob.findUnique({ where: { id: inv.jobId }, select: { paymentProvider: true } });
  const paymentMethod = jobRow?.paymentProvider ? PAYMENT_METHOD_LABEL[jobRow.paymentProvider] ?? null : null;

  let y = 800;
  const logo = await loadLogo();
  if (logo) {
    const img = await pdf.embedJpg(logo);
    const h = 44;
    page.drawImage(img, { x: M, y: y - h + 14, width: (img.width / img.height) * h, height: h });
  } else {
    text("The Wheeler Dealers", M, y, 16, bold, red);
  }
  right("TAX INVOICE", W - M, y, 22, bold, ink);
  right(invoiceNumber(inv.seq), W - M, y - 20, 11, bold, red);

  y -= 62;
  rule(y + 14);
  // Seller (left) and invoice details (right)
  text("FROM", M, y, 8, bold, grey);
  text(INVOICE_SELLER.legalName, M, y - 14, 10.5, bold);
  let sy = y - 28;
  for (const l of INVOICE_SELLER.addressLines) {
    text(l, M, sy, 9.5);
    sy -= 13;
  }
  text(`Tax Registration Number (TRN): ${INVOICE_SELLER.trn}`, M, sy, 9.5, bold);
  sy -= 13;
  text(`Trade Licence No. ${INVOICE_SELLER.licenseNo} - ${INVOICE_SELLER.licenseAuthority}`, M, sy, 8.5, font, grey);

  const dateFmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
  const meta: [string, string][] = [
    ["Invoice no.", invoiceNumber(inv.seq)],
    ["Invoice date", dateFmt(inv.issuedAt)],
    ["Date of supply", dateFmt(inv.supplyDate)],
    ["Currency", inv.currency],
  ];
  let my = y;
  for (const [k, v] of meta) {
    text(k, 360, my, 9.5, font, grey);
    right(v, W - M, my, 9.5, bold);
    my -= 15;
  }

  y = Math.min(sy, my) - 26;
  text("BILLED TO", M, y, 8, bold, grey);
  text(inv.customerName, M, y - 14, 10.5, bold);
  text(inv.customerEmail, M, y - 28, 9.5, font, grey);

  // Line items
  y -= 62;
  const colQty = 325;
  const colNet = 415;
  const colVat = 485;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.96, 0.96, 0.96) });
  text("Description", M + 8, y, 9, bold);
  right("Qty", colQty, y, 9, bold);
  right(`Amount excl. VAT`, colNet, y, 9, bold);
  right("VAT 5%", colVat, y, 9, bold);
  right("Total", W - M - 8, y, 9, bold);
  y -= 22;
  const descLines = wrap(inv.description, colQty - 40 - M, 9.5, font);
  descLines.forEach((l, i) => text(l, M + 8, y - i * 13, 9.5));
  right("1", colQty, y, 9.5);
  right(fmtAed(inv.netFils), colNet, y, 9.5);
  right(fmtAed(inv.vatFils), colVat, y, 9.5);
  right(fmtAed(inv.grossFils), W - M - 8, y, 9.5);
  y -= descLines.length * 13 + 6;
  rule(y);

  // Totals
  y -= 24;
  const lx = 340;
  const row = (label: string, value: string, strong = false) => {
    text(label, lx, y, strong ? 11 : 10, strong ? bold : font, strong ? ink : grey);
    right(value, W - M - 8, y, strong ? 11 : 10, strong ? bold : font);
    y -= 18;
  };
  row("Subtotal (excl. VAT)", `${inv.currency} ${fmtAed(inv.netFils)}`);
  row("VAT @ 5%", `${inv.currency} ${fmtAed(inv.vatFils)}`);
  page.drawLine({ start: { x: lx, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.7, color: ink });
  y -= 4;
  row("Total paid (incl. VAT)", `${inv.currency} ${fmtAed(inv.grossFils)}`, true);

  y -= 14;
  text(`Payment status: PAID - received online${paymentMethod ? ` via ${paymentMethod}` : ""}.`, M, y, 9.5, bold);

  const drawFooter = (p: PDFPage) => {
    p.drawLine({ start: { x: M, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.7, color: line });
    const rep = latin(INVOICE_SELLER.representedLine);
    p.drawText(rep, { x: (W - font.widthOfTextAtSize(rep, 9)) / 2, y: 54, size: 9, font: bold, color: ink });
    const note = "This is a computer-generated tax invoice and does not require a signature.";
    p.drawText(note, { x: (W - font.widthOfTextAtSize(note, 8)) / 2, y: 40, size: 8, font, color: grey });
  };
  drawFooter(page);

  return pdf.save();
}

/** Emails the invoice (PDF attached, plus a download link) once per invoice. */
export async function emailInvoice(jobId: string): Promise<void> {
  const inv = await issueInvoice(jobId);
  if (!inv || inv.emailedAt) return;
  // Claim first so a parallel caller (webhook + return page) can't double-send.
  const claimed = await prisma.taxInvoice.updateMany({
    where: { id: inv.id, emailedAt: null },
    data: { emailedAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    const pdf = await buildInvoicePdf(inv);
    const number = invoiceNumber(inv.seq);
    const html = brandEmail({
      heading: `Your tax invoice ${number}`,
      bodyHtml: `<p>Hi ${esc(inv.customerName)},</p><p>Thank you for your payment of <b>${esc(inv.currency)} ${esc(fmtAed(inv.grossFils))}</b> (incl. 5% VAT). Your tax invoice is attached.</p><p style="color:#737373;font-size:12px">${esc(INVOICE_SELLER.representedLine)}</p>`,
      cta: { label: "Download invoice (PDF)", url: invoiceUrl(inv.token) },
    });
    const sent = await sendEmail(inv.customerEmail, `Tax invoice ${number} - The Wheeler Dealers`, html, undefined, [
      { filename: `${number}.pdf`, content: Buffer.from(pdf).toString("base64") },
    ]);
    // Release the claim when nothing was actually sent (e.g. email not configured).
    if (!sent) await prisma.taxInvoice.update({ where: { id: inv.id }, data: { emailedAt: null } });
  } catch (e) {
    console.error("invoice: email failed", e);
    await prisma.taxInvoice.update({ where: { id: inv.id }, data: { emailedAt: null } }).catch(() => {});
  }
}
