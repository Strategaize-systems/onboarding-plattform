# SLC-134 — Pen-Test-Suite-Erweiterung Public-Signup-Caller + Anti-Abuse-Verifikation (FEAT-054)

## Goal

Systematische Anti-Abuse-Verifikation fuer V7. Die V6 5-Rollen-Pen-Test-Suite (DEC-100) wird um den neuen `unauthenticated_public_signup_caller`-Akteur erweitert (4 Sub-Varianten: noKey, wrongKey, validKey, validKey + rate_limited). 18 Test-Cases gegen alle 3 V7-Public-Endpoints (Resolve + Signup + Verify) plus DSGVO-Compliance-Test + Service-Key-Timing-Safe-Statistical-Test. Tests laufen gegen Coolify-DB im Docker-Netzwerk (NICHT lokale DB) per `.claude/rules/coolify-test-setup.md`.

Ergebnis ist ein dokumentierter Pen-Test-Report (RPT-XXX-v7-pen-test.md) mit Pass-Rate + residual-Risk-Liste. Pflicht-Voraussetzung fuer SLC-135 Live-Smoke + /qa V7 Gesamt-Pass.

## Feature

FEAT-054 — Pen-Test-Suite-Erweiterung Public-Signup-Caller + Anti-Abuse-Verifikation.

**Pattern-Reuse (per `strategaize-pattern-reuse.md`):**
- `__tests__/pen-test/v6-multi-tenant-rls-pen-test.test.ts` — V6 Pen-Test-Suite-Architektur als Vorlage (Akteur-Rollen-Setup, SAVEPOINT-Pattern, Cleanup-Hooks).
- `.claude/rules/coolify-test-setup.md` — Docker-Netzwerk-Test-Setup, node:20-Container, TEST_DATABASE_URL.
- SAVEPOINT-Pattern fuer expected RLS-Rejections — in V7 fuer expected HTTP-Errors angewandt.
- `vitest.config.ts` — bereits `__tests__/**/*.test.ts` matched, keine Aenderung noetig.

**Cross-Project-Pattern-Check:**
- Pen-Test-Suite-Pattern existiert nur im Onboarding-Repo (V6 5-Rollen-Suite). Single-Source.
- Service-Key-Timing-Statistical-Test ist Standard-Pattern aus Kryptographie-Best-Practices. Neu im Strategaize-Universum, aber kein Cross-Repo-Reuse-Pflicht-Search noetig.

## Background

V6 hat eine `__tests__/pen-test/*.test.ts`-Suite eingefuehrt, die 5 Rollen (strategaize_admin, partner_admin, tenant_admin, employee, anonymous-with-supabase-session) systematisch durch alle Tabellen + RPCs durchprueft (Cross-Tenant-Access, Role-Boundary-Verletzungen). Public-API-Endpoints waren nicht im Scope, weil V6 keine hatte.

V7 fuehrt drei Public-Endpoints ein:
- `GET /api/public/partner/[slug]` (anonymous, no service key, light rate-limit)
- `POST /api/public/signup` (service-key + IP-rate-limit + dsgvo-validate)
- `GET /auth/verify-signup` (token-hash-lookup, anonymous, no rate-limit explicit)

Diese sind die ersten Endpoints in der Plattform, die ohne Supabase-Session erreichbar sind — sie brauchen eigenen Pen-Test-Akteur.

V7-Pen-Test ist BLOCKING fuer /qa V7 Gesamt-Pass. Ohne SLC-134 ist V7 nur durch positiv-Tests abgedeckt, kein systematischer Beweis dass alle Negativ-Pfade (Auth-Fail, Slug-Enumeration, Token-Replay, DSGVO-Verletzung) tatsaechlich abgewehrt werden.

## In Scope

### Neuer Pen-Test-Akteur

`unauthenticated_public_signup_caller` mit 4 Sub-Varianten:
- `noKey` — kein `x-strategaize-service-key` Header
- `wrongKey` — falscher Service-Key (alle Zeichen anders, gleicher Laenge)
- `validKey` — gueltiger Service-Key (aus Test-ENV)
- `validKey + rate_limited` — gueltiger Key, aber Rate-Limit-Hit simuliert (4. Call in 1h)

Test-Setup-Helper:
- `setupTestPartner()` legt einen Test-Partner mit bekanntem Slug an, returnt `{ tenant_id, slug, contact_email }`.
- `cleanupTestPartner(tenant_id)` cleanup post-test.
- `setupTestServiceKey()` setzt ENV-Variable fuer Test-Lauf (kein Production-Key-Leak).

### Test-Cases (~18)

**POST /api/public/signup:**
1. Ohne `x-strategaize-service-key` Header → 401 `invalid_service_key`.
2. Mit falschem Service-Key → 401 `invalid_service_key`.
3. Mit gueltigem Key + bekanntem Slug + neuer Email → 202 + pending_signup-Row.
4. Mit gueltigem Key + unbekanntem Slug → 404 `unknown_partner`.
5. Mit gueltigem Key + bekanntem Slug + bereits-verifizierter Email (existing partner_client_mapping) → 409 `email_already_signed_up`.
6. Mit gueltigem Key + bekanntem Slug + bereits-pending Email → 409 `email_already_signed_up` (DEC-135 strikter 409).
7. Mit gueltigem Key + bekanntem Slug + leerer Email → 422 `validation_failed`.
8. Mit gueltigem Key + bekanntem Slug + ungueltiger Email-Syntax → 422 `validation_failed`.
9. Mit gueltigem Key + bekanntem Slug + dsgvo_consent_accepted=false → 422 `validation_failed`.
10. Mit gueltigem Key + bekanntem Slug + Email aus blocked-Domain (`mailinator.com`) → 422 mit `details: ['disposable_email_domain']`.
11. 4. POST signup vom selben IP innerhalb 1h → 429 `rate_limit_exceeded`.

**GET /api/public/partner/[slug]:**
12. Unbekannter Slug → 404 `unknown_partner`.
13. Reserve-Slug `admin` → 404 (Code-Path NICHT DB).
14. 61. GET partner-Request vom selben IP innerhalb 1h → 429.

**GET /auth/verify-signup:**
15. Mit ungueltigem Token-Hash → Invalid-Link-Page (HTML mit "Link ungueltig").
16. Mit expired Token → Expired-Link-Page (HTML mit "abgelaufen").
17. Mit bereits-verifiziertem Token (Replay nach Status='verified') → Redirect zu /login mit already_verified-Param.
18. 2 parallel-Aufrufe mit gleichem gueltigem Token (Race-Condition) → genau eines provisioniert, anderes sieht status='verified'.

**Audit-Log-Verifikation (separat in jedem Test):**
- Jeder Test prueft, ob `error_log` einen Eintrag mit der erwarteten Category (`public_signup`, `public_signup_verify`, `partner_resolve`) und dem korrekten Status-Code enthaelt.
- DSGVO-Probe: RegEx `/[a-z0-9._-]+@/` auf `error_log.metadata::text` muss FAIL (= kein Klartext-Email).

### Service-Key-Timing-Safe-Statistical-Test

`__tests__/pen-test/service-key-timing-statistical.test.ts`:

Mehrere Aufrufe von `verifyServiceKey` mit Service-Keys, die sich nur in einem Byte unterscheiden:
- Variante A: korrekter Key.
- Variante B: korrekter Key + erstes Byte falsch.
- Variante C: korrekter Key + letztes Byte falsch.
- Variante D: komplett falscher Key (anderes Pattern).

1000 Iterations pro Variante, Random-Seed fixiert via `Math.random` overriden (Vitest `vi.stubGlobal`). Statistical-Bound: Mean-Time-Difference pro Variante darf max. 200ns ueber Variante A liegen. Wenn ja: Test FAIL mit dokumentiertem Timing-Diff.

Deterministisch reproducible (Random-Seed fix, `performance.now()` Sample-Threshold definiert).

### DSGVO-Compliance-Test

`__tests__/pen-test/dsgvo-no-plaintext-pii.test.ts`:

Nach 202-Response wird `error_log` gepruefte:
- KEIN Klartext-Email (RegEx `/[a-z0-9._-]+@[a-z0-9.-]+/` auf `metadata::text`).
- KEIN Klartext-IP (RegEx `/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/` auf `metadata::text`).
- NUR Hash-Werte sichtbar.

Negativ-Probe: temporaer Code-Aenderung schreibt Klartext-Email in metadata (via mock-spy). Test muss eindeutig failen mit Hinweis "PLAINTEXT PII detected". Nach Test: Mock-Revert.

### Pen-Test-Report

`reports/RPT-XXX-v7-pen-test.md` (RPT-Nummer wird in SLC-134 MT-8 final festgelegt):

Inhalt:
- Datum, Test-Run-ID, Environment (Hetzner / Coolify-DB / node:20-Container)
- Test-Count: 18 Cases + 1 Statistical + 1 DSGVO = 20 Tests
- Pass-Rate
- Residual-Risk-Liste
  - Rate-Limit-In-Memory-Reset bei Container-Restart (akzeptiert per DEC-132)
  - auth.users-Orphan bei PostgreSQL-Tx-Failure (akzeptiert per V7-Tradeoff)
  - Captcha-Verzicht in V7 (Trigger-Schwelle DEC-137)
  - Multi-Replica-Setup nicht V7-Scope
- Empfehlung fuer SLC-135 Live-Smoke + /qa V7
- Empfehlung fuer V7.1 (Captcha bei Spam-Welle)

### Quality-Gates am Slice-Ende

- ESLint 0/0 auf Pen-Test-Files.
- tsc EXIT=0 auf Test-Files.
- `npm run test` gegen Coolify-DB: alle pre-existing PASS + 20 neue Pen-Test PASS, 0 Regression.

## Out of Scope

- **DAST/SAST-Scanner-Integration** (V8+ Compliance-Phase).
- **Performance-Load-Tests** (1000 parallele Signup-Requests) → V7 Internal-Test-Mode, Last kommt erst mit Public-Live-Pilot.
- **Cross-System-Pen-Test** (IS-Plattform → Onboarding-Plattform End-to-End) → IS-Repo testet eigene Caller-Logik.
- **Captcha-Bypass-Tests** → V7 hat kein Captcha.
- **IP-Spoofing-Tests** → Trust-Decision auf Coolify-Traefik-Header per DEC-138, kein V7-Test-Coverage.
- **Browser-Side-Pen-Test** (XSS, CSRF) — Endpoints sind reine APIs, kein UI-Render mit User-Input-Reflection (Verify-Page reflectiert kein User-Input direkt).
- **Endpoint-Fuzz-Tests** (Random-Bytes als Body) → V8+ Optional-Hardening, V7-Zod-Schema reicht.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | Alle 18 HTTP-Endpoint-Test-Cases in `__tests__/pen-test/public-signup-pen-test.test.ts` PASS. |
| AC-2 | Tests laufen gegen Coolify-DB im Docker-Netzwerk per `.claude/rules/coolify-test-setup.md`-Pattern (node:20-Container, NICHT lokale DB). |
| AC-3 | SAVEPOINT-Pattern bei Expected-Negativ-Faellen (gemaess `coolify-test-setup.md` Punkt 2) — keine `current transaction is aborted`-Cascade. |
| AC-4 | Test-Data-Cleanup nach jedem Test (`afterEach` DELETE auf test-prefixed Slugs/Emails) — kein Pollution zwischen Test-Runs. |
| AC-5 | Service-Key-Timing-Safe-Statistical-Test ist deterministisch reproducible (Random-Seed fixiert via vi.stubGlobal, 1000 Iters, Bound 200ns). PASS. |
| AC-6 | DSGVO-Compliance-Test failt eindeutig wenn Klartext-PII im Audit-Log landet (Negativ-Probe-Mock liefert Klartext → Test muss failen). |
| AC-7 | Audit-Log fuer alle 18 Cases: error_log enthaelt erwartete Category (`public_signup` / `public_signup_verify` / `partner_resolve`), Status-Code, Hash-Only-Metadata. RegEx-Probe auf `@` und IPv4-Pattern in metadata::text scheitert. |
| AC-8 | Pen-Test-Suite ist Bestandteil von `npm run test` (kein separater Befehl noetig, matched durch `__tests__/**/*.test.ts`). |
| AC-9 | Pen-Test-Report `/reports/RPT-XXX-v7-pen-test.md` dokumentiert (Datum, Anzahl Cases, Pass-Rate, residual-Risk-Liste, Empfehlungen). |
| AC-10 | Quality-Gates: ESLint 0/0, tsc EXIT=0, Vitest 0 Regression. |

## Pre-Conditions

- SLC-131 LIVE: Public-Resolve-Endpoint funktional, Rate-Limit `partnerResolveLimiter` aktiv, Reserve-Liste vorhanden.
- SLC-132 LIVE: Public-Signup-Endpoint funktional, Service-Key-Verifier, Rate-Limit `signupLimiter`, Pending-Repo.
- SLC-133 LIVE: Verify-Endpoint funktional, Auto-Provisioning, Doppel-Klick-Idempotenz.
- Test-ENV `PUBLIC_SIGNUP_SERVICE_KEY` als bekannter Test-Wert setzbar (NICHT Production-Key).
- Coolify-Postgres-Container erreichbar.
- TEST_DATABASE_URL gegen Coolify-DB konfigurierbar.

## Stop-Gates

- **Kein /qa V7 ohne SLC-134 Pen-Test PASS** (Pen-Test ist BLOCKING fuer /qa).
- **Kein /deploy V7 ohne SLC-134 Pen-Test PASS** + SLC-135 Live-Smoke PASS.

## Micro-Tasks

### MT-1: Test-Akteur-Setup + Test-Partner-Fixture

- **Goal:** Helper-Functions fuer Test-Setup, Test-Partner-Anlage, Test-Service-Key-ENV.
- **Files:**
  - `__tests__/pen-test/_helpers/v7-signup-fixture.ts` (NEU)
- **Expected behavior:**
  - `setupTestPartner(): Promise<{ tenant_id, slug, contact_email }>` legt einen `partner_organization`-Row + `tenant` an mit Test-Prefix `v7-pentest-`.
  - `cleanupTestPartner(tenant_id)` DELETE-Cascade alle abhaengigen Rows (pending_signup, partner_client_mapping, profiles, tenant, auth.users).
  - `setupTestServiceKey()` overrides `process.env.PUBLIC_SIGNUP_SERVICE_KEY` mit Test-Wert (z.B. `pentest-fixed-key-2026-05`), restores nach Test-Run.
  - `setupTestPendingSignup(partner_tenant_id, email)` schreibt Pending-Row mit Test-Token, returnt `{ token_clear, token_hash, pending_id }`.
  - `setupExpiredPendingSignup(partner_tenant_id, email)` schreibt Pending mit `expires_at` in Vergangenheit.
- **Verification:**
  - Helper-Functions importierbar.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** SLC-131..133 LIVE.

### MT-2: Pen-Test 11 POST signup Cases

- **Goal:** 11 Test-Cases gegen `POST /api/public/signup` (Auth + Validation + Rate-Limit + Doppel-Check).
- **Files:**
  - `__tests__/pen-test/public-signup-pen-test.test.ts` (NEU)
- **Expected behavior:**
  - 11 `it.each`-driven Tests fuer die 11 Cases aus In-Scope Liste.
  - SAVEPOINT-Pattern bei DB-Fehlern.
  - Email-Send-Mock via vi.mock('src/lib/email').
  - Audit-Log-Probe via direct SELECT `FROM error_log WHERE category='public_signup' AND ...` post-Test.
- **Verification:**
  - 11/11 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1.

### MT-3: Pen-Test 3 GET partner Cases

- **Goal:** 3 Test-Cases gegen `GET /api/public/partner/[slug]` (Unknown + Reserve + Rate-Limit).
- **Files:**
  - `__tests__/pen-test/public-resolve-pen-test.test.ts` (NEU)
- **Expected behavior:**
  - 3 Tests: Unknown-Slug 404, Reserve-Slug `admin` 404 (NO DB-Call), 61. Request 429.
  - DB-Call-Spy via vi.spyOn fuer Reserve-Test (DB-Lookup darf NICHT aufgerufen werden).
- **Verification:**
  - 3/3 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1.

### MT-4: Pen-Test 4 GET verify-signup Cases

- **Goal:** 4 Test-Cases gegen `GET /auth/verify-signup` (Invalid + Expired + Replay + Race).
- **Files:**
  - `__tests__/pen-test/public-verify-pen-test.test.ts` (NEU)
- **Expected behavior:**
  - 4 Tests: Invalid-Token-Hash → Invalid-Page, Expired-Token → Expired-Page, Replay-after-verified → /login-Redirect, parallel-2-Klicks → atomar.
  - Race-Test simuliert via Promise.all([request1, request2]).
- **Verification:**
  - 4/4 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1.

### MT-5: Service-Key-Timing-Safe-Statistical-Test

- **Goal:** 1000-Iter-Statistical-Test mit fixiertem Random-Seed.
- **Files:**
  - `__tests__/pen-test/service-key-timing-statistical.test.ts` (NEU)
- **Expected behavior:**
  - 4 Varianten (correct / first-byte-wrong / last-byte-wrong / completely-different) jeweils 1000x mit `performance.now()`.
  - Mean-Time-Difference pro Variante.
  - Bound: max 200ns ueber Mean-Variante-A.
  - vi.stubGlobal fuer Math.random (Seed-Fix).
- **Verification:**
  - Test PASS.
  - Output zeigt Mean-Diff pro Variante (Sub-200ns).
- **Dependencies:** SLC-132 MT-2 (verifyServiceKey existiert).

### MT-6: DSGVO-Compliance-Test mit Negativ-Probe

- **Goal:** Audit-Log-Probe + Negativ-Probe (Klartext-Mock muss failen lassen).
- **Files:**
  - `__tests__/pen-test/dsgvo-no-plaintext-pii.test.ts` (NEU)
- **Expected behavior:**
  - Test 1 (positiv): 202-Response, post-Check error_log keine Klartext-Email/IP.
  - Test 2 (negativ-probe): Mock error_log-Insert mit Klartext-Email, Verifikation: Audit-Log-Pruefer detektiert Klartext + Test fails eindeutig.
  - RegEx-Helper `containsPlaintextEmail(text)` + `containsPlaintextIp(text)` shared in `__tests__/pen-test/_helpers/dsgvo-regex.ts`.
- **Verification:**
  - Positiv-Test PASS, Negativ-Probe-Test FAIL (deterministisch, demonstriert Detection-Faehigkeit).
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1.

### MT-7: Vollstaendiger Test-Run + Report-Generierung

- **Goal:** Alle 20 Tests ausfuehren + Pen-Test-Report schreiben.
- **Files:**
  - `reports/RPT-300-v7-pen-test.md` (NEU — RPT-Nummer nach existing /reports/-Ordner-Stand)
- **Expected behavior:**
  - Vollstaendiger Test-Run im Coolify-DB-Netzwerk: `docker run --rm --network <coolify-net> -v /opt/onboarding-plattform-test:/app -w /app -e TEST_DATABASE_URL='...' node:20 npx vitest run __tests__/pen-test/`.
  - Output: 20/20 PASS (oder ein Negativ-Probe-FAIL bei MT-6 als erwartetes Verhalten, separat dokumentiert).
  - Report-Markdown mit YAML-Frontmatter: id=RPT-300, date, skill=/slice-planning (oder /qa nach Pen-Test-Lauf), feature=FEAT-054, type=completion.
  - Sektionen: Outcome / Test-Count / Pass-Rate / Residual-Risks / Empfehlungen V7.1.
- **Verification:**
  - Pen-Test-Run komplett, Output gespeichert.
  - Report-File existiert mit korrekter Frontmatter.
- **Dependencies:** MT-1..MT-6.

### MT-8: Quality-Gates + Cockpit-Records

- **Goal:** Slice-End-Gates + Records.
- **Files:**
  - `slices/INDEX.md` (modify — SLC-134 status → done)
  - `planning/backlog.json` (modify — BL-109 → done)
  - `docs/STATE.md` (modify — Current Focus auf SLC-134 done, Next Step = SLC-135)
- **Expected behavior:**
  - ESLint 0/0 / tsc 0 / Vitest 0 Regression.
  - Records aktualisiert.
- **Verification:**
  - Alle Gates PASS in Output.
- **Dependencies:** MT-1..MT-7.

## Execution Order

Strikt sequentiell: **MT-1 → MT-2 → MT-3 → MT-4 → MT-5 → MT-6 → MT-7 → MT-8**.

- MT-1 muss zuerst weil alle anderen MTs Helper-Functions konsumieren.
- MT-2/MT-3/MT-4 sind isoliert pro Endpoint, intern parallelisierbar — der Klarheit halber sequentiell.
- MT-5 ist isoliert (verifyServiceKey-Lib-Test, kein DB-Touch).
- MT-6 nach MT-2/MT-3/MT-4 weil Audit-Log-Probe gegen reale POST-Calls laeuft.
- MT-7 nach allen anderen MTs.

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 Test-Akteur + Fixtures | ~75min |
| MT-2 POST signup 11 Cases | ~150min (11 Cases + Audit-Log-Probes + SAVEPOINTs) |
| MT-3 GET partner 3 Cases | ~45min |
| MT-4 GET verify-signup 4 Cases | ~75min (inkl. Race-Simulation) |
| MT-5 Service-Key-Statistical-Test | ~60min (1000 Iter + Seed-Fix) |
| MT-6 DSGVO + Negativ-Probe | ~60min |
| MT-7 Test-Run + Report | ~45min |
| MT-8 Records + Gates | ~30min |
| **Total** | **~9h (~1d Solo-Founder + Test-Polish-Margin)** |

## Risks

- **R-1 (Medium):** Pen-Test-Cleanup-Hooks vergessen 1 Row → folge-Tests pollen mit Stale-State. Mitigation: `afterEach` mit aggressive Cleanup (DELETE WHERE slug LIKE 'v7-pentest-%'). Plus `beforeAll` Cleanup als Defense.
- **R-2 (Medium):** Race-Condition-Test bei MT-4 ist flaky (parallel-Aufrufe haben Timing-Variabilitaet). Mitigation: Use `Promise.allSettled` + verifizieren-only dass Sum-of-Results = 1 Provision + 1 Skip. Nicht-deterministisch welcher Aufruf provisioniert.
- **R-3 (Low):** Service-Key-Statistical-Test ist auf langsamem CI flaky. Mitigation: `--retry=2` + Bound auf 200ns hochsetzen (urspruenglich 100ns). Wenn weiter flaky → Bound auf 500ns + Hinweis im Report-Residual.
- **R-4 (Medium):** Reserve-Slug-`admin`-Test prueft DB-Call-Skip — vi.spyOn auf Supabase-Client-Method ist tricky weil Service-Role-Client direkt importiert wird. Mitigation: Helper-Function fuer DB-Call wrappen (`getPartnerBySlug`), Spy auf Wrapper-Function statt direkter Supabase-Client.
- **R-5 (Low):** Negativ-Probe bei MT-6 macht den Test-Lauf "rot" (1 erwarteter FAIL). User sieht ggf. roten Output und denkt Suite ist kaputt. Mitigation: Klarer `it.fails`-Marker oder separater Test-File `dsgvo-detection-probe.test.ts` mit explizitem `expect(detection).toBe(true)` (Test PASSt wenn Probe detektiert wird; intern wird die Detection durch eingeschleusten Klartext getriggert).

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-134-pen-test-suite-public-signup`.
- Push nach /qa MT-8 PASS, dann Merge nach `main` am Slice-Ende.
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- 0 Migrations. 0 neue Endpoints. Nur Tests + Test-Helpers + Pen-Test-Report.
- Reuse-Quote: ~95% (V6-Pen-Test-Suite-Architektur + Coolify-Test-Setup-Pattern + SAVEPOINT-Pattern + vi.mock-Pattern).
- Pre-Condition fuer SLC-135 + /qa V7 erfuellt: Anti-Abuse-Verifikation dokumentiert.

## References

- Memory `project_op_v7_architecture_done.md` — V7-Stand
- `docs/ARCHITECTURE.md` V7-Sektion Test-Strategy (Line 6409-6413)
- `features/FEAT-054-pen-test-public-signup-anti-abuse.md` — Detail-Spec
- `reports/RPT-297.md` — Architecture-Completion-Report
- `__tests__/pen-test/v6-multi-tenant-rls-pen-test.test.ts` — V6 Pen-Test-Vorlage
- `.claude/rules/coolify-test-setup.md` — Test-Setup-Pattern (node:20 + SAVEPOINT + Netzwerk)
- DEC-100 (V6 Pen-Test-Suite-Akteur-Rollen)
