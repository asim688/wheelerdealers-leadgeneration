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

/** Friendly message for a Firebase Phone Auth error. */
export function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return "That mobile number doesn't look right. Please check it and try again.";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/invalid-verification-code":
      return "Incorrect code. Please try again.";
    case "auth/code-expired":
      return "That code has expired. Please request a new one.";
    case "auth/captcha-check-failed":
      return "Security check failed. Please refresh the page and try again.";
    case "auth/operation-not-allowed":
      return "SMS verification isn't available for this number right now.";
    case "auth/network-request-failed":
      return "Network error — please check your connection and try again.";
    default:
      return "We couldn't complete the verification. Please try again.";
  }
}
