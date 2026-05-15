# SLC-110 — V6.1 Permanent-Fix Polish-Tripel (FEAT-047)

## Goal

**Operational-Polish-Sammelslice nach V6 /post-launch.** Drei voneinander unabhaengige Polish-Items in einem schmalen Slice zusammengefasst:

1. **ISSUE-072 Permanent-Fix** — `docker-compose.yml` App-Service-Section um `traefik.docker.network=bwkg80w04wgccos48gcws8cs` + `traefik.http.services.app-svc.loadbalancer.server.port=3000` + Router-`.service=app-svc`-Wiring erweitern. Behebt Multi-Network-Falle (App auf 2 Networks ohne explicit Service-Definition fuehrt zu sporadischem 504-Outage nach Coolify-Sentinel-Restart) als bekanntes Pattern aus `jitsi-jibri-deployment.md` Punkt 1+3 + memory `feedback_coolify_multi_network_traefik.md`.

2. **ISSUE-048 Default-DisplayName-Leak Fix** — `src/app/dashboard/page.tsx:81` Fallback-Bedingung um Default-Vergleich erweitern: wenn `branding.displayName === STRATEGAIZE_DEFAULT_BRANDING.displayName` ("Strategaize"), dann auf `partner_organization.display_name` zurueckfallen statt "Ihr Steuerberater: Strategaize" anzuzeigen. Verhindert UI-Verwirrung im RPC-Failure-Edge-Case.

3. **ISSUE-049 React-cache fuer Branding-Resolver** — `resolveBrandingForTenant` in `src/lib/branding/resolve.ts` mit React `cache()` wrappen. Deduplikation auf Request-Scope (Layout + Page-Branch rufen Resolver 2x mit gleicher tenant_id), kein cross-Request-Cache (Branding-Aenderungen muessen beim naechsten Request sichtbar sein).

## Feature

FEAT-047 (V6.1 Operational-Polish — Multi-Network + Branding-Polish). Pattern-Reuse:
- jitsi-jibri-deployment.md Punkt 1+3 fuer Multi-Network-Label-Pattern
- React `cache()` Standard-Pattern fuer Server-Component-Request-Scope-Memoization
- bestehende `STRATEGAIZE_DEFAULT_BRANDING`-Constant aus `src/lib/branding/resolve.ts`

## In Scope

### A — Multi-Network-Label-Fix (ISSUE-072) — MT-1

`docker-compose.yml` App-Service-Section um folgende Labels ergaenzen (nach den existierenden `traefik.enable=true`):

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=bwkg80w04wgccos48gcws8cs"
  - "traefik.http.services.app-svc.loadbalancer.server.port=3000"
  # bestehende Router-Labels:
  - "traefik.http.routers.https-0-bwkg80w04wgccos48gcws8cs-app.service=app-svc"
  - "traefik.http.routers.http-0-bwkg80w04wgccos48gcws8cs-app.service=app-svc"
```

**Wichtig:**
- `traefik.docker.network=bwkg80w04wgccos48gcws8cs` zwingt Traefik, das Coolify-Project-Network (10.0.3.x) als Backend-Interface zu waehlen, nie das `_strategaize-net` (10.0.4.x), das Coolify-Proxy nicht hat.
- `traefik.http.services.app-svc.loadbalancer.server.port=3000` zwingt Traefik den Next.js-Standard-Port 3000, statt EXPOSE-Auto-Discovery (analoges Problem wie Jitsi 80 vs 443).
- Router `.service=app-svc` Wiring verhindert Auto-Service-Generation-Ambiguitaet (Pattern aus jitsi-jibri-deployment.md Punkt 2).
- **Pflicht-Pruefung vor Compose-Edit:** Coolify-UI Project-UUID + Container-Name + Domain noch identisch. Werte hardcoded — bei Re-Import oder Project-Recreation neu setzen.

Worker-Service-Section bleibt unveraendert (Worker hat keinen Traefik-Label, kein eingehender HTTPS).

### B — ISSUE-048 Default-DisplayName-Leak Fix — MT-2

`src/app/dashboard/page.tsx` Zeile 81 anpassen:

```typescript
// Vorher:
let partnerDisplayName: string | null = branding.displayName;
if (!partnerDisplayName || partnerDisplayName.length === 0) {
  partnerDisplayName = partnerOrgRow?.display_name ?? null;
}

// Nachher:
let partnerDisplayName: string | null = branding.displayName;
if (
  !partnerDisplayName ||
  partnerDisplayName.length === 0 ||
  partnerDisplayName === STRATEGAIZE_DEFAULT_BRANDING.displayName
) {
  partnerDisplayName = partnerOrgRow?.display_name ?? null;
}
```

Import um `STRATEGAIZE_DEFAULT_BRANDING` ergaenzen (bereits aus `@/lib/branding/resolve` exportiert).

**Vitest:** neuer Test in `src/app/dashboard/__tests__/branding-fallback.test.ts` (NEU, ~30 LoC) — mockt Branding-Resolver mit Default-Return + Tenant mit display_name=null und mit display_name="Mustermann GmbH", erwartet beide Faelle.

### C — ISSUE-049 React-cache Branding-Resolver — MT-3

`src/lib/branding/resolve.ts` Anpassung:

```typescript
import { cache } from "react";

// vorher: export async function resolveBrandingForTenant(tenantId: string) { ... }
// nachher:
export const resolveBrandingForTenant = cache(async (tenantId: string) => {
  // bestehender Code unveraendert
});
```

**Wichtig:** `cache()` ist ein React-Server-Side-Pattern, deduplicated nur innerhalb derselben Request-Render-Phase. Cross-Request bleibt jeder Aufruf separat → Branding-Aenderungen nach Speicher-Click sind sofort sichtbar (kein Stale-Cache-Risk).

**Vitest:** Erweiterung in `src/lib/branding/__tests__/resolve.test.ts` — neuer Test "deduplicates two calls within same request scope" mit Spy auf RPC-Mock + 2 Calls + Assert dass RPC nur 1x angekommen ist (cache-hit).

## Out of Scope

- SLC-105 Diagnose-Werkzeug (V6.1-Hauptscope, BL-095-blockiert) — separater Slice nach Workshop-Abschluss
- NL-Sprach-Variante Diagnose-Werkzeug — auch SLC-105-Folgearbeit
- BL-094 AVV-Template + Datenschutz/Impressum — separater Compliance-Track
- Sentry/Observability-Integration — V7+
- Cron-Tuning fuer Lead-Push-Retry — bisher kein konkreter Bedarf, V6.1+-Backlog

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | docker-compose.yml enthaelt 3 neue Labels (`traefik.docker.network`, `loadbalancer.server.port=3000`, beide Router `.service=app-svc`). |
| AC-2 | Nach Coolify-Reload-Compose + Redeploy: externer `curl https://onboarding.strategaizetransition.com/login` HTTP 200 in <500ms. |
| AC-3 | `docker inspect app-...` Networks-Section zeigt App weiterhin auf beiden Networks (Functional erforderlich fuer App→DB), `coolify-proxy` Routing-Table zeigt Backend-IP-Wahl auf bwkg-Network 10.0.3.x. |
| AC-4 | `dashboard/page.tsx` Fallback erweitert um STRATEGAIZE_DEFAULT_BRANDING-Vergleich. |
| AC-5 | Mit gemocktem Default-Resolver-Return + Tenant-display_name="Mustermann GmbH" zeigt Vitest-Test `partnerDisplayName === "Mustermann GmbH"`. |
| AC-6 | `resolve.ts` exportiert `resolveBrandingForTenant` als `cache()`-wrapped function. |
| AC-7 | Vitest "deduplicates two calls within same request scope" verifiziert RPC-Mock 1x trotz 2 Calls. |
| AC-8 | `npm run test` volltree PASS — keine Regression auf bestehenden Branding/dashboard-Tests. |
| AC-9 | tsc + eslint EXIT=0 volltree. |
| AC-10 | Live-Smoke nach Redeploy: 5 Pflicht-Smokes wie REL-015 (Container-Health 16/16, External /login HTTP 200 + TTFB <200ms, ENV-Propagation, Cross-System-Smoke optional, Image-Tag-Match). |

## Micro-Tasks

| MT | Beschreibung | Geschaetzte Zeit |
|---|---|---|
| MT-1 | docker-compose.yml editieren (App-Service Multi-Network-Labels) | 20min |
| MT-2 | `dashboard/page.tsx` Fallback-Erweiterung + Vitest `branding-fallback.test.ts` | 30min |
| MT-3 | `resolve.ts` React-cache wrap + Vitest `dedupe-cache` test | 20min |
| MT-4 | /qa Quality-Gates Full (Vitest + ESLint + tsc + Build) + Multi-Network-Diagnose-Verify | 30-45min |
| MT-5 | **User-Pflicht** — Coolify-UI "Reload Compose File" + "Redeploy" + extern Smoke | ~10min |
| MT-6 | /post-launch V6.1 Light-Smoke (Container-Health + External-Routing + Cross-System optional) | 15min |

**Gesamt-Aufwand:** ~2-2.5h Code-Side + ~10-15min User-Pflicht (Coolify) + 15min Post-Launch.

## Rollback-Pfad

- **MT-1 docker-compose.yml**: Revert via `git revert <commit>` + Coolify "Reload Compose File" + Redeploy mit Pre-V6.1-Compose-Stand. Falls die Labels Probleme machen (z.B. anderer Service hat denselben `app-svc`-Namen): vorubergehend nur `traefik.docker.network` setzen, Service-Port-Label und Router-Wiring spaeter.
- **MT-2 ISSUE-048**: Pure-Code-Aenderung, Revert via Git. Kein DB-Effect.
- **MT-3 ISSUE-049 React-cache**: Pure-Code-Aenderung, Revert via Git. Kein DB-Effect. Bei Cache-Bug (Stale-Branding-Anzeige): cache()-Wrap entfernen, doppelter RPC-Call ist nicht falsch nur ineffizient.

## DEC-Cross-References

- **DEC-114 (NEU)** — Multi-Network-Label-Pattern: bei App-Container auf >1 Docker-Network IST `traefik.docker.network` + `loadbalancer.server.port` + Router-`.service=` Pflicht-Setup.
- **DEC-115 (NEU)** — React `cache()` fuer Server-Side-Resolver mit identischem Input innerhalb gleicher Request-Render (Branding, Tenant-Lookups, Profile-Reads).
- DEC-106 (Branding-CSS-Server-Side-Inline) — bleibt gueltig
- DEC-109 (Branding-RPC SECURITY DEFINER) — bleibt gueltig
- DEC-113 (Strategaize-Default-Color #4454b8) — bleibt gueltig

## Test-Strategie

- **Unit/Integration:** Vitest fuer ISSUE-048 (branding-fallback.test.ts) + ISSUE-049 (resolve.test.ts dedupe).
- **Live-Smoke:** Multi-Network-Diagnose-Verify nach Redeploy via `docker inspect coolify-proxy` Service-Routing-Table + extern-Curl.
- **No-Regression:** komplettes `npm run test` Vitest-Live-Run gegen Coolify-DB im node:20-Container.
- **Browser-Smoke** (optional, kein Pflicht-MT — Playwright Profile-Lock-IMP-528): `/dashboard`-Render mit gemocktem Default-Branding-Resolver (manuelles Testen falls Lokal-Chrome verfuegbar).

## Slice-Status

- **Status:** planned
- **Priority:** High (ISSUE-072 latent-Outage-Risiko)
- **Created:** 2026-05-15
- **Stop-Gate:** keine — alle 3 Polish-Items unabhaengig + sofort baubar
- **Blocker:** keine
- **Predecessor:** SLC-101..104 + SLC-106 (alle done in V6)
