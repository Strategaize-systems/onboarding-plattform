# FEAT-053 — Self-Signup Email-Verify + Auto-Tenant-Provisioning

**Version:** V7
**Status:** planned
**Created:** 2026-05-18

## Zweck

Kern-Mechanik des V7-Self-Signup-Flows: nach erfolgreichem Public-API-Aufruf bekommt der Mandant eine Bestaetigungs-Email mit Verify-Link. Klick auf Link triggert die transactionale Anlage eines `partner_client`-Tenants + `tenant_admin`-Profils + `partner_client_mapping`-Eintrags unter dem richtigen Partner-Tenant. Mandant landet anschliessend direkt im Diagnose-Werkzeug (FEAT-045 V6.3).

## Hintergrund

V6 Admin-Invite-Pattern (`src/app/api/admin/tenants/[tenantId]/invite/route.ts`) nutzt `auth.admin.generateLink({ type: 'invite' })` — das schickt sofort einen Invite-Token, der User-Account existiert ab dem ersten Klick. Fuer Self-Signup ist das problematisch: Spammer wuerden bei jedem Aufruf einen `auth.users`-Eintrag erzeugen, die DB waechst, Cleanup ist nervig.

Cleaner: eigene `pending_signup`-Tabelle, die nur die noetigen Felder + ein Hash-Token speichert. Erst nach Klick auf Verify-Link wird der echte `tenant` + `profile` + `auth.users` angelegt. Pending-Eintraege werden via TTL-Cron nach 24h aufgeraeumt.

Auto-Provisioning-Logic muss transactional sein — wenn ein Schritt failt (z.B. Email kann nicht erzeugt werden), darf kein halb-angelegter Tenant zurueckbleiben.

## In Scope

- **Migration 098**: Neue Tabelle `pending_signup` mit Spalten:
  - `id UUID PK`
  - `partner_tenant_id UUID NOT NULL FK partner_organization.tenant_id`
  - `email_lower text NOT NULL` (Lowercase fuer UNIQUE-Vergleich)
  - `first_name text NOT NULL`
  - `last_name text NOT NULL`
  - `company_name text NULL`
  - `dsgvo_consent_text_version text NOT NULL`
  - `dsgvo_consent_accepted_at timestamptz NOT NULL DEFAULT now()`
  - `verify_token_hash text NOT NULL` (SHA-256 des Klartext-Tokens, Klartext NIE persistiert)
  - `expires_at timestamptz NOT NULL` (default 24h ab now())
  - `status text NOT NULL DEFAULT 'pending'` (`pending`, `verified`, `expired`)
  - `verified_at timestamptz NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - **UNIQUE** auf `(partner_tenant_id, email_lower)` WHERE `status='pending'` (kein doppeltes Pending pro Email+Partner, aber Re-Signup nach Expiry erlaubt).
- **FEAT-051 Endpoint-Integration**: Bei 202-Response in `POST /api/public/signup` wird ein `pending_signup`-Eintrag erzeugt + Email gesendet. Klartext-Token (random 32-byte hex) als URL-Parameter, Hash in DB.
- **Email-Template**: `src/lib/email/templates/signup-verify.ts` — deutsch, Strategaize-Brand-Header, Hinweis auf Partner-Kanzlei ("[Partner-Kanzlei] hat das Strategaize-Diagnose-Werkzeug fuer Sie freigeschaltet"), Verify-Link `https://onboarding.strategaizetransition.com/auth/verify-signup?token=<token>`, Expiry-Hinweis (24h), Datenschutz-Link auf `/datenschutz`.
- **Email-Send via bestehender SMTP-Adapter** (V4.2 Reminders Reuse, IONOS DKIM bereits konfiguriert).
- **Verify-Endpoint `POST /auth/verify-signup`** (oder GET mit Bestaetigung-Page, /architecture entscheidet):
  - Token aus URL → SHA-256-Hash → Lookup in `pending_signup` WHERE hash + status='pending' + expires_at > now().
  - **Transactional Auto-Provisioning**:
    1. Anlage `tenant` (kind=`partner_client`, parent=`partner_tenant_id`).
    2. Anlage `auth.users` via `auth.admin.createUser({ email, password: random, email_confirm: true })`. Mandant bekommt anschliessend Password-Reset-Link in zweiter Mail (oder direkt Magic-Link-Flow analog V6-Invite).
    3. Anlage `profiles` (tenant_id, role=`tenant_admin`, first_name, last_name aus pending_signup).
    4. Anlage `partner_client_mapping` (partner_tenant_id, client_tenant_id, invitation_status=`accepted`, invitation_source=`self_signup`, accepted_at=now(), dsgvo_consent_text_version, dsgvo_consent_accepted_at aus pending_signup).
    5. `pending_signup.status='verified'` + `verified_at=now()`.
  - Bei Fehler in irgendeinem Schritt: ROLLBACK, `pending_signup` bleibt auf `pending`, Mandant sieht Fehler-Page mit Retry-Hinweis.
  - Erfolgs-Response: Redirect auf `/auth/set-password?session=<onetime>` (Magic-Login analog V6 Accept-Invitation).
- **Migration 098 erweitert `partner_client_mapping`** um Spalten `invitation_source text NOT NULL DEFAULT 'partner_invite'` (`partner_invite` oder `self_signup`), `dsgvo_consent_text_version text NULL`, `dsgvo_consent_accepted_at timestamptz NULL`.
- **TTL-Cleanup-Cron**: Neuer Coolify-Scheduled-Task `pending-signup-cleanup-hourly` (`0 * * * *`). Setzt alle `pending_signup` rows mit `expires_at < now()` und `status='pending'` auf `status='expired'`. Loescht nach 7 Tagen `expired`-Eintraege komplett (DSGVO-Datensparsamkeit).
- **ISSUE-051 Side-Fix**: Auto-Provisioning setzt `profiles.first_name` + `profiles.last_name` direkt aus Signup-Payload. Damit ist ISSUE-051 fuer Self-Signup-Mandanten automatisch resolved. Existierende V6-Mandanten bleiben unbetroffen (Backfill optional in V7.1).
- **F-1 Side-Fix**: `src/app/dashboard/diagnose/actions.ts:242-243` Kommentar korrigieren (`status='queued'` + `scheduled_at=now()` → `status='pending'`). 1-Zeilen-Diff im selben Backend-Touch.
- **Vitest-Coverage**: Pending-Insert via Endpoint-202, Verify-Endpoint Happy-Path (Provisioning komplett), Token-Hash-Mismatch → 401, expired Token → 410, doppelter Verify-Klick → idempotent (zweiter Klick erkennt status='verified' und redirected ohne Re-Provisioning), Race-Condition zweier paralleler Verify-Klicks (DB-Lock).
- **Pen-Test Negativ-Coverage**: Verify-Endpoint mit gueltigem Token aber falschem Partner-Slug-Hash (URL-Manipulation) → 401. Token-Replay nach `verified` Status → 401.

## Out of Scope

- Partner-Admin-Approve-Workflow (Mandant signupt → Partner muss freischalten). V7 = auto-accept. V8+ als optionaler Partner-Tier-Feature.
- Re-Send-Verify-Mail-Button auf einer Pending-Page (V7 hat fixed 24h Expiry; bei Expiry muss Mandant erneut auf Landing-Page → neuer Signup). V8+ als UX-Erweiterung.
- Multi-Sprach-Variante der Email-Templates (V8+ mit NL-Markt).
- Custom Magic-Link-Domain pro Partner (V8+ Subdomain-Mapping).
- Backfill `first_name`/`last_name` fuer V6-Bestands-Mandanten (V7.1 als Optional-Polish — ISSUE-051 betrifft V6-Daten weiter).
- DSGVO-Consent-Versionierung als eigene Tabelle (V7 speichert nur `_version`-String, Audit-Tabelle in V8+).
- Self-Signup-Statistik-Dashboard fuer Partner-Admin (V8+).
- Webhook-Notification an Partner-Admin bei neuem Signup (V8+).

## Akzeptanzkriterien

- AC-1: 202-Response des FEAT-051-Endpoints erzeugt `pending_signup`-Row + Email wird via SMTP gesendet.
- AC-2: Verify-Link-Klick triggert Auto-Provisioning. Nach erfolgreichem Klick existieren: 1 neuer `tenant` (kind=`partner_client`), 1 neuer `auth.users`, 1 neue `profiles`-Row mit `first_name`/`last_name`, 1 neuer `partner_client_mapping` (status=`accepted`, source=`self_signup`).
- AC-3: Transactional-Property: Wenn `auth.admin.createUser` failt (Email-Konflikt mit existierender User-Email cross-Partner), wird `tenant`-INSERT zurueckgerollt. `pending_signup.status` bleibt `pending`. Mandant sieht Fehler-Page.
- AC-4: Doppelter Klick auf gleichen Verify-Link → erster Klick provisioniert + Redirect, zweiter Klick sieht `status='verified'` und redirected ohne Re-Provisioning auf `/auth/set-password`.
- AC-5: Verify-Token nach 24h Expiry → 410 Gone mit Hinweis "Bestaetigungslink abgelaufen, bitte Signup wiederholen".
- AC-6: Cleanup-Cron setzt expired Pending-Eintraege korrekt auf `status='expired'`, loescht > 7 Tage alte expired Rows.
- AC-7: `partner_client_mapping.invitation_source='self_signup'` korrekt gesetzt, abgrenzbar von V6 `partner_invite`-Eintraegen.
- AC-8: Lead-Push (FEAT-046 V6) liest neuen `profiles.first_name`/`last_name`-Werte korrekt — ISSUE-051 fuer Self-Signup-Mandanten resolved (verifiziert via Live-Smoke-Lead-Push).
- AC-9: `src/app/dashboard/diagnose/actions.ts:242-243` Kommentar korrigiert (F-1 Side-Fix).
- AC-10: Mandant kann unmittelbar nach Verify-Klick (= nach Set-Password) `/dashboard/diagnose/start` aufrufen und Diagnose-Werkzeug starten (kein Wizard-Block, kein Onboarding-Pflicht-Schritt fuer Self-Signup-Mandanten).
- AC-11: Token-Klartext wird NIE in DB oder Logs gespeichert. Nur Hash. Token-Klartext-Lifetime: nur in der Email + im URL-Parameter beim Verify-Klick.

## Abhaengigkeiten

- **Hard-Dep FEAT-051**: Public-API-Endpoint muss existieren und 202 returnen.
- **Hard-Dep FEAT-052**: Partner-Slug-Lookup muss funktionieren (Signup-Endpoint resolved Slug via `partner_organization`).
- **Pattern-Reuse**: V6 SMTP-Adapter + V4.2 Reminders-Email-Template-Pattern.
- **Pattern-Reuse**: V6 Accept-Invitation-Flow (`src/app/accept-invitation/[token]/actions.ts`) als Vorlage fuer Magic-Link-Provisioning-Sequenz.
- **Pattern-Reuse**: V6 `auth.admin.createUser` aus Invite-Endpoint.
- **Cron-Reuse**: V4.2 Coolify-Scheduled-Task-Pattern (capture-reminders-daily).

## Reuse-Anker

- `src/app/accept-invitation/[token]/actions.ts` — Vorlage fuer Verify-Endpoint-Provisioning.
- `src/lib/email/*` — SMTP-Adapter + Template-Engine.
- `src/app/api/admin/tenants/[tenantId]/invite/route.ts` — `auth.admin.createUser` Pattern.
- Migration 091 `partner_client_mapping` — V7 erweitert um 3 Spalten.
- Coolify-Scheduled-Task `capture-reminders-daily` — Vorlage fuer `pending-signup-cleanup-hourly`.
