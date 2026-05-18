# FEAT-051 — Public-Signup-API + Service-Key-Auth + Rate-Limit

**Version:** V7
**Status:** planned
**Created:** 2026-05-18

## Zweck

Public-API-Endpoint auf der Onboarding-Plattform, der der Intelligence-Plattform (externer Caller) erlaubt, im Namen eines Mandanten einen Self-Signup-Vorgang zu starten. Pflicht-Gate-Schicht des V7-Self-Signup-Flows: ohne dieses Feature gibt es keinen erreichbaren Einstiegspunkt fuer das Pull-Model.

## Hintergrund

Heute hat die Onboarding-Plattform nur Partner-Admin-Invite-Endpoints (Push-Model, `src/app/api/admin/tenants/[tenantId]/invite/route.ts`). Self-Signup-Pfad fehlt — der Mandant kann sich nicht selbst anmelden, die Berater-Kanzlei muss jeden einzelnen Mandanten manuell einladen. Das blockiert die Multiplikator-Skalierung.

Die Intelligence-Plattform hostet die Partner-spezifische Landing-Page (`intelligence.strategaize.com/p/<partner-slug>`, separater Service-Scope). Wenn der Mandant dort sein Signup-Formular absendet, soll die IS-Server-Side-API einen Aufruf an die Onboarding-Plattform durchreichen. Cross-System-Auth via Service-Key (analog DEC-107 V6 Lead-Push Onboarding→Business-System, gleiche Mechanik nur Caller umgedreht).

## In Scope

- **Neuer Endpoint `POST /api/public/signup`** (anonymer Public-Route, kein User-Session-Requirement):
  - **Auth**: Header `x-strategaize-service-key` gegen ENV `PUBLIC_SIGNUP_SERVICE_KEY`, Compare via timing-safe-equal.
  - **Body**: `{ partner_slug: string, email: string, first_name: string, last_name: string, company_name?: string, dsgvo_consent_accepted: true, dsgvo_consent_text_version: string }`. JSON-Schema validation via zod oder gleichwertig.
  - **Response 202**: `{ status: "pending_email_verify", expires_at: ISO8601 }` (kein User-PII in Response, nur Timing-Info).
  - **Response 401**: `{ error: "invalid_service_key" }` (kein Key, falscher Key).
  - **Response 404**: `{ error: "unknown_partner" }` (Slug existiert nicht oder ist nicht aktiv).
  - **Response 409**: `{ error: "email_already_signed_up" }` (Email existiert bereits unter diesem Partner-Tenant, idempotente Antwort).
  - **Response 422**: `{ error: "validation_failed", details: [...] }` (Email-Format, Pflicht-Felder, DSGVO-Consent-Akzeptanz nicht true).
  - **Response 429**: `{ error: "rate_limit_exceeded", retry_after_seconds: number }` (Rate-Limit-Hit).
- **Service-Key-Generierung + ENV-Setup**: Random 32-byte hex, einmalig in Coolify-ENV gesetzt, NIE im Browser exposed.
- **Rate-Limit V1**: 3 Signups / Stunde / IP via Reuse `src/lib/rate-limit.ts` In-Memory-Limiter. IP-Extraktion via `x-forwarded-for` (Coolify-Traefik-Proxy-Trusted-Header). Identifier-Compound: `${ip}::signup`.
- **Audit-Log** jedes Signup-Aufrufs in `error_log` mit `category='public_signup'`, info-Level: `partner_slug`, `email_hash` (SHA-256), `ip_hash` (SHA-256), `status_code`, `request_id`. Kein Klartext-Email, kein Klartext-IP (DSGVO-Datensparsamkeit).
- **Email-Domain-Block-Liste**: ENV-Variable `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` als komma-getrennte Liste statischer Wegwerf-Domains. Match auf `email.split('@')[1]`. Block → 422 mit `details: ["disposable_email_domain"]`.
- **Vitest-Coverage**: Happy-Path 202, alle 5 Error-Faelle (401 / 404 / 409 / 422 / 429), Service-Key timing-safe-equal, Rate-Limit-Reset nach 1h Window-Slide.

## Out of Scope

- Email-Verify-Mechanik selbst (FEAT-053 Domain).
- Partner-Slug-Lookup-Detail (FEAT-052 Domain — dieses Feature ruft nur einen Helper auf).
- Auto-Tenant-Provisioning (FEAT-053 Domain).
- Captcha-Server-Verifikation (V8+, V7 vertraut auf Rate-Limit + Email-Verify).
- DB-basiertes Rate-Limit fuer Multi-Replica-Setup (V8+ wenn noetig, V7 ist 1-Container).
- Webhook-Notification an Partner-Admin bei neuem Signup (V8+).
- Multi-Sprach-Variante der Error-Bodies (V7 ist deutsch + englisch fuer technische Codes, NL kommt mit V8).

## Akzeptanzkriterien

- AC-1: `POST /api/public/signup` mit gueltigem Service-Key + Body antwortet 202 (Pending) und schreibt `error_log`-Eintrag mit `category='public_signup'` info-Level.
- AC-2: Ohne `x-strategaize-service-key` Header → 401 `invalid_service_key`. Auch leerer Key oder String-Manipulation → 401.
- AC-3: Gueltiger Key + unbekannter `partner_slug` → 404 `unknown_partner` (NICHT 401, das wuerde Slug-Enumeration via Timing-Diff erlauben).
- AC-4: 4. Signup-Versuch innerhalb 1h von derselben IP → 429 `rate_limit_exceeded` mit korrekter `retry_after_seconds`-Estimate.
- AC-5: `dsgvo_consent_accepted=false` oder Pflicht-Felder fehlend → 422 `validation_failed`.
- AC-6: Email aus geblockter Domain (z.B. `mailinator.com`) → 422 mit `details: ["disposable_email_domain"]`.
- AC-7: Audit-Log enthaelt nur Hash-Werte fuer Email und IP, kein Klartext.
- AC-8: Service-Key-Compare nutzt timing-safe-equal (kein Standard-`===`-Compare, sonst Timing-Attack-Vektor).
- AC-9: Rate-Limit-In-Memory-State reset nach Container-Restart bewusst akzeptiert (in `/architecture` als Constraint dokumentiert).
- AC-10: Vitest-Suite mit ~12-15 Test-Cases (siehe Coverage-Liste oben) PASS.

## Abhaengigkeiten

- **Pattern-Reuse**: `src/lib/rate-limit.ts` (existiert seit V4.2, In-Memory-Limiter).
- **Pattern-Reuse**: Service-Key-Compare-Pattern aus DEC-107 V6 Lead-Push-Adapter (Onboarding→Business-System, dort als Caller, hier als Callee).
- **Pattern-Reuse**: `error_log`-Audit-Pattern aus V6 SLC-106 (FEAT-046).
- **Externe Dep**: `PUBLIC_SIGNUP_SERVICE_KEY` ENV-Var muss in Coolify gesetzt sein (Strategaize-Admin-Pflicht-Action vor Deploy).
- **Externe Dep**: Intelligence-Plattform muss diesen Key in ihrer eigenen ENV haben (User-Pflicht ausserhalb dieses Repos).

## Reuse-Anker

- `src/lib/rate-limit.ts` — In-Memory-Limiter, V7 erweitert um IP-Extraction `x-forwarded-for`.
- DEC-107 Service-Key-Compare-Pattern (timing-safe) — wird hier 1:1 portiert mit umgekehrtem Caller-Sinn.
- `error_log` mit `category=*`-Pattern — V7 fuegt 2 neue Categories hinzu (`public_signup` + `public_signup_verify`).
