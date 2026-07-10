import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildCSP, COOP_VALUE } from "./src/lib/security/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// SLC-194 MT-3 (V20, ISSUE-127) — CSP + COOP.
// Phase 1: Content-Security-Policy-Report-Only (kein Block, nur Report). Nach dem
// /qa-Browser-Smoke (security-headers-live-smoke.md, KEIN curl-only-PASS) wird der
// Header-Key auf "Content-Security-Policy" umgestellt (enforcing) + re-deployt.
// Rollback: Key zurueck auf "-Report-Only".
const JITSI_DOMAIN =
  process.env.NEXT_PUBLIC_JITSI_DOMAIN ??
  "meet-onboarding.strategaizetransition.com";
const CSP_VALUE = buildCSP(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  `https://${JITSI_DOMAIN}`,
);

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  experimental: {
    // V9 SLC-165 MT-4-hotfix (RPT-384 F-1 / ISSUE-087): Bulk-Email-Upload
    // akzeptiert .mbox bis 500 MB. Default = 1 MB blockt Real-World-Uploads
    // (Gmail-Takeout 100MB-GB) an der HTTP-Body-Pipeline bevor die Server-
    // Action laeuft. Bucket file_size_limit (Migration 106) + UI-Validation
    // (helpers.ts MAX_FILE_SIZE_BYTES) sind ebenfalls auf 500 MB gesetzt.
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  async rewrites() {
    return [
      {
        source: "/supabase/:path*",
        destination: "http://supabase-kong:8000/:path*",
      },
      {
        // GoTrue verify/callback endpoints — needed for invite email links
        source: "/auth/v1/:path*",
        destination: "http://supabase-kong:8000/auth/v1/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: `camera=(self "https://${process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? "meet-onboarding.strategaizetransition.com"}"), microphone=(self "https://${process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? "meet-onboarding.strategaizetransition.com"}"), geolocation=()`,
          },
          // SLC-194 MT-3 (ISSUE-127): Report-Only zuerst (siehe Kommentar oben).
          { key: "Content-Security-Policy-Report-Only", value: CSP_VALUE },
          { key: "Cross-Origin-Opener-Policy", value: COOP_VALUE },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
