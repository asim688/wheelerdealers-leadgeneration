/**
 * Message Central "VerifyNow" SMS OTP client (UAE only). Server-side only: it
 * reads the account password from env.
 * Message Central generates the code and validates it, so we only keep the
 * returned verificationId. Docs: https://www.messagecentral.com/product/verify-now/api
 */

const BASE = "https://cpaas.messagecentral.com";
const COUNTRY_CODE = "971";
const OTP_LENGTH = 6;
const TIMEOUT_MS = 6000;

/** UAE mobile in E.164 (+9715XXXXXXXX). */
export const UAE_MOBILE_RE = /^\+9715\d{8}$/;

export function isMessageCentralConfigured(): boolean {
  return !!(process.env.MESSAGECENTRAL_CUSTOMER_ID && process.env.MESSAGECENTRAL_PASSWORD);
}

/**
 * Real SMS only in production, or locally when MESSAGECENTRAL_IN_DEV=1, so dev
 * and test runs never text real numbers or spend credit by accident.
 */
export function shouldUseMessageCentral(): boolean {
  return (
    isMessageCentralConfigured() &&
    (process.env.NODE_ENV === "production" || process.env.MESSAGECENTRAL_IN_DEV === "1")
  );
}

interface ApiResult {
  status: number;
  json: Record<string, unknown> | null;
}

async function request(url: string, init: RequestInit, retries: number): Promise<ApiResult> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      let json: Record<string, unknown> | null = null;
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        /* non-JSON body */
      }
      return { status: res.status, json };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Auth token; the call is free and safe to retry (unlike send). */
async function getToken(): Promise<string | null> {
  const id = process.env.MESSAGECENTRAL_CUSTOMER_ID!;
  const key = Buffer.from(process.env.MESSAGECENTRAL_PASSWORD!).toString("base64");
  const url =
    `${BASE}/auth/v1/authentication/token?customerId=${encodeURIComponent(id)}` +
    `&key=${encodeURIComponent(key)}&scope=NEW&country=${COUNTRY_CODE}`;
  const { json } = await request(url, { headers: { accept: "*/*" } }, 1);
  const token = json?.token;
  return typeof token === "string" && token ? token : null;
}

export type SendResult =
  | { ok: true; verificationId: string }
  | { ok: false; reason: "invalid_number" | "no_credit" | "provider_error" };

/** Sends a 6-digit OTP by SMS. Never retried: a retry could be billed twice. */
export async function sendOtpSms(mobile: string): Promise<SendResult> {
  if (!UAE_MOBILE_RE.test(mobile)) return { ok: false, reason: "invalid_number" };
  try {
    const token = await getToken();
    if (!token) {
      console.error("Message Central: could not get an auth token (check credentials).");
      return { ok: false, reason: "provider_error" };
    }
    const national = mobile.slice(`+${COUNTRY_CODE}`.length);
    const { json } = await request(
      `${BASE}/verification/v3/send?countryCode=${COUNTRY_CODE}&flowType=SMS` +
        `&mobileNumber=${national}&otpLength=${OTP_LENGTH}`,
      { method: "POST", headers: { authToken: token } },
      0,
    );
    const data = json?.data as Record<string, unknown> | undefined;
    if (json?.responseCode === 200 && data?.verificationId != null) {
      return { ok: true, verificationId: String(data.verificationId) };
    }
    if (json?.responseCode === 508) {
      console.error("Message Central: wallet balance is empty — top up to resume OTP SMS.");
      return { ok: false, reason: "no_credit" };
    }
    console.error("Message Central send failed:", json?.responseCode, json?.message);
    return { ok: false, reason: "provider_error" };
  } catch (err) {
    console.error("Message Central send error:", err);
    return { ok: false, reason: "provider_error" };
  }
}

export type ValidateResult = "verified" | "wrong" | "expired" | "locked" | "error";

/** Checks a code against the verificationId returned by sendOtpSms. */
export async function validateOtpSms(verificationId: string, code: string): Promise<ValidateResult> {
  if (!/^\d+$/.test(verificationId) || !/^\d{4,8}$/.test(code)) return "wrong";
  try {
    const token = await getToken();
    if (!token) return "error";
    const { json } = await request(
      `${BASE}/verification/v3/validateOtp?verificationId=${verificationId}&code=${encodeURIComponent(code)}`,
      { headers: { authToken: token } },
      0,
    );
    const data = json?.data as Record<string, unknown> | null | undefined;
    switch (json?.responseCode) {
      case 200:
        return data?.verificationStatus === "VERIFICATION_COMPLETED" ? "verified" : "error";
      case 702: // WRONG_OTP_PROVIDED
        return "wrong";
      case 703: // ALREADY_VERIFIED
      case 705: // VERIFICATION_EXPIRED
        return "expired";
      case 800: // MAXIMUM_LIMIT_REACHED
        return "locked";
      default:
        console.error("Message Central validate failed:", json?.responseCode, json?.message);
        return "error";
    }
  } catch (err) {
    console.error("Message Central validate error:", err);
    return "error";
  }
}
