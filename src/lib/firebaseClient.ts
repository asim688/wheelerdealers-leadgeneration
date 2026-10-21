/**
 * Firebase web config (public identifiers, safe in the browser). Phone login is
 * used only when all four NEXT_PUBLIC_FIREBASE_* values are set; otherwise the
 * OTP modal keeps using the server-side flow.
 * NEXT_PUBLIC_* must be referenced literally so Next.js can inline them.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_PHONE_ENABLED = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

/** Loads Firebase on demand so it never bloats pages that don't need login. */
export async function getFirebaseAuth() {
  const { getApp, getApps, initializeApp } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  return getAuth(getApps().length ? getApp() : initializeApp(config));
}
