import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * ----------------------------------------------------------------------------
 * Minimal, dependency-free auth for the Dealer Core portal.
 * ----------------------------------------------------------------------------
 * - Passwords are hashed with scrypt + a random per-user salt.
 * - Sessions are stateless, signed (HMAC-SHA256) tokens stored in an
 *   httpOnly cookie.
 *
 * For production, set a strong AUTH_SECRET in the environment. Consider moving
 * to a managed auth provider (Auth.js / Clerk) if you need SSO, password
 * resets, MFA, etc.
 * ----------------------------------------------------------------------------
 */

const DEV_SECRET = "dev-insecure-secret-change-me-in-production";
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Resolves the signing secret lazily (at request time, not import time) so that
 * `next build` does not fail when env vars aren't present in the build step.
 * Fails closed: never serve requests in production with the insecure fallback.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (IS_PROD && (!secret || secret === DEV_SECRET)) {
    throw new Error(
      "AUTH_SECRET must be set to a strong, unique value in production. " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return secret || DEV_SECRET;
}

export const SESSION_COOKIE = "wd_dealer";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const ADMIN_COOKIE = "wd_admin";
export const INSPECTOR_COOKIE = "wd_inspector";

// --- Password hashing --------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, "hex");
  const testBuf = crypto.scryptSync(password, salt, 64);
  return (
    keyBuf.length === testBuf.length && crypto.timingSafeEqual(keyBuf, testBuf)
  );
}

// --- Session tokens ----------------------------------------------------------

function sign(body: string): string {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

export function createSessionToken(dealerId: string, ttlMs: number = SESSION_TTL_MS): string {
  const payload = JSON.stringify({ id: dealerId, exp: Date.now() + ttlMs });
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token?: string | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.id !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload.id;
  } catch {
    return null;
  }
}

/** Returns the authenticated dealer id from the request cookie, or null. */
export function getDealerId(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** Cookie options for setting/clearing the session cookie. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);

// --- Admin (platform operator) ----------------------------------------------

/**
 * The admin password (platform operator). Falls back to a known dev value so
 * the dashboard is usable locally; fails closed in production if unset.
 */
export function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (IS_PROD && (!pw || pw === "admin1234")) {
    throw new Error(
      "ADMIN_PASSWORD must be set to a strong, unique value in production.",
    );
  }
  return pw || "admin1234";
}

/** The admin login email (platform operator). Defaults to admin@thewheelerdealers.com. */
export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || "admin@thewheelerdealers.com").trim().toLowerCase();
}

export function createAdminToken(): string {
  return createSessionToken("admin");
}

/** True if the request carries a valid admin session cookie. */
export function isAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  return verifySessionToken(token) === "admin";
}

// --- Inspector ---------------------------------------------------------------

/**
 * Account ids are cuids and never contain ":"; prefixed subjects ("docs:…",
 * "pending:…", "verified:…") belong to purpose-limited tokens signed with the
 * same key, so they must never be accepted as a session id.
 */
function plainId(id: string | null): string | null {
  return id && !id.includes(":") ? id : null;
}

/** Signs an inspector session token (reuses the generic signed-id token). */
export function createInspectorToken(inspectorId: string): string {
  return createSessionToken(inspectorId);
}

/**
 * Restricted session for an inspector who hasn't verified their email and
 * mobile yet: only /api/inspector/me and /api/inspector/verify accept it, so
 * every job API stays locked without an extra database lookup.
 */
export function createPendingInspectorToken(inspectorId: string): string {
  return createSessionToken(`pending:${inspectorId}`);
}

/** Returns the authenticated (verified) inspector id from the request cookie, or null. */
export function getInspectorId(req: NextRequest): string | null {
  const token = req.cookies.get(INSPECTOR_COOKIE)?.value;
  return plainId(verifySessionToken(token));
}

/** Any inspector session, including the restricted pre-verification one. */
export function getInspectorSession(req: NextRequest): { id: string; pending: boolean } | null {
  const id = verifySessionToken(req.cookies.get(INSPECTOR_COOKIE)?.value);
  if (!id) return null;
  if (id.startsWith("pending:")) {
    const inner = plainId(id.slice("pending:".length));
    return inner ? { id: inner, pending: true } : null;
  }
  const plain = plainId(id);
  return plain ? { id: plain, pending: false } : null;
}

// --- Inspection company (multi-tenant "parent") -------------------------------

export const COMPANY_COOKIE = "wd_company";

/** Signs a company session token (reuses the generic signed-id token). */
export function createCompanyToken(companyId: string): string {
  return createSessionToken(companyId);
}

/** Returns the authenticated company id from the request cookie, or null. */
export function getCompanyId(req: NextRequest): string | null {
  const token = req.cookies.get(COMPANY_COOKIE)?.value;
  return plainId(verifySessionToken(token));
}

/** Short-purpose token letting a just-registered (still pending) company attach documents. */
export function createCompanyUploadToken(companyId: string): string {
  return createSessionToken(`docs:${companyId}`);
}

export function verifyCompanyUploadToken(token?: string | null): string | null {
  const id = verifySessionToken(token);
  return id && id.startsWith("docs:") ? id.slice(5) : null;
}

// --- Customer (mobile OTP login) ----------------------------------------------

export const CUSTOMER_COOKIE = "wd_customer";

/** Signs a customer session token (reuses the generic signed-id token). */
export function createCustomerToken(customerId: string): string {
  return createSessionToken(customerId);
}

/** Returns the authenticated customer id from the request cookie, or null. */
export function getCustomerId(req: NextRequest): string | null {
  const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
  return plainId(verifySessionToken(token));
}

// --- Account Manager (Wheeler Dealers staff who verify reports) ---------------

export const MANAGER_COOKIE = "wd_manager";

export function createManagerToken(managerId: string): string {
  return createSessionToken(`manager:${managerId}`);
}

/** Restricted session until the manager has verified their email + mobile. */
export function createPendingManagerToken(managerId: string): string {
  return createSessionToken(`manager-pending:${managerId}`);
}

/** Any manager session (pending = still has to verify email + mobile). */
export function getManagerSession(req: NextRequest): { id: string; pending: boolean } | null {
  const id = verifySessionToken(req.cookies.get(MANAGER_COOKIE)?.value);
  if (!id) return null;
  for (const [prefix, pending] of [["manager:", false], ["manager-pending:", true]] as const) {
    if (id.startsWith(prefix)) {
      const inner = plainId(id.slice(prefix.length));
      return inner ? { id: inner, pending } : null;
    }
  }
  return null;
}

/** Verified manager id from the request cookie, or null. */
export function getManagerId(req: NextRequest): string | null {
  const s = getManagerSession(req);
  return s && !s.pending ? s.id : null;
}

// --- Contact verification proofs ----------------------------------------------

/** How long a verified email / mobile stays usable to complete a form. */
const PROOF_TTL_MS = 2 * 60 * 60 * 1000;

/** Signed proof that the holder entered the right code for `channel:target`. */
export function createVerificationProof(channel: string, target: string): string {
  return createSessionToken(`verified:${channel}:${target}`, PROOF_TTL_MS);
}

/** Returns the set of "channel:target" keys proven by the given tokens (invalid ones are ignored). */
export function readVerificationProofs(tokens: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(tokens)) return keys;
  for (const t of tokens.slice(0, 12)) {
    if (typeof t !== "string") continue;
    const id = verifySessionToken(t);
    if (id && id.startsWith("verified:")) keys.add(id.slice("verified:".length));
  }
  return keys;
}
