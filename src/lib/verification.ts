import crypto from "crypto";
import { prisma } from "./prisma";
import { sendEmail, sendSms } from "./inspection";
import { sendOtpSms, shouldUseMessageCentral, validateOtpSms } from "./messagecentral";
import { createVerificationProof } from "./auth";
import { verificationCodeEmail } from "./emailTemplates";
import { normaliseTarget, type VerifyChannel } from "./contactValidation";

/**
 * ----------------------------------------------------------------------------
 * Email / mobile ownership verification (6-digit codes).
 * ----------------------------------------------------------------------------
 * - Email codes are generated here, scrypt-hashed, and sent with Resend.
 * - SMS codes are owned by Message Central in production (we keep its
 *   verificationId); in dev the code is generated here and logged instead.
 * - Limits live in the database (serverless instances don't share memory):
 *   30 s resend cooldown and a daily cap per address, a daily SMS cap per IP,
 *   5 wrong attempts per code, 10 minute expiry.
 * - A correct code yields a signed proof token that forms submit alongside
 *   the value; the server re-checks it, so no account is created unverified.
 * ----------------------------------------------------------------------------
 */

export const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60_000;
const COOLDOWN_MS = 30_000;
const MAX_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60_000;
const DAILY_CAP: Record<VerifyChannel, number> = { sms: 5, email: 10 };
const IP_DAILY_CAP: Record<VerifyChannel, number> = { sms: 15, email: 40 };

const IS_PROD = process.env.NODE_ENV === "production";

export type SendOutcome =
  | { ok: true; target: string; resendInSec: number; devCode?: string }
  | { ok: false; status: number; error: string; retryAfter?: number };

export type CheckOutcome =
  | { ok: true; target: string; proof: string }
  | { ok: false; status: number; error: string };

function hashCode(code: string): string {
  const salt = crypto.randomBytes(8).toString("hex");
  return `${salt}:${crypto.scryptSync(code, salt, 32).toString("hex")}`;
}

function codeMatches(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = crypto.scryptSync(code, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function invalidTargetError(channel: VerifyChannel): string {
  return channel === "email"
    ? "Please enter a valid email address."
    : "Please enter a valid UAE mobile number (e.g. 05X XXX XXXX).";
}

/** Sends a fresh code to an email address or UAE mobile. */
export async function sendVerificationCode(
  channel: VerifyChannel,
  rawTarget: string,
  ip: string,
): Promise<SendOutcome> {
  const target = normaliseTarget(channel, rawTarget);
  if (!target) return { ok: false, status: 400, error: invalidTargetError(channel) };

  const now = Date.now();
  // Opportunistic cleanup keeps the table small; failures don't matter.
  await prisma.verificationCode
    .deleteMany({ where: { createdAt: { lt: new Date(now - DAY_MS) } } })
    .catch(() => {});

  const [latest, todayForTarget, todayForIp] = await Promise.all([
    prisma.verificationCode.findFirst({
      where: { channel, target },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.verificationCode.count({ where: { channel, target, createdAt: { gt: new Date(now - DAY_MS) } } }),
    prisma.verificationCode.count({ where: { channel, ip, createdAt: { gt: new Date(now - DAY_MS) } } }),
  ]);

  if (latest && now - latest.createdAt.getTime() < COOLDOWN_MS) {
    const retryAfter = Math.ceil((COOLDOWN_MS - (now - latest.createdAt.getTime())) / 1000);
    return { ok: false, status: 429, error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter };
  }
  if (todayForTarget >= DAILY_CAP[channel]) {
    return { ok: false, status: 429, error: "Too many codes requested for this address today. Please try again tomorrow." };
  }
  if (todayForIp >= IP_DAILY_CAP[channel]) {
    return { ok: false, status: 429, error: "Too many verification requests from your network today. Please try again later." };
  }

  const expiresAt = new Date(now + CODE_TTL_MS);

  // --- SMS through Message Central (production): the provider owns the code.
  if (channel === "sms" && shouldUseMessageCentral()) {
    // Reserve the row before sending so every paid SMS is counted.
    const row = await prisma.verificationCode.create({
      data: { channel, target, ip, codeHash: "mc:pending", expiresAt },
    });
    const sent = await sendOtpSms(target);
    if (!sent.ok) {
      await prisma.verificationCode.delete({ where: { id: row.id } }).catch(() => {});
      return sent.reason === "no_credit"
        ? { ok: false, status: 503, error: "SMS verification is temporarily unavailable. Please try again later." }
        : { ok: false, status: 502, error: "We couldn't send the SMS. Please check the number and try again." };
    }
    await prisma.verificationCode.update({ where: { id: row.id }, data: { codeHash: `mc:${sent.verificationId}` } });
    return { ok: true, target, resendInSec: COOLDOWN_MS / 1000 };
  }

  // --- Our own code (all email; SMS in dev or via Twilio).
  const code = String(crypto.randomInt(100000, 1000000));
  const row = await prisma.verificationCode.create({
    data: { channel, target, ip, codeHash: hashCode(code), expiresAt },
  });

  let delivered: boolean;
  if (channel === "email") {
    const mail = verificationCodeEmail(code, CODE_TTL_MINUTES);
    delivered = await sendEmail(target, mail.subject, mail.html, mail.text);
  } else {
    delivered = await sendSms(target, `Your Wheeler Dealers verification code is ${code}. Valid for ${CODE_TTL_MINUTES} minutes.`);
  }

  if (!delivered) {
    if (IS_PROD) {
      await prisma.verificationCode.delete({ where: { id: row.id } }).catch(() => {});
      return {
        ok: false,
        status: 503,
        error: channel === "email"
          ? "We couldn't send the email right now. Please try again in a moment."
          : "SMS verification is temporarily unavailable. Please try again later.",
      };
    }
    // Dev without a provider (or a reserved test address): surface the code so flows stay testable.
    console.log(`[verify:${channel}] code for ${target}: ${code}`);
    return { ok: true, target, resendInSec: COOLDOWN_MS / 1000, devCode: code };
  }
  return { ok: true, target, resendInSec: COOLDOWN_MS / 1000 };
}

/** Checks a code; on success burns the codes for that address and returns a proof token. */
export async function checkVerificationCode(
  channel: VerifyChannel,
  rawTarget: string,
  rawCode: string,
): Promise<CheckOutcome> {
  const target = normaliseTarget(channel, rawTarget);
  if (!target) return { ok: false, status: 400, error: invalidTargetError(channel) };
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (!/^\d{4,8}$/.test(code)) return { ok: false, status: 400, error: "Enter the 6-digit code." };

  const row = await prisma.verificationCode.findFirst({
    where: { channel, target, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.codeHash === "mc:pending") {
    return { ok: false, status: 400, error: "This code has expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many wrong attempts. Please request a new code." };
  }

  let correct: boolean;
  if (row.codeHash.startsWith("mc:")) {
    const result = await validateOtpSms(row.codeHash.slice(3), code);
    if (result === "error") return { ok: false, status: 502, error: "Couldn't check the code right now. Please try again." };
    if (result === "expired" || result === "locked") {
      await prisma.verificationCode.update({ where: { id: row.id }, data: { attempts: MAX_ATTEMPTS } });
      return { ok: false, status: 400, error: "This code has expired. Please request a new one." };
    }
    correct = result === "verified";
  } else {
    correct = codeMatches(code, row.codeHash);
  }

  if (!correct) {
    const updated = await prisma.verificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = MAX_ATTEMPTS - updated.attempts;
    return {
      ok: false,
      status: 400,
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Please request a new code.",
    };
  }

  // Burn every outstanding code for this address (keeps createdAt history for limits).
  await prisma.verificationCode.updateMany({
    where: { channel, target, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });
  return { ok: true, target, proof: createVerificationProof(channel, target) };
}
