import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Enforced now: rules that can't break a page. No framing by other sites
 * (rate, follow and vote are one tap, so a hidden frame could trick that tap),
 * no plugins, no <base> rewriting, and forms only post back to MULO.
 */
const ENFORCED_CSP = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Reported, not enforced, while it's checked against real traffic. Browsers
 * log anything outside it to the console without blocking it. Next's inline
 * scripts need 'unsafe-inline' until pages move to per-request nonces, which
 * would rule out caching pages (see docs/hardening-audit.md).
 */
const REPORTED_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Covers, photos and avatars come from several hosts (storage, Cover Art
  // Archive, Wikimedia, Apple); images can't run code.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Song previews are looked up and played from Apple, in the browser.
  "connect-src 'self' https://itunes.apple.com",
  "media-src 'self' https://*.apple.com https://*.mzstatic.com",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ENFORCED_CSP },
  { key: "Content-Security-Policy-Report-Only", value: REPORTED_CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Two years. Left off subdomains, so a future custom domain's other
  // subdomains aren't committed to HTTPS by this site.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
