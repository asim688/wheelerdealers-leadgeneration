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

export function createSessionToken(dealerId: string): string {
  const payload = JSON.stringify({ id: dealerId, exp: Date.now() + SESSION_TTL_MS });
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

/** Signs an inspector session token (reuses the generic signed-id token). */
export function createInspectorToken(inspectorId: string): string {
  return createSessionToken(inspectorId);
}

/** Returns the authenticated inspector id from the request cookie, or null. */
export function getInspectorId(req: NextRequest): string | null {
  const token = req.cookies.get(INSPECTOR_COOKIE)?.value;
  return verifySessionToken(token);
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
  return verifySessionToken(token);
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
  return verifySessionToken(token);
}
