# SLC-163 — V8.1 CTA-Mechanik + Dual-Email-Trigger + Master-Merge (FEAT-068)

**Version:** V8.1
**Feature:** FEAT-068 (Strategaize-Freigabe-CTA + Dual-Email-Trigger)
**Backlog:** BL-142
**Status:** planned
**Created:** 2026-05-30
**Priority:** High
**Estimate:** ~4-6h Code-Side + Live-Smoke + Master-Merge + Coolify-Redeploy + Post-Live-Smoke
**Worktree Branch:** `v8-1-lead-conversion` (Cumulative-Single-Branch, gestartet in SLC-161 MT-0)

## Slice Goal

Liefert die **CTA-Click-Mechanik** + **Dual-Email-Trigger** + **Master-Merge** der V8.1-Sequenz. Letzte Slice der V8.1-Familie.

1. **HMAC-SHA256-Magic-Link-Token** (`generateCtaMagicLinkToken` + `verifyCtaMagicLinkToken` Pure-Functions, DEC-173 stateless, DEC-172 90 Tage Expiry, kein Single-Use)
2. **HTTP-GET `/strategaize-anfrage` Endpoint** mit Token-Verify + Flag-Set + Dual-Email + Redirect zu Bestaetigungs-Page
3. **Server-Action `triggerStrategaizeFreigabe`** fuer Web-Bericht-CTA (Session-basiert, kein Token)
4. **Dual-Email-Versand**: Lead-Email an `bd@strategaizetransition.de` (JSON+HTML per DEC-168) + StB-Partner-Notification an `partner_organization.contact_email` (neutral-informativ per DEC-169, silent-skip bei leerem contact_email)
5. **Bestaetigungs-Page** `/strategaize-anfrage/bestaetigung` (statische Page, Strategaize-Wir-Voice)
6. **Idempotenz** ueber `capture_session.released_for_strategaize_review`-Flag (DEC-163 aus V8.0 vorhanden)
7. **Audit-Trail** via `error_log` mit categories `cta_strategaize_freigabe`, `cta_invalid_token`, `cta_idempotent_skip`, `stb_notification_skipped_no_email`
8. **PDF-Magic-Link-Token-Integration** in SLC-162 OutroPage (Placeholder-URL durch echte Token-URL ersetzen)
9. **BS-Integration-Doku** `docs/INTEGRATION_BUSINESS_SYSTEM.md` mit JSON-Schema des Lead-Email-Bodys
10. **Gesamt-V8.1-/qa + Master-Merge + Coolify-Redeploy + Live-Smoke**

## In Scope

### Token-Generation + Verification (Pure-Functions)
- **`src/lib/cta/token.ts`** (NEU) — `generateCtaMagicLinkToken(captureSession)` + `verifyCtaMagicLinkToken(token)` Pure-Functions
- **HMAC-SHA256-Signatur** ueber Payload `{ capture_session_id, partner_organization_id, mandant_email, issued_at, expiry }` mit ENV `STRATEGAIZE_CTA_TOKEN_SECRET` (Pflicht-ENV)
- **Expiry 90 Tage Default** via ENV `STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS=90` (DEC-172)
- **`src/lib/cta/__tests__/token.test.ts`** (NEU) — Vitest fuer Generate-Verify-Roundtrip + Tampered-Token-Reject + Expired-Token-Reject

### HTTP-GET Endpoint (Magic-Link-Eintritt)
- **`src/app/strategaize-anfrage/route.ts`** (NEU) — GET-Handler
  - `verifyCtaMagicLinkToken(token)` Pure-Call
  - Invalid/Expired → Error-Page mit StB-Kontakt-Hinweis + Audit-Log `cta_invalid_token`
  - Valid: Idempotency-Check → Flag-Set → Dual-Email-Versand → Redirect zu `/strategaize-anfrage/bestaetigung`
- **`src/app/strategaize-anfrage/bestaetigung/page.tsx`** (NEU) — statische Bestaetigungs-Page
- **`src/app/strategaize-anfrage/error/page.tsx`** (NEU) — Error-Page bei Invalid/Expired Token

### Server-Action (Web-Bericht-CTA)
- **`src/app/dashboard/diagnose/[id]/actions.ts`** (UPDATE — additiv) — `triggerStrategaizeFreigabe(captureSessionId)` Server-Action
  - Auth-Check: Session-User = Mandant der capture_session ODER strategaize_admin
  - Idempotency + Flag-Set + Dual-Email-Versand + Redirect zu Bestaetigungs-Page

### Dual-Email-Versand
- **`src/lib/email/v8-1/bd-lead.ts`** (NEU) — Email-Template fuer Lead-Email an BD-Inbox
  - Subject `[OP-Lead] {firma} — Folgegespraech angefragt`
  - HTML-Body mit semantischen Sections + eingebettetem `<!-- STRATEGAIZE_LEAD_V1: {json} -->` JSON-Block (DEC-168)
  - Plain-Text-Variant
  - JSON-Schema: capture_session_id, mandant_email, mandant_name, mandant_firma, partner_organization_id, partner_organization_name, sui_score, drei_hebel_modul_namen, diagnose_link_admin, timestamp_iso, v8_version
- **`src/lib/email/v8-1/stb-notification.ts`** (NEU) — Email-Template fuer StB-Partner-Notification
  - Subject `Ihr Mandant {firma} hat Kontakt zu Strategaize aufgenommen`
  - HTML + Plain-Body neutral-informativ (DEC-169), 4 Saetze max
  - Founder-Freigabe Pre-MT-4 User-Pflicht
- **`src/lib/email/v8-1/__tests__/bd-lead.test.ts`** (NEU) — Snapshot-Test fuer JSON-Block-Format + Body-Struktur
- **`src/lib/email/v8-1/__tests__/stb-notification.test.ts`** (NEU) — Snapshot-Test + Tonality-Check (Blacklist Glueckwunsch + Pricing)
- **`src/lib/email/v8-1/send-strategaize-anfrage-emails.ts`** (NEU) — Orchestrator-Funktion `sendStrategaizeAnfrageEmails({captureSession, partner})` → ruft beide Send-Funktionen parallel via `Promise.allSettled`, returns Dual-Result `{bd_sent, stb_sent, stb_skip_reason}`

### Audit-Trail
- **`src/lib/cta/audit.ts`** (NEU) — Audit-Wrappers `recordCtaTrigger(client, params)` + `recordCtaInvalidToken(client, params)` + `recordCtaIdempotentSkip(client, params)` + `recordStbNotificationSkippedNoEmail(client, params)` → INSERT `error_log` mit klar definierten categories

### PDF-Magic-Link-Token-Integration in SLC-162 OutroPage
- **`src/lib/pdf/mandanten-report-v2/pages/outro.tsx`** (UPDATE aus SLC-162) — Placeholder-URL `#cta-magic-link-token-replaced-in-slc163` durch echte `{baseUrl}/strategaize-anfrage?token={hmacToken}` ersetzen
- **`renderMandantenReportV2Pdf` Pipeline** (UPDATE) — `generateCtaMagicLinkToken(captureSession)` aufrufen, Token in OutroPage einbauen

### V8-Web-Bericht CTA-Button-Wiring
- **`src/app/dashboard/diagnose/[id]/V8OutroSection.tsx`** (UPDATE aus SLC-162) — CTA-Button auf Server-Action `triggerStrategaizeFreigabe(captureSessionId)` verdrahten

### BS-Integration-Doku
- **`docs/INTEGRATION_BUSINESS_SYSTEM.md`** (NEU) — JSON-Schema-Doku fuer Lead-Email-Format an BD-Inbox + Beispiel-Body + Versionierung `STRATEGAIZE_LEAD_V1`

### ENV-Konfiguration
- **`.env.deploy.example`** (UPDATE) — neue ENV-Variablen dokumentiert:
  - `STRATEGAIZE_BD_EMAIL=bd@strategaizetransition.de` (Default)
  - `STRATEGAIZE_CTA_TOKEN_SECRET=` (Pflicht, 64 Zeichen, Pre-MT-1 User-Pflicht)
  - `STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS=90` (Default)
  - `BEDROCK_V8_1_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0` (Default, in SLC-161 dokumentiert, hier nur Cross-Reference)

### Slice-Schluss Gesamt-V8.1-/qa + Master-Merge
- Gesamt-V8.1-/qa als Pflicht-Gate vor Master-Merge (alle 3 Slices SLC-161/162/163 End-to-End geprueft)
- Master-Merge `v8-1-lead-conversion` → `main` (Fast-Forward erwartet)
- Coolify-Redeploy via Coolify-API analog V8.0-Pattern
- Post-Live-Smoke (Container-Health + error_log + ENV-Verification + Live-CTA-Click-Test)
- Records-Update: V8.1-Slices/Features/Backlog/Roadmap auf `done`/`deployed`/`released`

## Out of Scope

- **LLM-Augmentation-Backend** (FEAT-069) — SLC-161
- **Outro-Renderer + V8.0-CtaPage-Replacement** (FEAT-067) — SLC-162
- **Direkte BS-API-Integration** (HTTP-POST an BS-Lead-Endpoint) — V8.2+
- **Single-Use-Token-Pfad** — V8.2+ (DEC-172 explizit nicht in V8.1)
- **CAPTCHA / Anti-Spam** auf Magic-Link-Endpoint — V8.2+
- **Multi-Lead-Routing per Partner-Segment** — V8.2+
- **StB-Partner-Notification-Customization pro Partner-Org** — V8.2+
- **Re-Send-Button** — V8.2+
- **Calendar-Integration** — V8.2+
- **Mehrsprachige Email-Templates** — V8.2+
- **A/B-Testing der CTA-Wordings** — V8.2+

## Pre-Conditions

- ✓ SLC-161 done (LLM-Augmentation Pure-Function verfuegbar)
- ✓ SLC-162 done (OutroPage mit CTA-Placeholder-Slot verfuegbar)
- ✓ V8.0 RELEASED, `capture_session.released_for_strategaize_review` Flag existiert (DEC-163)
- ✓ `partner_organization.contact_email` existiert (V6 Migration 090)
- ✓ IONOS-SMTP-Adapter existiert (V4.2 + V7.2-tested)
- ✓ V7 Self-Signup-Verify HMAC-Token-Pattern existiert (Code-Reuse-Quelle)
- ✓ DEC-168 JSON+HTML-Format entschieden
- ✓ DEC-169 neutral-informativ + silent-skip entschieden
- ✓ DEC-172 90 Tage Expiry, kein Single-Use entschieden
- ✓ DEC-173 stateless HMAC entschieden
- ⏳ **Pre-MT-1 User-Pflicht**: `STRATEGAIZE_CTA_TOKEN_SECRET` Produktions-Generation (64 Zeichen, in Coolify-Resource-ENV setzen)
- ⏳ **Pre-MT-4 User-Pflicht**: StB-Notification-Wording-Freigabe (Founder)

## Micro-Tasks

### MT-1: ENV-Setup + Secret-Generation
- **Goal**: Neue ENV-Variablen in `.env.deploy.example` dokumentieren. User generiert `STRATEGAIZE_CTA_TOKEN_SECRET` und setzt in Coolify-Resource.
- **Files**:
  - `.env.deploy.example` (UPDATE — 3 neue Vars)
- **Expected behavior**: ENV-Datei enthaelt neue Vars mit Beispiel-Werten oder Generation-Anleitung. User-Action: `openssl rand -hex 64` → in Coolify Resource-ENV setzen.
- **Verification**: Coolify-Resource-ENV-Auflistung via Coolify-API zeigt neue Vars. User-Confirmation.
- **Dependencies**: SLC-162 done

### MT-2: HMAC-Token Pure-Functions
- **Goal**: `generateCtaMagicLinkToken` + `verifyCtaMagicLinkToken` mit HMAC-SHA256 + Expiry-Logic.
- **Files**:
  - `src/lib/cta/token.ts` (NEU)
  - `src/lib/cta/__tests__/token.test.ts` (NEU)
- **Expected behavior**:
  - `generateCtaMagicLinkToken({capture_session_id, partner_organization_id, mandant_email})` → signierter URL-safe Base64-String
  - `verifyCtaMagicLinkToken(token)` → `{valid: true, payload}` oder `{valid: false, reason: 'invalid_signature' | 'expired'}`
  - HMAC-SHA256 via `crypto.createHmac`, kein externes Dependencies
  - Payload-Schema dokumentiert in Code-Comment
- **Verification**: Vitest:
  - Generate-Verify-Roundtrip → valid: true
  - Tampered-Token (1 Char geaendert) → valid: false, reason: 'invalid_signature'
  - Expired-Token (issued_at - 100 Tage) → valid: false, reason: 'expired'
  - Empty STRATEGAIZE_CTA_TOKEN_SECRET → Error (Pflicht-ENV)
- **Dependencies**: MT-1

### MT-3: BD-Lead-Email-Template
- **Goal**: Lead-Email an `bd@strategaizetransition.de` mit semantic HTML + JSON-Block (DEC-168).
- **Files**:
  - `src/lib/email/v8-1/bd-lead.ts` (NEU)
  - `src/lib/email/v8-1/__tests__/bd-lead.test.ts` (NEU)
- **Expected behavior**:
  - `buildBdLeadEmail({captureSession, partner})` → `{subject, htmlBody, textBody}`
  - Subject `[OP-Lead] {firma} — Folgegespraech angefragt`
  - HTML mit `<h2>` Sections (Mandant + Partner + SUI + Diagnose-Link + Timestamp) + eingebettetem `<!-- STRATEGAIZE_LEAD_V1: {json} -->` Block
  - JSON-Schema exakt wie ARCHITECTURE.md V8.1-Section beschrieben
  - Plain-Text-Variant (gestrippt via `remark` + `strip-markdown`)
- **Verification**: Vitest Snapshot-Test fuer HTML-Output + JSON-Block-Parsing + Plain-Text. JSON-Parse-Round-Trip prueft Schema-Compliance.
- **Dependencies**: MT-2

### MT-4: StB-Notification-Email-Template
- **Goal**: Neutral-informative Notification an `partner.contact_email` (DEC-169, Pre-MT-4 User-Pflicht: Founder-Freigabe).
- **Files**:
  - `src/lib/email/v8-1/stb-notification.ts` (NEU)
  - `src/lib/email/v8-1/__tests__/stb-notification.test.ts` (NEU)
- **Expected behavior**:
  - `buildStbNotificationEmail({captureSession, partner})` → `{subject, htmlBody, textBody}`
  - Subject `Ihr Mandant {firma} hat Kontakt zu Strategaize aufgenommen`
  - Body 4-5 Saetze neutral-informativ aus Founder-Freigabe-Text
  - Strategaize-Default-Footer (Datenschutz + Impressum)
- **Verification**: Snapshot-Test + Tonality-Check via `scripts/tonalitaet-audit-v8.mjs --scope=stb-notification` (Blacklist `Glueckwunsch|gratuliere|super|Euro|EUR|Kosten|Preis`). Founder-Freigabe-Datum als Code-Kommentar.
- **Dependencies**: MT-2 + **Pre-MT-4 User-Pflicht (StB-Notification-Wording-Freigabe)**

### MT-5: Dual-Email-Orchestrator
- **Goal**: `sendStrategaizeAnfrageEmails` ruft beide Templates parallel + IONOS-SMTP + silent-skip-Logic.
- **Files**:
  - `src/lib/email/v8-1/send-strategaize-anfrage-emails.ts` (NEU)
  - `src/lib/email/v8-1/__tests__/send-strategaize-anfrage-emails.test.ts` (NEU)
- **Expected behavior**:
  - Input: `{captureSession, partner}`
  - Output: `{bd_sent: boolean, stb_sent: boolean, stb_skip_reason?: 'no_email' | 'smtp_fail'}`
  - Parallel `Promise.allSettled([sendBd, sendStb])` — Fail in einem blockiert nicht den anderen
  - Silent-skip wenn `partner.contact_email` leer → `stb_skip_reason: 'no_email'`, Audit-Log via `recordStbNotificationSkippedNoEmail`
- **Verification**: Vitest mit Mock-SMTP:
  - Beide Sends success → {bd_sent: true, stb_sent: true}
  - StB empty contact_email → {bd_sent: true, stb_sent: false, stb_skip_reason: 'no_email'} + error_log Entry
  - StB SMTP-Fail → {bd_sent: true, stb_sent: false, stb_skip_reason: 'smtp_fail'} + error_log Entry
  - BD SMTP-Fail blockiert nicht StB-Send
- **Dependencies**: MT-3 + MT-4

### MT-6: Audit-Wrappers
- **Goal**: `error_log`-Wrappers fuer V8.1-CTA-Events.
- **Files**:
  - `src/lib/cta/audit.ts` (NEU)
  - `src/lib/cta/__tests__/audit.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - `recordCtaTrigger(client, {capture_session_id, source: 'pdf_magic_link' | 'web_action', bd_sent, stb_sent, stb_skip_reason})`
  - `recordCtaInvalidToken(client, {token_excerpt, reason})`
  - `recordCtaIdempotentSkip(client, {capture_session_id, source})`
  - `recordStbNotificationSkippedNoEmail(client, {capture_session_id, partner_organization_id})`
- **Verification**: Vitest gegen Coolify-DB: Inserts succeed + categories matched.
- **Dependencies**: MT-5

### MT-7: GET /strategaize-anfrage Endpoint
- **Goal**: Route-Handler mit Token-Verify + Idempotency + Flag-Set + Dual-Email + Redirect.
- **Files**:
  - `src/app/strategaize-anfrage/route.ts` (NEU)
  - `src/app/strategaize-anfrage/bestaetigung/page.tsx` (NEU)
  - `src/app/strategaize-anfrage/error/page.tsx` (NEU)
- **Expected behavior**:
  - GET `?token=<hmac>` → verify → invalid/expired: redirect zu /strategaize-anfrage/error + audit-log
  - Valid: read capture_session → released flag already true: redirect zu /strategaize-anfrage/bestaetigung + audit-log `cta_idempotent_skip`
  - Valid + flag false: UPDATE flag = true → sendStrategaizeAnfrageEmails() → audit-log `cta_strategaize_freigabe` → redirect zu /strategaize-anfrage/bestaetigung
- **Verification**: Smoke-Test via curl gegen lokalen Dev-Server + Vitest gegen Coolify-DB (Token-generate → Endpoint-Call → DB-Flag-Status-Check + error_log-Entries-Check).
- **Dependencies**: MT-6

### MT-8: PDF-Magic-Link-Token-Integration in OutroPage
- **Goal**: SLC-162-Placeholder-URL durch echte HMAC-Token-URL ersetzen.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` (UPDATE)
  - `src/lib/pdf/mandanten-report-v2/index.ts` ODER Renderer-Entry (UPDATE)
- **Expected behavior**: Renderer-Pipeline ruft `generateCtaMagicLinkToken(captureSession)` und uebergibt Token an OutroPage. OutroPage rendert `https://{baseUrl}/strategaize-anfrage?token={token}` als CTA-URL. Placeholder `#cta-magic-link-token-replaced-in-slc163` entfernt.
- **Verification**: Smoke-PDF generieren → CTA-URL im PDF extrahieren → URL gegen GET-Endpoint senden → 302-Redirect zu bestaetigung-Page. End-to-End-Test.
- **Dependencies**: MT-7

### MT-9: Web-Server-Action triggerStrategaizeFreigabe
- **Goal**: Server-Action fuer V8-Web-Bericht-CTA + V8OutroSection-Wiring.
- **Files**:
  - `src/app/dashboard/diagnose/[id]/actions.ts` (UPDATE — additiv)
  - `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx` (UPDATE — Button-Wiring)
- **Expected behavior**:
  - Server-Action `triggerStrategaizeFreigabe(captureSessionId)`: Auth-Check (Mandant ODER strategaize_admin) → Idempotency → Flag-Set → Dual-Email → redirect("/strategaize-anfrage/bestaetigung")
  - V8OutroSection CTA-Button hat `formAction={triggerStrategaizeFreigabe}` mit captureSessionId in hidden-Input
- **Verification**: Browser-Smoke gegen Coolify-Deploy: Login als Test-Mandant → /dashboard/diagnose/[id] → CTA-Button-Click → Bestaetigungs-Page → Inbox-Check BD + StB.
- **Dependencies**: MT-8

### MT-10: BS-Integration-Doku + Gesamt-V8.1-/qa + Master-Merge + Coolify-Redeploy + Live-Smoke
- **Goal**: Slice-Schluss-Block. Doku, QA, Merge, Deploy, Live-Smoke.
- **Files**:
  - `docs/INTEGRATION_BUSINESS_SYSTEM.md` (NEU)
  - `slices/INDEX.md` (UPDATE — alle 3 V8.1-Slices `done`)
  - `features/INDEX.md` (UPDATE — FEAT-067/068/069 `done` oder `deployed` nach Deploy)
  - `planning/backlog.json` (UPDATE — BL-134/142/143 `done`)
  - `planning/roadmap.json` (UPDATE — v8-1 `active` → `released`)
  - `docs/RELEASES.md` (NEW Entry REL-027 V8.1)
  - `docs/STATE.md` (UPDATE — Last Stable Version → V8.1)
- **Expected behavior**:
  - BS-Integration-Doku enthaelt JSON-Schema + Beispiel-Body + STRATEGAIZE_LEAD_V1-Versionierung
  - Gesamt-/qa: SC-V8.1-1..10 alle PASS code-side
  - Master-Merge `v8-1-lead-conversion` → `main` (Fast-Forward erwartet)
  - Coolify-Redeploy via Coolify-API (Token + is_api_enabled, analog V8.0-Pattern)
  - Live-Smoke post-Deploy:
    - Container-Health 32s
    - error_log post-deploy 0 errors
    - End-to-End-CTA-Click-Test (PDF-Magic-Link UND Web-Action) gegen Founder-Test-Mandant
    - BD-Inbox-Verify (Founder-Inbox `bd@strategaizetransition.de`)
    - StB-Inbox-Verify (Founder-Test-Partner-contact_email)
    - Idempotenz-Check: 2x Klick → 1x Email
  - Records-Update + Worktree-Cleanup
- **Verification**: Live-Smoke-Report wird Teil RPT-368 oder /post-launch-Schritt nach 18-24h.
- **Dependencies**: MT-9

## Acceptance Criteria

- **AC-SLC-163-1**: PDF-Magic-Link-Token ist HMAC-SHA256-signiert, 90 Tage Expiry, im PDF-CTA-Button embedded.
- **AC-SLC-163-2**: GET `/strategaize-anfrage?token=<valid>` setzt Flag + sendet beide Emails + redirected zu Bestaetigungs-Page.
- **AC-SLC-163-3**: GET mit Tampered-Token zeigt Error-Page + Audit-Log `cta_invalid_token`.
- **AC-SLC-163-4**: GET mit Expired-Token zeigt Error-Page + Audit-Log `cta_invalid_token` mit reason `expired`.
- **AC-SLC-163-5**: 2x Klick auf Magic-Link → 1x Email-Set + Audit-Log `cta_idempotent_skip` beim 2. Klick (Idempotenz).
- **AC-SLC-163-6**: Server-Action `triggerStrategaizeFreigabe` setzt Flag + Dual-Email + Redirect bei valider Mandant-Session.
- **AC-SLC-163-7**: Lead-Email an `bd@strategaizetransition.de` enthaelt semantic HTML + eingebetteten JSON-Block (parsbar).
- **AC-SLC-163-8**: StB-Notification an `partner.contact_email` ist neutral-informativ (Tonality-Audit 0 Treffer).
- **AC-SLC-163-9**: Silent-Skip StB bei leerem `contact_email` + Audit-Log `stb_notification_skipped_no_email`. BD-Email geht trotzdem raus.
- **AC-SLC-163-10**: BS-Integration-Doku enthaelt JSON-Schema mit Beispiel-Body + Schema-Versionierung `STRATEGAIZE_LEAD_V1`.
- **AC-SLC-163-11**: Bestaetigungs-Page rendert in Strategaize-Wir-Voice (Tonality-Audit 0 Treffer).
- **AC-SLC-163-12**: TypeScript-Build EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.
- **AC-SLC-163-13**: Live-Smoke post-Coolify-Redeploy PASS (PDF-CTA-Click + Web-CTA-Click + Founder-Inbox + Idempotenz).

## Gesamt-V8.1-/qa Acceptance Criteria (kombiniert SLC-161/162/163)

- **AC-Gesamt-V8.1-1**: V8.1-PDF-Output 17 Seiten total mit Outro-Section (kein Doppel-CTA, V8.0-CtaPage nicht im V8.1-Pfad).
- **AC-Gesamt-V8.1-2**: V8-Web-Bericht zeigt V8OutroSection mit identischer 4-Block-Struktur.
- **AC-Gesamt-V8.1-3**: LLM-Augmentation ueber Bedrock eu-central-1 funktioniert mit deterministischem Fallback.
- **AC-Gesamt-V8.1-4**: CTA-Click setzt Flag + sendet Dual-Email + zeigt Bestaetigungs-Page.
- **AC-Gesamt-V8.1-5**: Idempotenz verhindert doppelte Emails.
- **AC-Gesamt-V8.1-6**: Tonality-Audit 0 Treffer ueber alle V8.1-Statische-Texte + LLM-Output.
- **AC-Gesamt-V8.1-7**: Audit-Trail vollstaendig (ai_cost_ledger + error_log Entries).
- **AC-Gesamt-V8.1-8**: V8.0-Co-Existenz: Pages 1-15 unveraendert, V6.3-Workshop-Variante unbeeintraechtigt.

## Notable Risks / Dependencies

- **R1**: `STRATEGAIZE_CTA_TOKEN_SECRET` Production-Generation blockiert MT-1. Pre-MT-1 User-Pflicht. Bei Coolify-ENV-Drift: alle Tokens sofort invalid (90-Tage-Window obsolet).
- **R2**: StB-Notification-Wording-Freigabe blockiert MT-4. Pre-MT-4 User-Pflicht. Falls bei MT-4-Start nicht freigegeben → MT-4 deferred.
- **R3**: BS-Inbox-Parser-Existenz unklar — falls bei V8.1-Deploy noch nicht existiert: Email landet manuell-prozessiert in `bd@strategaizetransition.de`-Posteingang. Akzeptabel als V8.1-Fallback per DEC-168.
- **R4**: Live-Smoke gegen Founder-Test-Partner-contact_email-Setup — Founder muss Test-Partner mit valider contact_email haben oder selbst contact_email anlegen.
- **R5**: Idempotenz-Race-Condition bei sehr schnellem 2x Klick (race auf Flag-UPDATE). Mitigation: atomic UPDATE WHERE released_for_strategaize_review = false (SQL-Level-Idempotenz).
- **R6**: PDF-Magic-Link-Token-Length in URL — bei zu langem Payload kann Token URL-Length-Limits ueberschreiten. Encoding via Base64-URL-safe + Payload-Minimization (nur Pflicht-Felder).
- **D1**: Hard-Dependency auf SLC-162 done (OutroPage mit CTA-Slot existiert).
- **D2**: Pre-MT-1 + Pre-MT-4 User-Pflichten.

## Worktree

- **Branch**: `v8-1-lead-conversion` (gestartet in SLC-161 MT-0, schliesst mit SLC-163 MT-10 Master-Merge)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v8-1`
- **Cumulative**: SLC-161 + SLC-162 + SLC-163, alle Commits im selben Branch

## Next After SLC-163

**/post-launch V8.1** nach 18-24h-Beobachtungs-Window-Ende. Pflicht-Smokes:
- Container-Health
- error_log letzte 24h auf `cta_*` / `v8_1_llm_*` / `stb_notification_*`-Patterns
- BD-Inbox-Test ob echte Mandanten-Leads ankommen
- StB-Inbox-Test ob Notifications wahrgenommen werden
- Tonality-Audit Re-Run gegen Live-DB
- /post-launch STABLE-Bestaetigung
- V8.1 = neue Last-Stable-Version
