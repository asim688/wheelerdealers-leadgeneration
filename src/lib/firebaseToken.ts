import crypto from "crypto";

/**
 * Verifies a Firebase Auth ID token (RS256) using Google's public signing keys,
 * with no firebase-admin and no service-account secret. Only phone sign-ins
 * from UAE numbers are accepted, and the sign-in must be fresh.
 */

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export const UAE_E164_RE = /^\+9715\d{8}$/;
/** A token must come from a sign-in this recent, so a stolen old token is useless. */
const MAX_AUTH_AGE_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 60;

export interface FirebasePhoneUser {
  uid: string;
  phone: string;
}

let certCache: { certs: Record<string, string>; expires: number } | null = null;

async function googleKeyForKid(kid: string): Promise<crypto.KeyObject | null> {
  if (!certCache || certCache.expires <= Date.now()) {
    const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Could not fetch Google signing certs (${res.status})`);
    const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
    const ttlMs = Math.min(maxAge ? Number(maxAge[1]) * 1000 : 3_600_000, 6 * 3_600_000);
    certCache = { certs: (await res.json()) as Record<string, string>, expires: Date.now() + ttlMs };
  }
  const cert = certCache.certs[kid];
  return cert ? crypto.createPublicKey(cert) : null;
}

type KeyResolver = (kid: string) => Promise<crypto.KeyObject | null>;

/**
 * Returns the verified phone user, or null for anything invalid. Throws only
 * when Google's keys can't be fetched (caller should answer 503, not 401).
 * `resolveKey` and `nowSeconds` exist so the checks can be unit-tested.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  resolveKey: KeyResolver = googleKeyForKid,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<FirebasePhoneUser | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || typeof idToken !== "string" || idToken.length > 4096) return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const key = await resolveKey(header.kid);
  if (!key) return null;
  const signatureOk = crypto
    .createVerify("RSA-SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify(key, Buffer.from(parts[2], "base64url"));
  if (!signatureOk) return null;

  const num = (v: unknown) => (typeof v === "number" ? v : NaN);
  const firebase = (payload.firebase ?? {}) as { sign_in_provider?: unknown };
  const phone = payload.phone_number;

  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (!(num(payload.exp) > nowSeconds)) return null;
  if (!(num(payload.iat) <= nowSeconds + CLOCK_SKEW_SECONDS)) return null;
  const authTime = num(payload.auth_time);
  if (!(authTime <= nowSeconds + CLOCK_SKEW_SECONDS)) return null;
  if (nowSeconds - authTime > MAX_AUTH_AGE_SECONDS) return null;
  if (firebase.sign_in_provider !== "phone") return null;
  if (typeof phone !== "string" || !UAE_E164_RE.test(phone)) return null;

  return { uid: payload.sub, phone };
}
