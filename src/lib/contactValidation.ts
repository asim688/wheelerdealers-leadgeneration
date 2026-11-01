import { normaliseMobile } from "./phone";

/**
 * Contact + bank validation shared by the browser forms and the API routes,
 * so a value the form accepts is exactly the value the server verifies.
 */

export type VerifyChannel = "email" | "sms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UAE_MOBILE_RE = /^\+9715\d{8}$/;

/** Lower-cased, trimmed email, or null when it isn't a plausible address. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** UAE mobile in +9715XXXXXXXX form (accepts 05X…, 9715…, 009715…), or null. */
export function normaliseUaeMobile(raw: string | null | undefined): string | null {
  const m = normaliseMobile(raw ?? "");
  return m && UAE_MOBILE_RE.test(m) ? m : null;
}

export function normaliseTarget(channel: VerifyChannel, raw: string | null | undefined): string | null {
  return channel === "email" ? normaliseEmail(raw) : normaliseUaeMobile(raw);
}

/** Key shared by the client proof map and the server proof check. */
export function verificationKey(channel: VerifyChannel, target: string): string {
  return `${channel}:${target}`;
}

/** "+971501234567" → "+971 50 123 4567" for display. */
export function formatUaeMobile(m: string | null | undefined): string {
  const n = normaliseUaeMobile(m);
  return n ? `+971 ${n.slice(4, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : (m ?? "");
}

/**
 * UAE IBAN: "AE" + 2 check digits + 3-digit bank code + 16-digit account
 * (23 characters), validated with the ISO 13616 mod-97 checksum.
 * Returns the compact upper-case form, or null.
 */
export function normaliseIban(raw: string | null | undefined): string | null {
  const iban = (raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!/^AE\d{21}$/.test(iban)) return null;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? iban : null;
}

/** "AE070331234567890123456" → "AE07 0331 2345 6789 0123 456". */
export function formatIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/(.{4})(?=.)/g, "$1 ");
}
