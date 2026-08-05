import type { NextConfig } from "next";

/** The API the browser talks to. Inlined at build time, so the CSP below can
 *  name it instead of opening connect-src to everything. */
const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * Third parties the app genuinely loads, kept in one list because a CSP that
 * misses one of them silently breaks sign-in or checkout:
 *   - Google Identity Services: the sign-in button, its iframe, its avatars
 *   - Razorpay Checkout: the script, the payment iframe, its own API calls
 */
const GOOGLE = ["https://accounts.google.com", "https://*.googleusercontent.com"];
const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://*.razorpay.com"];

/**
 * Next inlines its own bootstrap scripts, so 'unsafe-inline' stays for now;
 * a nonce needs middleware this app doesn't have, and getting it wrong is a
 * white screen for real users. Everything else is closed down: nothing can be
 * framed, no plugins, no <base> rewriting, and forms can only post to us.
 *
 * Shipped Report-Only first on purpose. It has never run against real sign-in
 * or a real payment, and breaking checkout costs money — read the violations
 * in the console on /login and /pricing, then rename this to the enforcing
 * header once it is quiet.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${[...GOOGLE, ...RAZORPAY].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // markdown notes can hold any https image, which is also why img-src stays wide
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${[API_ORIGIN, ...GOOGLE, ...RAZORPAY].filter(Boolean).join(" ")}`,
  `frame-src 'self' ${[...GOOGLE, ...RAZORPAY].join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // a year, and this host is https-only anyway
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // allow-popups rather than same-origin: Google sign-in opens one
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  async redirects() {
    return [
      // the user guide is a static mdBook shipped in public/docs — this
      // makes the friendly /docs URL land on its index everywhere (dev
      // serves public files without directory index resolution)
      { source: "/docs", destination: "/docs/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
