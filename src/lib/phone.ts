/** Normalises a UAE/intl mobile to E.164-ish digits with country code (best-effort). */
export function normaliseMobile(raw: string): string | null {
  let m = raw.replace(/[^\d+]/g, "");
  if (m.startsWith("00")) m = `+${m.slice(2)}`;
  if (m.startsWith("05") && m.length === 10) m = `+971${m.slice(1)}`; // local UAE format
  if (/^9715\d{8}$/.test(m)) m = `+${m}`;
  if (!m.startsWith("+")) m = `+${m}`;
  return /^\+\d{9,15}$/.test(m) ? m : null;
}
