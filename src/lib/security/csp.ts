// SLC-194 MT-3 (V20, FEAT-111, BL-538, ISSUE-127) — Content-Security-Policy +
// Cross-Origin-Opener-Policy fuer die OP.
//
// Pattern aus strategaize-business-system/cockpit/src/lib/security/csp.ts
// (P-089 / Rule: strategaize-pattern-reuse.md + security-headers-live-smoke.md).
//
// Bewusste OP-Divergenzen gegenueber BS (DEC-288):
//   1. KEINE Nonce. script-src 'unsafe-inline' wie BS + immoscheckheft. Next.js-16
//      RSC-inline-Scripts (__next_f.push) brechen unter strikter script-src ohne
//      'unsafe-inline' → immoscheckheft V3.3 15-Min-Prod-Outage (ISSUE-026). Nonce-CSP
//      ist in ganz Strategaize noch nirgends gebaut (0 x-nonce) und bleibt ein
//      bewusster cross-repo Zukunfts-Slot. Exfil-Bremse kommt hier aus connect-src.
//   2. KEIN Bedrock in connect-src — OP ruft Bedrock ausschliesslich server-side
//      (src/lib/ai/*), der Browser verbindet sich nie direkt.
//   3. KEIN Sentry / report-uri — OP hat keine Sentry-Integration.
//   4. Jitsi ist EMBEDDED (external_api.js-Script + iframe, jitsi-meeting.tsx), NICHT
//      window.open wie BS → die Jitsi-Domain steht in script-src (external_api.js) UND
//      frame-src (Meeting-iframe). Die WSS/Media-Verbindungen laufen INNERHALB des
//      iframes (Jitsi-eigene Origin-CSP) und brauchen daher KEIN connect-src beim Parent.
//      camera/microphone-Delegation an die Jitsi-Origin regelt die Permissions-Policy
//      (next.config.ts, unveraendert).
//
// Update bei neuem External-Service. Erweiterungen IMMER mit DEC dokumentieren.

export function buildCSP(
  supabaseUrl: string,
  jitsiOrigin: string,
  reportUri = "",
): string {
  const connectSrc = ["'self'", supabaseUrl]
    .filter((s) => s.length > 0)
    .join(" ");

  const scriptSrc = [
    "'self'",
    // 'unsafe-inline' Pflicht fuer Next.js RSC-inline-Scripts (siehe Header-Kommentar).
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    jitsiOrigin,
  ]
    .filter((s) => s.length > 0)
    .join(" ");

  const frameSrc = ["'self'", jitsiOrigin].filter((s) => s.length > 0).join(" ");

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `connect-src ${connectSrc}`,
    `img-src 'self' data: blob:`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind-Generated + inline Brand-Vars (layout.tsx)
    `font-src 'self'`,
    `frame-src ${frameSrc}`, // Jitsi-Meeting-iframe
    `frame-ancestors 'none'`, // Clickjacking-Defense (CSP-Aequivalent zu X-Frame-Options DENY)
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ];

  // Phase-1 Report-Only sammelt Violations ohne zu blocken; report-uri optional
  // (leer = kein Directive, fail-safe). Enforce-Flip = Header-Key in next.config.ts
  // von "Content-Security-Policy-Report-Only" auf "Content-Security-Policy".
  if (reportUri.length > 0) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join("; ");
}

// same-origin-allow-popups: erlaubt window.open (Evidence-Download EvidenceFileList,
// Jitsi-Direktlink-Fallback) und schuetzt zugleich vor Cross-Origin-Opener-Zugriff.
export const COOP_VALUE = "same-origin-allow-popups";
