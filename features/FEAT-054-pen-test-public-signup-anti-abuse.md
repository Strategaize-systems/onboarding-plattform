# FEAT-054 — Pen-Test-Suite-Erweiterung Public-Signup-Caller + Anti-Abuse-Verifikation

**Version:** V7
**Status:** planned
**Created:** 2026-05-18

## Zweck

Validation-Schicht fuer V7. Die V6 5-Rollen-Pen-Test-Suite (DEC-100) wird um den neuen `unauthenticated_public_signup_caller`-Akteur erweitert. Ohne diese Erweiterung ist V7-Public-Endpoint nur durch positiv-Tests abgedeckt — kein systematischer Beweis, dass die negativ-Faelle (kein Key / falscher Key / Rate-Limit / Slug-Enumeration / Token-Replay) tatsaechlich abgewehrt werden.

## Hintergrund

V6 hat eine `__tests__/pen-test/*.test.ts`-Suite eingefuehrt, die 5 Rollen (strategaize_admin, partner_admin, tenant_admin, employee, anonymous-with-supabase-session) systematisch durch alle Tabellen + RPCs durchprueft (Cross-Tenant-Access, Role-Boundary-Verletzungen). Public-API-Endpoints waren nicht im Scope, weil V6 keine hatte.

V7 fuehrt zwei Public-Endpoints ein (Signup-POST + Partner-Resolve-GET) und einen Public-Verify-Endpoint. Diese sind die ersten Endpoints in der Plattform, die ohne Supabase-Session erreichbar sind — sie brauchen eigenen Pen-Test-Akteur.

## In Scope

- **Neuer Pen-Test-Akteur**: `unauthenticated_public_signup_caller` — kein Supabase-Session, kein User-Cookie, optional ein Service-Key im Header. Vier Sub-Varianten:
  - `noKey` — kein `x-strategaize-service-key` Header
  - `wrongKey` — falscher Service-Key
  - `validKey` — gueltiger Service-Key
  - `validKey + rate_limited` — gueltiger Key, aber Rate-Limit-Hit simuliert
- **Test-File `__tests__/pen-test/public-signup-pen-test.test.ts`** mit min. 15 Test-Cases:
  - POST signup ohne Key → 401
  - POST signup mit falschem Key → 401
  - POST signup mit gueltigem Key + bekanntem Slug + neuer Email → 202
  - POST signup mit gueltigem Key + unbekanntem Slug → 404
  - POST signup mit gueltigem Key + bekanntem Slug + bereits-verifizierter Email → 409
  - POST signup mit gueltigem Key + bekanntem Slug + bereits-pending Email → 409 oder 202-idempotent (Entscheidung in /architecture)
  - POST signup mit gueltigem Key + bekanntem Slug + leerem Email → 422
  - POST signup mit gueltigem Key + bekanntem Slug + ungueltiger Email-Syntax → 422
  - POST signup mit gueltigem Key + bekanntem Slug + dsgvo_consent_accepted=false → 422
  - POST signup mit gueltigem Key + bekanntem Slug + Email aus geblockter Domain → 422
  - 4. POST signup vom selben IP innerhalb 1h → 429
  - GET partner mit unbekanntem Slug → 404
  - GET partner mit Reserve-Slug (`admin`) → 404
  - 61. GET partner-Request vom selben IP innerhalb 1h → 429
  - POST verify-signup mit ungueltigem Token-Hash → 401
  - POST verify-signup mit expired Token → 410
  - POST verify-signup mit bereits-verifiziertem Token (Replay) → 401 oder idempotenter 200-Redirect (Entscheidung in /architecture)
  - POST verify-signup parallel zwei Aufrufe mit gleichem Token (Race-Condition) → genau eines provisioniert, anderes sieht status='verified'
- **Audit-Log-Verifikation**: Jeder Pen-Test-Case prueft, ob `error_log` einen Eintrag mit der erwarteten Category (`public_signup`, `public_signup_verify`, `partner_resolve`) und dem Hash der Email/IP enthaelt. Verifiziert AC-7 von FEAT-051.
- **Service-Key-Timing-Safe-Compare-Test**: Mehrere Aufrufe mit Service-Keys, die sich nur in einem Byte unterscheiden — Time-Diff muss unter Detection-Threshold liegen (statistischer Test mit 1000 Iterations).
- **DSGVO-Compliance-Test**: Nach 202-Response wird `error_log` gepruefte: KEIN Klartext-Email, KEIN Klartext-IP, NUR Hash. Test failed, wenn Klartext gefunden wird (RegEx auf `@` in email-Hash-Feld).

## Out of Scope

- DAST/SAST-Scanner-Integration (V8+ Compliance-Phase).
- Performance-Load-Tests (z.B. 1000 parallele Signup-Requests). V7 ist Internal-Test-Mode — Last kommt erst mit Public-Live-Pilot.
- Cross-System-Pen-Test (Intelligence-Plattform → Onboarding-Plattform). Bleibt in IS-Repo getestet.
- Captcha-Bypass-Tests (V7 hat kein Captcha).
- IP-Spoofing-Tests (Trust-Decision auf Coolify-Traefik-Header bewusst, in /architecture als DEC dokumentieren).

## Akzeptanzkriterien

- AC-1: Alle ~18 Test-Cases in `__tests__/pen-test/public-signup-pen-test.test.ts` PASS.
- AC-2: Tests laufen gegen Coolify-DB im Docker-Netzwerk (siehe `.claude/rules/coolify-test-setup.md`), NICHT gegen lokale DB.
- AC-3: SAVEPOINT-Pattern bei Expected-Negativ-Faellen (gemaess `coolify-test-setup.md` Punkt 2).
- AC-4: Test-Data-Cleanup nach jedem Test (kein Pollution zwischen Test-Runs).
- AC-5: Timing-Safe-Compare-Statistical-Test ist deterministisch reproducible (Random-Seed fixiert).
- AC-6: DSGVO-Compliance-Test failed eindeutig wenn Klartext-PII im Audit-Log landet (Negativ-Probe: temporaer Code-Aenderung schreibt Klartext → Test muss failen).
- AC-7: Pen-Test-Suite ist Bestandteil von `npm run test` (kein separater Befehl noetig).
- AC-8: Pen-Test-Report wird in `/reports/RPT-XXX-v7-pen-test.md` dokumentiert (Datum, Anzahl Cases, Pass-Rate, residual-Risk-Liste).

## Abhaengigkeiten

- **Hard-Dep FEAT-051**: Public-Signup-Endpoint muss existieren.
- **Hard-Dep FEAT-052**: Public-Resolve-Endpoint muss existieren.
- **Hard-Dep FEAT-053**: Verify-Endpoint + Auto-Provisioning muss existieren.
- **Pattern-Reuse**: V6 Pen-Test-Suite-Architektur (`__tests__/pen-test/*.test.ts`).
- **Pattern-Reuse**: Coolify-Test-Setup-Pattern (`.claude/rules/coolify-test-setup.md`).
- **Pattern-Reuse**: SAVEPOINT-Pattern fuer expected RLS-Rejections (in V7 fuer expected HTTP-Errors).

## Reuse-Anker

- `__tests__/pen-test/v6-multi-tenant-rls-pen-test.test.ts` — Vorlage fuer V7-Public-Pen-Test.
- `.claude/rules/coolify-test-setup.md` — Docker-Netzwerk-Test-Setup.
- `vitest.config.ts` — keine Aenderung noetig, Pen-Test-Files matchen schon `__tests__/**/*.test.ts`.
