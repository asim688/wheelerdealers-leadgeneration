/**
 * Booking time rules shared by the wizard, the AI chat and the server:
 * inspections can be booked any time between 08:00 and 20:00 (Dubai time),
 * and never at a time that has already passed today.
 */

export const BOOKING_OPEN_MINUTES = 8 * 60; // 08:00
export const BOOKING_CLOSE_MINUTES = 20 * 60; // 20:00 (last bookable time)
const DUBAI_OFFSET_MS = 4 * 60 * 60_000; // UAE has no DST

/** Today's date (YYYY-MM-DD) and minutes since midnight, in Dubai. */
export function dubaiNow(now = new Date()): { date: string; minutes: number } {
  const d = new Date(now.getTime() + DUBAI_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Parses "02:30 PM", "2:30pm" or "14:30" into minutes since midnight. */
export function parseTimeLabel(raw: string | null | undefined): number | null {
  const m = (raw ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (/pm/i.test(m[3]) ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

/** Minutes since midnight → "02:30 PM" (the label stored on the job). */
export function formatTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Minutes since midnight → "14:30" for <input type="time">. */
export const toInputTime = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function validateBookingTime(
  date: string,
  time: string,
  now = new Date(),
): { ok: true; minutes: number; label: string } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Please choose a date." };
  const minutes = parseTimeLabel(time);
  if (minutes == null) return { ok: false, error: "Please choose a time." };
  if (minutes < BOOKING_OPEN_MINUTES || minutes > BOOKING_CLOSE_MINUTES) {
    return { ok: false, error: "Inspections can be booked between 08:00 AM and 08:00 PM." };
  }
  const today = dubaiNow(now);
  if (date < today.date) return { ok: false, error: "That date has already passed." };
  if (date === today.date && minutes <= today.minutes) {
    return { ok: false, error: "That time has already passed today. Please pick a later time or another day." };
  }
  return { ok: true, minutes, label: formatTimeLabel(minutes) };
}

/** The exact instant of a booking in Dubai time. */
export function bookingInstant(date: string, minutes: number): Date {
  return new Date(`${date}T${toInputTime(minutes)}:00+04:00`);
}
