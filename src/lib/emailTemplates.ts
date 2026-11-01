import { getBaseUrl } from "./inspection";

/** Escapes text for safe interpolation into email HTML. */
export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Wraps content in The Wheeler Dealers email layout (inline styles, table
 * based, so it renders consistently in Gmail / Outlook / mobile clients).
 * `bodyHtml` must already be escaped.
 */
export function brandEmail(opts: {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const base = getBaseUrl();
  const cta = opts.cta
    ? `<tr><td style="padding:8px 32px 8px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px">${esc(opts.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#171717">
<tr><td style="padding:24px 32px 8px"><img src="${base}/logo.jpeg" alt="The Wheeler Dealers" height="48" style="height:48px;width:auto"></td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:20px;line-height:1.3;color:#171717">${esc(opts.heading)}</h1></td></tr>
<tr><td style="padding:12px 32px 8px;font-size:14px;line-height:1.6;color:#404040">${opts.bodyHtml}</td></tr>
${cta}
<tr><td style="padding:20px 32px 24px;font-size:12px;line-height:1.5;color:#737373;border-top:1px solid #f0f0f0">${esc(opts.footnote ?? "This is an automated message from The Wheeler Dealers. Please do not reply to this email.")}<br><a href="${base}" style="color:#737373">${esc(base.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Email carrying a 6-digit verification code. */
export function verificationCodeEmail(code: string, minutes: number): { subject: string; html: string; text: string } {
  return {
    subject: `${code} is your Wheeler Dealers verification code`,
    html: brandEmail({
      heading: "Verify your email address",
      bodyHtml: `<p style="margin:0 0 12px">Use this code to verify your email address:</p>
<p style="margin:0 0 16px;font-size:30px;font-weight:700;letter-spacing:6px;color:#171717">${esc(code)}</p>
<p style="margin:0">The code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.</p>`,
      footnote: "Never share this code with anyone. The Wheeler Dealers team will never ask you for it.",
    }),
    text: `Your Wheeler Dealers verification code is ${code}. It expires in ${minutes} minutes. If you didn't request it, ignore this email.`,
  };
}
