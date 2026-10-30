import type { NextConfig } from "next";

/**
 * Content Security Policy: scripts, frames and styles may only come from our own site and the services we use
 * (Paddle checkout, Google Analytics, Cloudflare Turnstile, YouTube). Blocks scripts injected from anywhere else,
 * plugins, <base> hijacking, forms posting to other sites and embedding ProofMyAI in other sites (clickjacking).
 */
function csp(): string {
  const dev = process.env.NODE_ENV !== "production";
  const paddle = "https://cdn.paddle.com https://*.paddle.com https://public.profitwell.com";
  const ga = "https://www.googletagmanager.com https://*.google-analytics.com https://*.googletagmanager.com";
  const turnstile = "https://challenges.cloudflare.com";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${paddle} ${ga} ${turnstile}`,
    `style-src 'self' 'unsafe-inline' ${paddle} https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com ${paddle}`,
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https:${dev ? " ws:" : ""}`,
    `frame-src 'self' ${paddle} ${turnstile} https://www.youtube-nocookie.com https://www.youtube.com`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Browser security headers for every page (clickjacking, MIME sniffing, HTTPS-only, referrer leaks). */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Each deploy gets its own id, so a page left open from an older version does a full reload when it navigates
  // instead of calling server actions that no longer exist (Railway sets the commit SHA at build time).
  ...(process.env.RAILWAY_GIT_COMMIT_SHA ? { deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 12) } : {}),
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async redirects() {
    // People type proofmyai.com/pricing; the plans live on the homepage.
    return [{ source: "/pricing", destination: "/#pricing", permanent: true }, { source: "/plans", destination: "/#pricing", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/video/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
