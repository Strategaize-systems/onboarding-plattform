# SLC-135 — TTL-Cleanup-Cron + Final-Hardening + Live-Smoke (FEAT-053 Operational)

## Goal

Operativer Abschluss von V7 vor /qa V7 Gesamt-Pass + /final-check + /go-live + /deploy. Drei Themen-Bloecke:

1. **TTL-Cleanup-Cron**: `pending-signup-cleanup-hourly` als Coolify-Scheduled-Task gegen `/api/cron/pending-signup-cleanup` (CRON_SECRET-geschuetzt). UPDATEt expired Pending-Rows auf status='expired', loescht > 7 Tage alte expired Rows (DSGVO-Datensparsamkeit).
2. **Final-Hardening**: ENV-Variable-Generierung (PUBLIC_SIGNUP_SERVICE_KEY als 32-byte hex Random, direkt-Wert per `feedback_env_value_not_command`; PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS Default), IONOS-Postfach-Check `onboarding@strategaize.de` (DEC-134), Smoke-Send-Test pre-Deploy.
3. **Live-Smoke-Plan**: Cross-System-Smoke-Plan dokumentiert (IS-Plattform → Onboarding-Plattform Test-Service-Key + Test-Partner-Slug + Test-Email + Verify-Klick + Verifikation neuer Tenant/Auth-User/Profile/Mapping-Rows + Lead-Push-Smoke-Hook). Tatsaechliche Live-Smoke-Ausfuehrung erfolgt in `/qa V7` oder `/deploy V7`.

Ergebnis: V7 ist code-side komplett, alle Operations-Bausteine in place, Coolify-Cron live, ENV-Variables generiert, Smoke-Plan dokumentiert. Bereit fuer `/qa V7` Gesamt-Pass.

## Feature

FEAT-053 Operational-Anteil (Cleanup-Cron). Plus Cross-Slice-Operations-Pflicht (ENV-Setup, Postfach-Check, Smoke-Plan).

**Pattern-Reuse (per `strategaize-pattern-reuse.md`):**
- DEC-059 Coolify-Cron-Pattern + V4.2 Scheduled-Task `capture-reminders-daily` als Reuse-Vorlage fuer `pending-signup-cleanup-hourly`.
- `verifyCronSecret`-Helper (V4.2) — CRON_SECRET-Header-Check-Pattern.
- V6 Coolify-Scheduled-Task `walkthrough-cleanup-daily` (V5 Option 2) — Setup-Anleitung-Vorlage.
- `feedback_coolify_cron_node` Memory — `which curl`-Check + `node -e fetch()`-Fallback bei fehlendem curl im Container.
- `feedback_cron_job_instructions` Memory — Tabelle + User-Bestaetigung als Setup-Protokoll.
- `feedback_env_value_not_command` Memory — ENV-Wert direkt generieren statt Generator-Command zeigen.
- `.claude/rules/coolify-test-setup.md` — Vitest gegen Coolify-DB.

**Cross-Project-Pattern-Check:**
- Coolify-Cron-Setup existiert in Onboarding-Repo selbst (V4.2 + V5 + V6 SLC-106). Single-Source-Reuse.
- ENV-Setup-Procedure: existing-Pattern aus V6 Lead-Push-Adapter Service-Key-Setup. Reuse.

## Background

V7-Pending-Signup-Tabelle waechst unkontrolliert wenn niemand expired Eintraege aufraeumt. Pflicht-Operations-Job ist `pending-signup-cleanup-hourly`:
- UPDATE alle `pending_signup` rows mit `expires_at < now()` und `status='pending'` auf `status='expired'`.
- DELETE alle `pending_signup` rows mit `status='expired' AND verified_at IS NULL AND created_at < now() - interval '7 days'` (DSGVO-Datensparsamkeit).

DEC-131 setzte TTL auf 24h, Cleanup-Cron hourly (`0 * * * *`).

Cron-Endpoint-Architektur (analog V4.2 capture-reminders-daily):
- GET `/api/cron/pending-signup-cleanup` mit Header-Check `x-cron-secret === ENV.CRON_SECRET`.
- Bei Auth-Fail: 401 + error_log.
- Bei Erfolg: 200 mit `{ expired_count, deleted_count }`.
- Idempotent: zweiter Aufruf im selben Stundenfenster ist Safe-No-Op (DB-Operationen sind Filter-basiert).

ENV-Setup ist hier konsolidiert weil Pre-Deploy-Pflicht. PUBLIC_SIGNUP_SERVICE_KEY muss in BEIDEN Coolify-Resources (Onboarding + IS) als gleicher Wert gesetzt sein. Generierung: `openssl rand -hex 32` einmal lokal, Wert in zwei Coolify-Resources einfuegen.

IONOS-Postfach `onboarding@strategaize.de` muss als Postfach existieren ODER als Alias konfiguriert sein. Pre-Deploy-Smoke-Send-Test wuerde failen wenn nicht konfiguriert.

## In Scope

### Cleanup-Endpoint

`src/app/api/cron/pending-signup-cleanup/route.ts`:

```typescript
// Pattern aus src/app/api/cron/capture-reminders/route.ts (V4.2)
// (per strategaize-pattern-reuse Rule, DEC-059 Coolify-Cron-Pattern).

import { verifyCronSecret } from '@/lib/auth/cron-secret';

export async function GET(request: Request) {
  const auth = verifyCronSecret(request.headers.get('x-cron-secret'));
  if (!auth.ok) return NextResponse.json({ error: 'invalid_cron_secret' }, { status: 401 });

  const supabase = createServiceRoleClient();

  // Schritt 1: pending → expired
  const { count: expired_count, error: e1 } = await supabase
    .from('pending_signup')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  if (e1) return errorResponse(e1, 'expire_step_failed');

  // Schritt 2: expired + ungenutzt + > 7 Tage → DELETE
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: deleted_count, error: e2 } = await supabase
    .from('pending_signup')
    .delete()
    .eq('status', 'expired')
    .is('verified_at', null)
    .lt('created_at', sevenDaysAgo);

  if (e2) return errorResponse(e2, 'delete_step_failed');

  // Audit-Log
  await supabase.from('error_log').insert({
    category: 'pending_signup_cleanup',
    level: 'info',
    metadata: { expired_count, deleted_count },
  });

  return NextResponse.json({ expired_count, deleted_count }, { status: 200 });
}
```

Vitest:
1. Ohne CRON_SECRET-Header → 401.
2. Mit korrektem CRON_SECRET + Test-Daten mit expired Pending → UPDATE-count > 0, status='expired'.
3. Mit > 7 Tage alten expired Rows → DELETE-count > 0, Rows weg.
4. Idempotent: zweiter Aufruf → counts=0, kein Error.
5. Audit-Log enthaelt expired_count + deleted_count Metadata.

### Coolify-Scheduled-Task Setup

User-Pflicht (analog V4.2/V6 Pattern, dokumentiert via `feedback_cron_job_instructions`-Memory):

Tabelle fuer Coolify-UI:

| Feld | Wert |
|---|---|
| Name | `pending-signup-cleanup-hourly` |
| Container | `app` |
| Cron-Schedule | `0 * * * *` (jede volle Stunde) |
| Command | `node -e "fetch('http://localhost:3000/api/cron/pending-signup-cleanup', { headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then(r => r.text()).then(console.log)"` |
| Timezone | UTC (Coolify-Default, kein Sommerzeit-Issue weil hourly) |

`feedback_coolify_cron_node`-Memory: `which curl` im app-Container pruefen → wenn nicht vorhanden, `node -e fetch()`-Fallback nutzen. V4.2 hat curl, V6 Setup-Verifikation hat curl bestaetigt — also `curl` als Primary-Option, `node`-Fallback dokumentiert.

User-Bestaetigung der Cron-Anlage in Coolify-UI ist Pflicht-Action (siehe MT-3).

### ENV-Variable-Generierung

**PUBLIC_SIGNUP_SERVICE_KEY:**
- Wert direkt generieren (per `feedback_env_value_not_command`-Memory): `openssl rand -hex 32` lokal, Result in Slice-Doku einfuegen. Beispiel-Wert (NICHT Production): `f47ac10b58cc4372a5670e02b2c3d479f47ac10b58cc4372a5670e02b2c3d479`. Production-Wert wird in MT-4 vom User generiert.
- Setzung: BEIDE Coolify-Resources (Onboarding-app + Intelligence-Studio-app), gleicher Wert.

**PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS:**
- Default-Wert: `mailinator.com,guerrillamail.com,tempmail.io,sharklasers.com,mvrht.com,trashmail.com,getairmail.com,maildrop.cc,yopmail.com,dispostable.com`.
- Setzung: nur Onboarding-Coolify-Resource.

**Existing ENVs (Verifikation, kein neuer Setzungs-Schritt):**
- `PUBLIC_APP_URL` (V6, `https://onboarding.strategaizetransition.com`).
- `IONOS_SMTP_HOST` + `IONOS_SMTP_PORT` + `IONOS_SMTP_USER` + `IONOS_SMTP_PASS` (V4.2).
- `CRON_SECRET` (V4.2, bereits gesetzt fuer capture-reminders-daily und walkthrough-cleanup-daily).

### IONOS-Postfach-Check

Pre-Deploy-Smoke-Send-Test:
- User-Pflicht: Pruefen ob `onboarding@strategaize.de` als Postfach existiert ODER Alias auf `noreply@strategaize.de` (DEC-134).
- Wenn weder noch: V7-Deploy blockiert. User legt Postfach im IONOS-Webadmin an ODER richtet Alias ein. Aufwand ~5min.
- Smoke-Send-Test (manueller Schritt vom User): kurze Test-Mail via IONOS-Webmail mit Subject "Strategaize V7 Pre-Deploy Smoke" verschicken. Empfang in `bellaerts@bellaerts.de` (oder Strategaize-Eigentuemer-Adresse) bestaetigt Funktionalitaet.

### Live-Smoke-Plan (Doku-Only, kein Code in SLC-135)

`docs/V7_LIVE_SMOKE_PLAN.md` (NEU) oder Anhang in `reports/RPT-300-v7-pen-test.md` (SLC-134-Report-Erweiterung):

#### Migration-Apply Standard-Procedure (Pflicht VOR jedem Live-Smoke + /deploy V7)

Quelle: RPT-305 F-5 + RPT-306 QA-F2 (OP V7 SLC-134) + Memory `reference_postgrest_schema_reload.md`.

PostgREST auf Coolify-Self-hosted-Supabase cached Schema-Metadata. Nach jeder Migration (CREATE/ALTER TABLE, GRANT, neue Policy, neue Funktion im public-Schema) bleibt der `/rest/v1/<tabelle>`-Endpoint fuer ~5min auf dem alten Cache und gibt HTTP 404 statt 201/200 zurueck — bis Auto-Reload greift. Workaround: expliziter NOTIFY-Trigger sofort nach Migration-Apply.

```bash
# 1. Migration applizieren via base64+psql-Pattern (siehe .claude/rules/sql-migration-hetzner.md)
DB_CONTAINER=$(ssh root@<server> "docker ps --format '{{.Names}}' | grep ^supabase-db")
base64 -w0 sql/migrations/NNN_*.sql | ssh root@<server> "cat > /tmp/mig.b64 && base64 -d /tmp/mig.b64 > /tmp/mig.sql"
ssh root@<server> "docker exec -i $DB_CONTAINER psql -U postgres -d postgres < /tmp/mig.sql"

# 2. PostgREST Schema-Cache invalidieren — PFLICHT
ssh root@<server> "docker exec $DB_CONTAINER psql -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema';\""

# 3. Verifikation: betroffene Tabelle/Function ueber PostgREST in <5s erreichbar
ssh root@<server> "curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'apikey: <SUPABASE_SERVICE_ROLE_KEY>' \
  'http://supabase-kong-...:8000/rest/v1/<tabelle>?limit=1'"
# Erwartet: 200. Bei 404: nochmal NOTIFY senden + 30s warten.
```

Wer das vergisst: Live-Smoke-Schritte 4-7 schlagen mit `relation "<tabelle>" does not exist` oder leerem PostgrestError fehl. Beobachtet bei SLC-134 Pen-Test nach Hotfix-Migration 098a (~5min 404-Fenster bis Reload).

#### 13-Schritt-Live-Smoke fuer `/qa V7` oder `/deploy V7`

0. **Migration-Apply Standard-Procedure** (s.o.) fuer alle pending Migrations. NOTIFY pgrst danach PFLICHT. Verifikation HTTP 200 auf betroffenen REST-Endpoints VOR Schritt 1.
1. Test-Service-Key in BEIDEN Coolify-Resources gesetzt (User-Verifikation).
2. Test-Partner-Slug `qa-steuerberater-demo` (existing V6.3 Test-Partner) verfuegbar in DB.
3. IS-Server-Side-Caller: POST `/api/landing/signup` (IS-Repo) mit Body `{ partner_slug: 'qa-steuerberater-demo', email: 'qa-selfsignup-test@strategaizetransition.com', first_name: 'V7', last_name: 'Smoke', dsgvo_consent_accepted: true, dsgvo_consent_text_version: 'v1-2026-05' }`.
4. IS forwarded an Onboarding `POST /api/public/signup` mit Service-Key.
5. Onboarding antwortet 202, pending_signup-Row in DB, IONOS-Email an `qa-selfsignup-test@strategaizetransition.com`.
6. Mailbox-Check: Verify-Mail eingetroffen mit Subject + Verify-Link.
7. Click auf Verify-Link → Browser auf `/auth/verify-signup?token=...`.
8. Onboarding fuehrt Auto-Provisioning durch: neuer Tenant, neuer auth.users, neue profiles-Row mit first_name='V7'/last_name='Smoke', neue partner_client_mapping mit invitation_source='self_signup'.
9. Redirect zu `/auth/set-password?session=<onetime>`.
10. User setzt Passwort, lands auf `/dashboard`.
11. User kann `/dashboard/diagnose/start` aufrufen + Diagnose starten (FEAT-045 V6.3 live).
12. Optional: Lead-Push-Smoke wenn User opt-in waehlt → Business-System bekommt POST mit UTM=`partner_qa-steuerberater-demo`.
13. Post-Smoke-Cleanup: DELETE-Cascade test-User + Tenant + Mapping + Pending-Signup.

### Quality-Gates am Slice-Ende

- ESLint 0/0 auf Cleanup-Endpoint + Vitest-Files.
- tsc EXIT=0.
- `npm run build` PASS mit Dummy-ENVs.
- `npm run test` gegen Coolify-DB: 5 neue Cron-Endpoint-Tests PASS, 0 Regression.
- ENV-Setup verifiziert (User-Bestaetigung).
- Coolify-Cron-Setup verifiziert (User-Bestaetigung).
- IONOS-Postfach-Check verifiziert (User-Bestaetigung).

## Out of Scope

- **Optionale 4h-Reminder-Mail** (Teil von DEC-131) → V7.1 Optional-Polish. SLC-135 ist mit ~0.5d schon kompakt, Reminder ist kein Funnel-Block.
- **Captcha-Integration** → V7.1-Sprint (DEC-137 Trigger-Schwelle > 50 Pending/24h ohne Verify).
- **Multi-Replica-Setup** mit DB-basiertem Rate-Limit → V8+.
- **Service-Key-Rotation-UI** → V8+ (V7 manuell-koordiniert per DEC-136).
- **Live-Smoke-Ausfuehrung** selbst — gehoert zu `/qa V7` oder `/deploy V7`, nicht zu SLC-135. SLC-135 dokumentiert nur den Plan.
- **NL-Sprach-Variante** der Signup-Mail → V8+.
- **Webhook-Notification an Partner-Admin** → V8+.
- **Self-Signup-Statistik-Dashboard** → V8+.
- **Pre-Production-Compliance-Gate-Items** (BL-104 Anwalts-Review, ISSUE-073 NL-VAT) → User-Pflicht extern, NICHT V7-Code-Block, dokumentiert in V6.2 + V6.4.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | `src/app/api/cron/pending-signup-cleanup/route.ts` existiert mit GET-Handler. CRON_SECRET-Header-Check via existing `verifyCronSecret`-Helper. |
| AC-2 | Schritt 1 (UPDATE expired): Filter `status='pending' AND expires_at < now()`, set `status='expired'`. Returnt `expired_count`. |
| AC-3 | Schritt 2 (DELETE > 7 Tage): Filter `status='expired' AND verified_at IS NULL AND created_at < now() - interval '7 days'`. Returnt `deleted_count`. |
| AC-4 | Audit-Log INSERT `error_log` mit `category='pending_signup_cleanup'`, `level='info'`, `metadata={ expired_count, deleted_count }`. |
| AC-5 | Vitest 5 neue Cases PASS gegen Coolify-DB im node:20-Container: Auth-Reject, Expire-Update, Delete-> 7-Days, Idempotent-Second-Call, Audit-Log-Check. |
| AC-6 | Coolify-Scheduled-Task `pending-signup-cleanup-hourly` Setup-Tabelle dokumentiert (Name, Container, Cron, Command, Timezone) — User-Pflicht-Bestaetigung in MT-3. |
| AC-7 | `PUBLIC_SIGNUP_SERVICE_KEY` 32-byte hex Random generiert + in BEIDEN Coolify-Resources gesetzt (Onboarding + IS). User-Bestaetigung in MT-4. |
| AC-8 | `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` mit Default-Liste 10 Wegwerf-Domains in Onboarding-Coolify-Resource gesetzt. User-Bestaetigung in MT-4. |
| AC-9 | IONOS-Postfach `onboarding@strategaize.de` existiert als Postfach oder Alias. User-Bestaetigung in MT-5. Pre-Deploy-Smoke-Send-Test optional. |
| AC-10 | `docs/V7_LIVE_SMOKE_PLAN.md` existiert mit 13-Schritt-Plan fuer /qa V7 oder /deploy V7. |
| AC-10a | `docs/V7_LIVE_SMOKE_PLAN.md` enthaelt die **Migration-Apply Standard-Procedure** mit `NOTIFY pgrst, 'reload schema'` als Pflicht-Step nach jedem Migration-Apply + HTTP-200-Verifikation auf betroffene REST-Endpoints (RPT-306 QA-F2 + RPT-305 F-5). Cross-Link auf `reference_postgrest_schema_reload.md` + `.claude/rules/sql-migration-hetzner.md`. |
| AC-11 | Quality-Gates: ESLint 0/0, tsc EXIT=0, Build PASS, Vitest 0 Regression. |

## Pre-Conditions

- SLC-131 + SLC-132 + SLC-133 + SLC-134 LIVE.
- Migration 098 LIVE (pending_signup-Tabelle existiert).
- `CRON_SECRET` ENV-Variable existing in Coolify-app-Resource (V4.2 bereits gesetzt fuer capture-reminders-daily + walkthrough-cleanup-daily).
- IONOS-SMTP-Adapter funktional (V4.2 verifiziert).
- Coolify-UI-Access vom User (Cron-Setup ist UI-Action).
- IONOS-Webadmin-Access vom User (Postfach-Check ist Webadmin-Action).

## Stop-Gates

- **Kein /qa V7 Gesamt-Pass** vor SLC-135 LIVE (Cleanup-Cron-Setup + ENV-Setup + Postfach-Check).
- **Kein /deploy V7** vor Pre-Deploy-Smoke-Send-Test (User-Pflicht IONOS).
- **Keine V7-Aktivierung im IS-Repo** bis SLC-135 LIVE komplett + Live-Smoke-Plan vorhanden.

## Micro-Tasks

### MT-1: Cleanup-Endpoint Route + Vitest

- **Goal:** GET-Handler mit Auth + Expire + Delete + Audit-Log, 5 Vitest.
- **Files:**
  - `src/app/api/cron/pending-signup-cleanup/route.ts` (NEU)
  - `src/app/api/cron/pending-signup-cleanup/__tests__/route.test.ts` (NEU)
- **Expected behavior:**
  - Header-Kommentar mit Pattern-Reuse-Hinweis auf `src/app/api/cron/capture-reminders/route.ts` (V4.2).
  - 5 Vitest gegen Coolify-DB: Auth-Reject (401), Expire-Update (count > 0), Delete-> 7-days (count > 0), Idempotent (second call count = 0), Audit-Log-Probe.
  - SAVEPOINT-Pattern bei DB-Test-Setup (Insert Pending mit `expires_at` in Vergangenheit).
  - vi.useFakeTimers() fuer Time-Travel im DELETE-Test (Insert Pending mit `created_at` 8 Tage in Vergangenheit).
- **Verification:**
  - Vitest 5/5 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** SLC-132 MT-1 (pending_signup-Schema live).

### MT-2: V7_LIVE_SMOKE_PLAN.md Dokumentation

- **Goal:** 13-Schritt-Live-Smoke-Plan + Migration-Apply-Standard-Procedure + Cleanup-Anleitung dokumentiert.
- **Files:**
  - `docs/V7_LIVE_SMOKE_PLAN.md` (NEU)
- **Expected behavior:**
  - Markdown-Sections: Pre-Conditions / Migration-Apply Standard-Procedure / 13-Schritt-Plan / Post-Smoke-Cleanup / Troubleshooting.
  - **Migration-Apply Standard-Procedure (Pflicht, RPT-306 QA-F2 + RPT-305 F-5):** dokumentiert base64+psql-Migration-Apply UND nachfolgendes `NOTIFY pgrst, 'reload schema'` UND HTTP-200-Verifikation auf betroffene REST-Endpoints. Cross-Link auf Memory `reference_postgrest_schema_reload.md` + `.claude/rules/sql-migration-hetzner.md`. Wer das vergisst: 5min HTTP-404-Fenster nach jedem Migration-Apply.
  - Step 0 im 13-Schritt-Plan ist die Migration-Apply Standard-Procedure (mit NOTIFY pgrst + HTTP-200-Check vor Schritt 1).
  - Cross-Link auf existing Test-Partner `qa-steuerberater-demo` aus V6.3.
  - Cross-Link auf existing Smoke-Test-User-Email (`qa-selfsignup-test@strategaizetransition.com` als Konvention).
  - Cleanup-SQL-Snippet (DELETE-Cascade fuer Test-User + Mapping + Pending).
- **Verification:**
  - `ls docs/V7_LIVE_SMOKE_PLAN.md` → File existiert.
  - Markdown-Preview rendert sauber.
  - `grep -c "NOTIFY pgrst" docs/V7_LIVE_SMOKE_PLAN.md` → mindestens 1 Treffer (Migration-Apply Standard-Procedure dokumentiert).
- **Dependencies:** keine (parallelisierbar zu MT-1).

### MT-3: Coolify-Scheduled-Task Setup (User-Pflicht)

- **Goal:** User legt `pending-signup-cleanup-hourly` Cron in Coolify-UI an. Doku in V7_LIVE_SMOKE_PLAN.md + STATE.md.
- **Files:**
  - `docs/V7_LIVE_SMOKE_PLAN.md` (modify — Cron-Setup-Sektion erweitern mit User-Bestaetigung)
  - `docs/STATE.md` (Notes-Sektion erweitern um Cron-Setup-Status)
- **Expected behavior:**
  - Tabelle (Name/Container/Cron/Command/Timezone) im User-vorgelegten Format.
  - User legt Cron in Coolify-UI an + bestaetigt durch Verifikation `docker exec <app-container> echo $CRON_SECRET` (Hash-Preview, kein Klartext-Logging).
  - Erster manueller Test-Run via `docker exec <app-container> curl -H "x-cron-secret: <secret>" http://localhost:3000/api/cron/pending-signup-cleanup` → 200 mit counts.
  - Erster automatischer Cron-Run wird nach naechster voller Stunde getriggert.
- **Verification:**
  - User-Bestaetigung via Chat oder Screenshot.
  - error_log enthaelt `category='pending_signup_cleanup'`-Eintrag nach erstem Run.
- **Dependencies:** MT-1 (Endpoint live in app).

### MT-4: ENV-Variable-Generierung (User-Pflicht)

- **Goal:** PUBLIC_SIGNUP_SERVICE_KEY + PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS in BEIDEN Coolify-Resources gesetzt.
- **Files:**
  - `docs/V7_LIVE_SMOKE_PLAN.md` (modify — ENV-Setup-Sektion mit User-Bestaetigung)
  - `.env.example` (modify — neue ENVs als Platzhalter mit Doku-Kommentar)
- **Expected behavior:**
  - Service-Key Wert direkt geliefert per `feedback_env_value_not_command` Memory: 32-byte hex Random vom Agent generiert (z.B. `f47ac10b58cc4372a5670e02b2c3d479f47ac10b58cc4372a5670e02b2c3d479` als BEISPIEL — Production-Wert wird vom User waehrend MT-4 gesetzt mit eigenem `openssl rand -hex 32`).
  - User setzt in Coolify-Onboarding-Resource UND Coolify-IS-Resource.
  - `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` mit Default-Liste 10 Wegwerf-Domains.
  - `.env.example` updated.
- **Verification:**
  - User-Bestaetigung via Chat oder Coolify-UI-Screenshot (mit Service-Key-Praefix-Maskierung).
  - `docker exec <app-container> printenv PUBLIC_SIGNUP_SERVICE_KEY | wc -c` → 65 (64 hex + newline).
- **Dependencies:** MT-1 (Code nutzt die ENVs).

### MT-5: IONOS-Postfach-Check (User-Pflicht)

- **Goal:** `onboarding@strategaize.de` Postfach oder Alias existiert + Smoke-Send-Test gruen.
- **Files:**
  - `docs/V7_LIVE_SMOKE_PLAN.md` (modify — Postfach-Check-Sektion mit User-Bestaetigung)
- **Expected behavior:**
  - User pruefte IONOS-Webadmin: Postfach `onboarding@strategaize.de` existiert ODER Alias auf `noreply@strategaize.de` ist konfiguriert.
  - User schickt Test-Mail via IONOS-Webmail mit Subject "Strategaize V7 Pre-Deploy Smoke" → kommt im Empfaenger-Postfach an.
  - Optional: Reply-To-Test (manuell antwort-mail von onboarding@... mit reply-to-Header an `bellaerts@bellaerts.de`).
- **Verification:**
  - User-Bestaetigung via Chat: "Postfach existiert + Test-Mail angekommen".
- **Dependencies:** keine (parallelisierbar).

### MT-6: Quality-Gates + Cockpit-Records

- **Goal:** Slice-End-Gates + Records updaten.
- **Files:**
  - `slices/INDEX.md` (modify — SLC-135 status → done; alle 5 V7-Slices done)
  - `planning/backlog.json` (modify — BL-110 → done, BL-098 umbrella → done weil alle 5 Sub-Slices done)
  - `docs/STATE.md` (modify — High-Level State `slice-planning` → `implementing`/`done` je nach /qa-V7-Stand; Current Focus auf V7-Code-Side komplett, Next Step = /qa V7 Gesamt-Pass)
  - `planning/roadmap.json` (modify — V7 bleibt `active` bis /deploy)
- **Expected behavior:**
  - ESLint 0/0 / tsc 0 / Build PASS / Vitest 0 Regression.
  - Alle Records aktualisiert.
- **Verification:**
  - Alle Gates PASS in Output.
  - Cockpit-Refresh zeigt V7-Code-Side komplett.
- **Dependencies:** MT-1..MT-5 alle done.

## Execution Order

Phase 1 (sequentiell): **MT-1** (Endpoint + Tests).

Phase 2 (parallelisierbar): **MT-2** (Doku) + **MT-5** (Postfach-Check, User-Pflicht).

Phase 3 (sequentiell): **MT-3** (Cron-Setup, braucht MT-1 live im app-Container) + **MT-4** (ENV-Setup, braucht MT-1 fuer Test-Sinn).

Phase 4 (final): **MT-6** (Gates + Records, braucht alle vorherigen).

Empfohlene Atomic-Commit-Reihenfolge: **MT-1 → MT-2 → MT-4 → MT-3 → MT-5 → MT-6**.

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 Cleanup-Endpoint + Vitest | ~75min |
| MT-2 V7_LIVE_SMOKE_PLAN.md | ~45min |
| MT-3 Coolify-Cron-Setup (User-Pflicht inkl. Doku) | ~30min (5min User-Action + 25min Doku) |
| MT-4 ENV-Setup (User-Pflicht inkl. Doku) | ~30min (10min User-Action + 20min Doku + .env.example) |
| MT-5 IONOS-Postfach-Check (User-Pflicht) | ~15min (10min User-Action + 5min Doku) |
| MT-6 Records + Gates | ~30min |
| **Total** | **~3.5h Agent-Time + ~30min User-Action-Time = ~0.5d Solo-Founder gesamt** |

## Risks

- **R-1 (Low):** Cleanup-Cron-DELETE schlaegt Pending-Rows weg, die noch in-flight sind (Race-Condition mit Verify-Klick). Mitigation: DELETE-Filter ist `created_at < now() - interval '7 days'` — Verify-Klick passiert immer innerhalb 24h, Cleanup-DELETE ist 7 Tage spaeter. Kein Race.
- **R-2 (Low):** `which curl`-Check im app-Container findet curl nicht (V4.2-Annahme stimmt nicht mehr). Mitigation: Pre-Setup-Check via `docker exec <app-container> which curl`. Bei not-found: Auf `node -e fetch()`-Fallback umstellen (Pattern aus `feedback_coolify_cron_node`-Memory).
- **R-3 (Medium):** PUBLIC_SIGNUP_SERVICE_KEY wird in BEIDEN Resources gesetzt, aber User vergessen die IS-Resource (Cross-System-Dep). Mitigation: MT-4 erfordert explizite User-Bestaetigung fuer BEIDE Resources. Cross-Check-Verifikation in Live-Smoke-Plan Schritt 1.
- **R-4 (Medium):** IONOS-Postfach `onboarding@strategaize.de` existiert nicht und User nimmt SLC-135 als done an. Mitigation: MT-5 erfordert explizite User-Bestaetigung "Test-Mail angekommen". Pre-Deploy-Stop-Gate bei /deploy V7.
- **R-5 (Low):** Cleanup-Cron-Setup blockiert weil Coolify-UI-Bug oder User-Fehler. Mitigation: Manueller Test-Run via `docker exec` im MT-3-Verification verifiziert Endpoint-Funktionalitaet unabhaengig vom Cron-Setup.
- **R-6 (Very Low):** error_log fuer Cleanup-Cron-Runs sammelt sich an + bloat. Mitigation: V7-Default ist info-Level, kein error/warn. error_log hat seinen eigenen TTL-Cleanup (existing V4.2-Pattern). Vernachlaessigbar.

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-135-ttl-cleanup-cron-final-hardening`.
- Push nach MT-6 PASS, dann Merge nach `main` am Slice-Ende.
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- 0 Migrations. Reuse pending_signup-Schema aus SLC-132.
- 1 neuer Endpoint (`/api/cron/pending-signup-cleanup`), 0 neue npm-Packages.
- Pre-Condition fuer `/qa V7` Gesamt-Pass: alle V7-Code + Operations + Doku komplett.
- Post-Slice-Pflicht: `/qa V7` (Gesamt-QA ueber alle 5 V7-Slices) → `/final-check V7` → `/go-live V7` → `/deploy V7` → `/post-launch V7`.

## References

- Memory `project_op_v7_architecture_done.md` — V7-Stand
- `docs/ARCHITECTURE.md` V7-Sektion (Line 6352-6358 Cron-Schedule)
- `features/FEAT-053-self-signup-email-verify-auto-provisioning.md` — Cleanup-Cron-Anteil
- `reports/RPT-297.md` — Architecture-Completion-Report
- `src/app/api/cron/capture-reminders/route.ts` — V4.2 Reuse-Vorlage
- DEC-059 Coolify-Cron-Pattern, DEC-131 Pending-TTL 24h + Cleanup-Cron hourly, DEC-134 Email-Sender, DEC-136 Service-Key-Rotation
- `feedback_coolify_cron_node` Memory — curl-Check + node-Fallback
- `feedback_cron_job_instructions` Memory — Tabelle + User-Bestaetigung
- `feedback_env_value_not_command` Memory — ENV-Wert direkt
- `.claude/rules/coolify-test-setup.md` — Vitest gegen Coolify-DB
