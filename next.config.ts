import type { NextConfig } from "next";

// In development Next.js uses eval() for Fast Refresh / HMR and a websocket for
// live reload, so we must relax the CSP for dev only. Production stays strict.
const isDev = process.env.NODE_ENV !== "production";

const GOOGLE_RECAPTCHA_SCRIPTS =
  "https://www.google.com https://www.gstatic.com https://apis.google.com";

/**
 * Security headers applied to every response. These mitigate clickjacking,
 * MIME-sniffing, referrer leakage and force HTTPS (HSTS) in production.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // geolocation=(self): our booking flow's "share my location" needs it;
  // camera/mic stay fully blocked.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline runtime scripts; 'unsafe-inline' is required for
      // them. In dev, Fast Refresh/HMR also needs 'unsafe-eval'. Google hosts
      // are for Firebase phone login's reCAPTCHA.
      isDev
        ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GOOGLE_RECAPTCHA_SCRIPTS}`
        : `script-src 'self' 'unsafe-inline' ${GOOGLE_RECAPTCHA_SCRIPTS}`,
      "frame-src 'self' https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Dev HMR connects over a websocket to the local server.
      isDev ? "connect-src 'self' https: ws: wss:" : "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework/version to attackers.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
