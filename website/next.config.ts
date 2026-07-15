import type { NextConfig } from "next";

// Security headers applied to every route. These never break the app and give
// us HSTS, clickjacking protection, MIME-sniffing protection, a locked-down
// referrer policy, and a Content-Security-Policy that blocks framing, plugins,
// and off-origin form posts while still allowing Next.js's inline runtime.
const securityHeaders = [
  {
    // Force HTTPS for 2 years incl. subdomains. Only takes effect over HTTPS.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects a small inline bootstrap/hydration script.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Never expose the framework version to attackers.
  poweredByHeader: false,
  experimental: {
    // Admin image uploads go through a Server Action; the default cap is 1MB.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
