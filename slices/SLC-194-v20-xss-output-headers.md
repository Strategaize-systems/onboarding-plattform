# SLC-194 — V20 XSS/Output/Headers-Hardening

- Feature: FEAT-111 (BL-538)
- Status: planned
- Priority: Blocker
- Delivery Mode: SaaS → kumulativer Branch `v20-security-hardening` (nach SLC-193)
- Architektur: PRD §V20, ARCHITECTURE §X, DEC-281 / DEC-282 / DEC-284 + ISSUE-130
- Migrationen: keine (reiner Code)

## Goal
XSS-Sinks + fehlende Security-Header schliessen: Handbook rehype-raw-XSS (ISSUE-121), Partner-SVG-XSS (ISSUE-122), globale CSP/COOP (ISSUE-127), branding-Render-Re-Validierung (ISSUE-130). Legal-Pages sind bereits safe (DEC-281 → kein Fix).

## In Scope
Handbook rehype-sanitize; SVG-Block + Logo-Route-Härtung; CSP-Nonce-Middleware Report-Only→enforcing + COOP; branding-Farben Render-Re-Validierung.

## Out of Scope
Legal/Datenschutz-Page-Fix (bereits safe, DEC-281). DOMPurify-Funnel (nicht nötig). DB-Änderungen. COEP (deferred, KNOWN_ISSUES-Notiz).

## Verified-Against-Code-Reality (§X.2 + diese Session)
| Pfad | Status | Befund |
|---|---|---|
| `src/components/handbook/HandbookReader.tsx:250,320` | MODIFY | rehypeRaw ohne sanitize (2 Plugin-Stacks) |
| `src/workers/handbook/sections.ts:85-93,234` | MODIFY | emittiert legitimes `<a id>` + `<video>` → kein Raw-Drop |
| `src/lib/handbook/sanitize-schema.ts` | NEU | darf nicht existieren |
| `src/app/partner/dashboard/branding/actions.ts:38` | MODIFY | `ALLOWED_MIMES` inkl. `image/svg+xml`, nur `file.type`-Check |
| `src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts:32-37,118-125` | MODIFY | `MIME_BY_EXT` inkl. svg; serviert inline ohne nosniff/Disposition |
| `src/proxy.ts` | MODIFY | thin, delegiert an `updateSession`; matcher exkludiert statische Bilder |
| `src/lib/supabase/middleware.ts` | MODIFY? | `updateSession`-Impl (Response-Objekt für Header-Set) |
| `src/app/layout.tsx:35` | MODIFY | inline `<style dangerouslySetInnerHTML>` (dyn. Brand-Vars) → Nonce |
| `next.config.ts:32-51` | MODIFY | headers() ohne CSP/COOP/COEP |
| `src/lib/branding/resolve.ts:66,73-75` | MODIFY | primary/secondaryColor render-time ungeprüft (write-time HEX_REGEX ok) |
| `src/app/datenschutz/page.tsx`, `src/app/impressum/page.tsx` | UNBERÜHRT | safe (kein rehypeRaw / JSX) |

## Symbol-/API-Verifikation
- `HandbookReader` ReactMarkdown-Plugin-Kette (rehypeRaw, rehypeSlug, rehypeAutolinkHeadings, highlightRehypePlugin) — sanitize NACH rehypeRaw, VOR slug/autolink/highlight.
- `rehype-sanitize` exportiert `default` (Plugin) + `defaultSchema` (aus hast-util-sanitize); Custom-Schema = `structuredClone(defaultSchema)` + `a` id-Attr + `video` src/controls/etc.
- `ALLOWED_MIMES` (actions.ts:38, `as const`), `MIME_BY_EXT` (logo route:32-37), `HEX_REGEX` (actions.ts:187), `hexToRgbTriplet`/`resolve.ts`. `updateSession`(NextResponse) für CSP-Header-Attach.

## Test-Infra-Klassifikation (vitest node-env, kein jsdom)
- **Pure-Mock-Vitest**: sanitize-Schema-Funktion (Input-HTML mit `<script>/<iframe srcdoc>/onerror` → gestript; `<a id>/<video>` → erhalten); ALLOWED_MIMES-/MIME_BY_EXT-Assertion (svg absent); branding-resolve-Re-Validierung (Bad-Color → Default). Pfad `src/**/*.test.ts`.
- **Live-Smoke** (/qa Browser, `security-headers-live-smoke.md`, P-089): CSP Report-Only→Violations→enforcing (KEIN `curl -I`-only-PASS); Handbook-`<iframe srcdoc>`-Payload rendert nicht aus; SVG-Upload abgelehnt; Kernflows (Login/Dashboard/Diagnose/Handbook/Jitsi-Popup) unbeschädigt unter enforcing.

## Reuse-Claim-Verifikation
- **P-083** Branding-Upload assertRole-first + SVG-MIME-Block — `actions.ts` hat bereits Rollen-Gate; SVG-Entfernung + Magic-Byte ergänzen.
- **P-089 / security-headers-live-smoke.md** CSP-Funktional-Smoke — Playbook VOR MT-3 lesen.
- **rehype-sanitize** = NEUE Dependency (nicht installiert; `rehype-raw ^7` vorhanden). Kein bestehendes Sanitize-Pattern in OP → Neu-Implementierung des Schemas als MT, P-082 (DOMPurify) hier NICHT anwendbar (react-markdown-Pipeline statt HTML-Funnel).

## Micro-Tasks

### MT-1: rehype-sanitize Dependency + Handbook-Schema + sections.ts-Escape [shared]
- Goal: Handbook-XSS schliessen ohne legitimes HTML zu brechen.
- Files: `package.json` (MODIFY, +`rehype-sanitize`), `src/lib/handbook/sanitize-schema.ts` (NEU), `src/lib/handbook/sanitize-schema.test.ts` (NEU, Pure-Mock), `src/components/handbook/HandbookReader.tsx` (MODIFY, sanitize in beide Plugin-Stacks), `src/workers/handbook/sections.ts` (MODIFY, interpolierten Tenant-Content escapen).
- Expected: Schema = defaultSchema + `a[id]` + `video[src,controls,width,height,poster]`; blockt `script/iframe/srcdoc/on*/style`. Plugin-Reihenfolge: rehypeRaw → rehypeSanitize(schema) → rehypeSlug → rehypeAutolinkHeadings → highlight. sections.ts escaped Subtopic-Namen/Body-Fragmente vor Markdown-Emission.
- Verification: Pure-Mock-Test (XSS-Payloads gestript, Anker/Video erhalten); `npm install` erfolgreich; tsc/eslint/build 0.
- Dependencies: none.

### MT-2: SVG-Block + Logo-Route-Härtung [backend]
- Goal: SVG-Stored-XSS-Klasse ganz schliessen.
- Files: `src/app/partner/dashboard/branding/actions.ts` (MODIFY, `image/svg+xml` raus + Magic-Byte-Check), `src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts` (MODIFY, svg raus aus MIME_BY_EXT + `X-Content-Type-Options: nosniff`), `src/app/partner/dashboard/branding/actions.test.ts` (NEU, Pure-Mock).
- Expected: ALLOWED_MIMES = png/jpeg/webp; Upload validiert Magic-Byte (nicht nur file.type); Logo-Route servt kein svg mehr + nosniff-Header; assertRole bleibt first.
- Verification: Test: SVG-Upload → Reject; PNG mit svg-Content-Type → Magic-Byte-Reject; Route-Response-Header enthält nosniff.
- Dependencies: none.

### MT-3: CSP-Nonce-Middleware + COOP (Report-Only→enforcing) [backend]
- Goal: Globale CSP mit Nonce + COOP; Exfil-Bremse für alle XSS-Sinks.
- Files: `src/proxy.ts` (MODIFY, Nonce generieren + CSP-Header attach), `src/lib/supabase/middleware.ts` (MODIFY falls Response dort gebaut), `src/app/layout.tsx` (MODIFY, Nonce auf inline `<style>` + Next-Scripts), `next.config.ts` (MODIFY, `Cross-Origin-Opener-Policy: same-origin-allow-popups`).
- Expected: per-Request-Nonce (crypto), `Content-Security-Policy-Report-Only` in Phase 1 (`script-src 'self' 'nonce-…'`, `style-src 'self' 'nonce-…'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), Nonce via Request-Header an layout.tsx. COOP same-origin-allow-popups (Jitsi window.open erhalten). COEP NICHT (deferred).
- Verification: Live-Smoke (security-headers-live-smoke.md): Report-Only-Header live; Browser-Kernflow-Smoke 0 CSP-Violations der Eigen-Assets; DANN Umstellung auf enforcing + Re-Smoke (SC-V20-4). Jitsi-Popup öffnet weiter.
- Dependencies: none (aber Report-Only→enforcing-Schnitt spannt über /qa).

### MT-4: branding-Farben Render-Re-Validierung [backend] (ISSUE-130, Low)
- Goal: Render-Pfad revalidiert Farbwerte (Defense-in-Depth).
- Files: `src/lib/branding/resolve.ts` (MODIFY), `src/lib/branding/resolve.test.ts` (NEU/MODIFY, Pure-Mock).
- Expected: `primaryColor`/`secondaryColor` bei Render gegen HEX_REGEX geprüft, bei Invalid → Default (nicht ungeprüft in `:root`-Style).
- Verification: Test: Injection-String → Default statt Roh-Ausgabe.
- Dependencies: MT-3 (gemeinsamer Render-Pfad layout.tsx/style).

## Cross-Slice-Dependencies
- **blockiert-von:** SLC-193 (kumulativer Branch — auf SLC-193-HEAD aufsetzen).
- **blockiert:** SLC-195.
- **Shared:** `src/app/layout.tsx` (MT-3 Nonce + MT-4 Farb-Render) — beide im selben Slice, MT-4 nach MT-3. `package.json` (MT-1 Dependency-Add).
- **CSP-Rollout-Naht:** Report-Only in MT-3 gesetzt, enforcing-Flip erst nach /qa-Browser-Smoke (dedizierter Verifikations-Schritt, security-headers-live-smoke.md).

## Acceptance Criteria
- AC-194-1 [Pure-Mock]: Handbook-Schema stript script/iframe/srcdoc/on*, erhält `<a id>`+`<video>`.
- AC-194-2 [Live-Smoke]: `<iframe srcdoc>`-Payload im Handbook rendert nicht aus.
- AC-194-3 [Pure-Mock]: SVG-Upload abgelehnt (MIME + Magic-Byte); Logo-Route ohne svg + nosniff.
- AC-194-4 [Live-Smoke]: CSP zuerst Report-Only (0 Eigen-Asset-Violations), dann enforcing; Kernflows + Jitsi-Popup intakt (SC-V20-4).
- AC-194-5 [Pure-Mock]: branding-Render revalidiert Farben.
- AC-194-6: tsc 0 / eslint 0 / next build PASS / Vitest 0 Regression + neue Tests; +1 Dependency (rehype-sanitize) dokumentiert.
