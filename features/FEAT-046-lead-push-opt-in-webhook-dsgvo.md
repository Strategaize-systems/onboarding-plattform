# FEAT-046 — Lead-Push opt-in + Outbound Webhook + DSGVO-Audit

**Version:** V6
**Status:** planned
**Created:** 2026-05-11

## Zweck

Wenn der Mandant nach Abschluss der Diagnose aktiv „Ich will mehr von Strategaize" klickt UND die DSGVO-Pflicht-Checkbox setzt, wird ein qualifizierter Lead ans Strategaize-Business-System (Lead-Intake-API) gepusht — mit Attribution zum vermittelnden Partner-Tenant. Ohne Klick und Checkbox passiert **nichts**: kein Lead, kein Anruf, kein E-Mail-Folgepfad ausserhalb der Plattform.

Damit wird die strikte Konzept-Vorgabe aus MULTIPLIER_MODEL.md Achse 4 Verfeinerung 3 („Lead-Push nur bei aktiver Mandanten-Initiative") technisch umgesetzt.

## Hintergrund

Heute hat die Onboarding-Plattform **keinen einzigen** outbound HTTP-Call zu anderen Strategaize-Systemen. Die Business-System Lead-Intake-API (`POST /api/leads/intake` mit Bearer-Auth, First-Touch-Lock, UTM-Attribution) existiert und wird vom Business-System selbst sowie externen Webhooks gefuettert. V6 baut den Onboarding-seitigen Adapter zum erstmaligen outbound-Push.

DEC-091 V5-Pattern (Pflicht-Privacy-Checkbox mit Re-Validation in der Server Action) ist das wiederverwendbare Pattern fuer DSGVO-konformen Opt-in.

## In Scope

- **Neue Tabelle `lead_push_consent`** (DSGVO-Audit, Pflicht):
  - `id UUID PK`
  - `capture_session_id UUID FK REFERENCES capture_session(id) ON DELETE CASCADE`
  - `mandant_user_id UUID FK REFERENCES auth.users(id)` (welcher User hat geklickt)
  - `mandant_tenant_id UUID FK REFERENCES tenants(id)`
  - `partner_tenant_id UUID FK REFERENCES tenants(id)` (welcher Partner ist Attribution)
  - `consent_given_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `consent_text_version TEXT NOT NULL` (Versionierung des angezeigten Einwilligungs-Texts, z.B. `'v1-2026-05'`)
  - `consent_ip INET NULL` (IP zur Zeitpunkt-Identifikation, DSGVO-Audit)
  - `consent_user_agent TEXT NULL`
  - `withdrawal_at TIMESTAMPTZ NULL` (V7+ Rueckruf-Faehigkeit, V6 schreibt das Feld immer NULL)
- **Neue Tabelle `lead_push_audit`** (Send-History):
  - `id UUID PK`
  - `consent_id UUID FK REFERENCES lead_push_consent(id) ON DELETE RESTRICT`
  - `attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `attempt_number INT NOT NULL DEFAULT 1` (1..3 fuer Retry)
  - `status TEXT NOT NULL CHECK IN ('pending', 'success', 'failed')`
  - `business_system_response_status INT NULL` (HTTP-Code)
  - `business_system_contact_id UUID NULL` (Response-Field `contact_id` aus Business-System)
  - `business_system_was_new BOOLEAN NULL` (Response-Field, fuer First-Touch-Diagnose)
  - `error_message TEXT NULL`
  - `attribution_utm_source TEXT NOT NULL` (z.B. `partner_<tenant_id>`)
  - `attribution_utm_campaign TEXT NOT NULL` (z.B. `partner_diagnostic_v1`)
  - `attribution_utm_medium TEXT NOT NULL DEFAULT 'referral'`
- **Server Action `requestLeadPush(capture_session_id, consent_checkbox_value, consent_text_version)`** (Mandanten-Rolle):
  - Pflicht-Validation: `consent_checkbox_value === true`, sonst Return `{ error: 'privacy_checkbox_required' }` (analog DEC-091 V5 Pattern)
  - Pflicht-Validation: Capture-Session gehoert dem aufrufenden User
  - Pflicht-Validation: Capture-Session hat `status` so dass Diagnose-Bericht existiert (FEAT-045 Auto-Finalize hat KU geschrieben)
  - Pflicht-Validation: Capture-Session-Tenant ist `tenant_kind='partner_client'` (kein Lead-Push fuer Direkt-Kunden ueber dieses Feature)
  - INSERT `lead_push_consent` mit consent_text_version + IP + User-Agent
  - INSERT `lead_push_audit` mit `status='pending'`, attempt 1, mit korrekter UTM-Attribution (`utm_source=partner_<partner_tenant_id>`)
  - Synchroner outbound HTTP-Call an Business-System Lead-Intake-API
  - Bei Success: `lead_push_audit.status='success'` + Response-Felder persistieren
  - Bei Fail (HTTP != 2xx): `lead_push_audit.status='failed'` + retry-Job in `ai_jobs` mit `job_type='lead_push_retry'` enqueuen
  - Return `{ ok: true, audit_id }` an UI
- **Worker-Job-Handler `lead_push_retry`** (im bestehenden Worker-Container):
  - Picked Job → lese `lead_push_audit.consent_id` → lade Daten neu
  - Erneuter outbound HTTP-Call, dieses Mal `attempt_number = previous + 1`
  - Max. 3 Versuche (1 synchron + 2 retry mit exponentiellem Backoff: 5min, 30min)
  - Bei finalem Fail: Eintrag in `error_log` mit `category='lead_push_failure'`, manueller Strategaize-Admin-Eingriff erforderlich
- **Outbound HTTP-Adapter** `src/lib/integrations/business-system/lead-intake.ts`:
  - Bearer-Auth via ENV `BUSINESS_SYSTEM_INTAKE_API_KEY`
  - Endpoint via ENV `BUSINESS_SYSTEM_INTAKE_URL` (z.B. `https://os.strategaize.com/api/leads/intake`)
  - Payload-Mapping: `first_name`, `last_name`, `email` aus `auth.users` + `partner_organization.contact_email` ggf. als Fallback, plus `notes` mit kompaktem Strukturtext aus Diagnose-Bericht (KEIN Roh-Bericht, nur 2-3 Saetze Kontext), plus UTM-Felder
  - Timeout 10 Sekunden
  - Logging: jeder Call mit `category='lead_push_attempt'` in `error_log` (Anbieter/Endpoint/Status/Latency, analog Audit-Pattern aus FEAT-046 Business-System)
- **UI „Ich will mehr"-Klick** in Diagnose-Bericht (Erweiterung FEAT-045):
  - Sichtbar nur wenn Bericht fertig + noch kein erfolgreicher Lead-Push erfolgt (idempotent)
  - Modal mit Einwilligungs-Text + Pflicht-Checkbox (analog V5 SLC-079 Privacy-Checkbox-UI)
  - Submit-Button disabled bis Checkbox aktiv
  - Bei Erfolg: Confirmation-Block „Wir haben Ihre Anfrage erhalten — Strategaize meldet sich in den naechsten Werktagen"
  - Bei Fail (sofort sichtbar): Generische Fehlermeldung „Etwas ist schiefgelaufen, wir kuemmern uns" (Retry-Job laeuft im Hintergrund)

## Out of Scope

- Rueckruf-Faehigkeit des Consent (Mandant zieht Opt-in zurueck) — V7+, Feld `withdrawal_at` heute schon im Schema
- Email-Versand aus der Onboarding-Plattform an Mandant nach Lead-Push (z.B. „Bestaetigung Ihrer Anfrage") — V7+, Strategaize-Business-System uebernimmt Folgekommunikation
- Lead-Push fuer Direkt-Kunden (`tenant_kind='direct_client'`) — V6 nur Partner-Client-Pfad, Direkt-Kunden haben keinen Vermittlungs-Funnel
- Re-Push bei aktualisiertem Diagnose-Bericht — V7+
- Lead-Push als async-only (V6 ist hybrid: synchron + retry-job)
- Webhook-Endpoint auf Onboarding-Seite, der vom Business-System bei Lead-Conversion ein Update zurueckspielt — V7+ Bidirektional
- Manueller Trigger durch `partner_admin` (Partner pushed Lead aktiv) — V6 nur Mandanten-Initiative-Pfad

## Akzeptanzkriterien

- Mandant kann „Ich will mehr"-Modal oeffnen, Checkbox aktivieren, Submit klicken
- Ohne Checkbox: Submit liefert `privacy_checkbox_required`-Error (SC-V6-7)
- Mit Checkbox: Lead landet in Business-System Lead-Intake (verifiziert via DB-Eintrag im Business-System contact-Tabelle mit korrektem `utm_source=partner_<tenant_id>`) (SC-V6-7)
- First-Touch-Lock funktioniert: zweiter „Ich will mehr"-Klick desselben Mandanten aktualisiert NICHT die Attribution im Business-System (idempotent via Mandant-Email)
- `lead_push_consent`-Eintrag mit korrekten Audit-Feldern (IP, User-Agent, Consent-Text-Version)
- `lead_push_audit`-Eintrag mit `status='success'` (SC-V6-8)
- Bei Business-System-Downtime: `lead_push_audit.status='failed'`, Retry-Job in `ai_jobs` queue, UI zeigt generischen Fehler
- Retry-Job laeuft erfolgreich nach Business-System-Recovery (manueller Test: BS-Container restart waehrend Push)
- Bedrock-/Storage-Cost-Audit unbeeinflusst (Lead-Push ist HTTP-only, kein KI-Call)
- Notes-Field im Lead enthaelt 2-3 Saetze Strukturtext, **kein Roh-Bericht** (DSGVO-Datensparsamkeit)
- Verfuegbare ENV-Variablen: `BUSINESS_SYSTEM_INTAKE_URL`, `BUSINESS_SYSTEM_INTAKE_API_KEY` (Coolify-Secrets)

## Abhaengigkeiten

- FEAT-041 (Foundation + RLS) — Pflicht
- FEAT-043 (Partner-Client-Mapping) — Pflicht, fuer Attribution-Resolution
- FEAT-045 (Diagnose-Werkzeug) — Pflicht, der „Ich will mehr"-Klick lebt im Bericht-Renderer
- Business-System Lead-Intake-API `POST /api/leads/intake` muss erreichbar sein (cross-system, bestehend)
- Reuse: DEC-091 V5 Pflicht-Privacy-Checkbox-Pattern + Re-Validation in Server Action
- Reuse: bestehende `ai_jobs`-Queue fuer retry (neuer `job_type`)
- Reuse: bestehendes `error_log`-Pattern fuer Audit-Eintraege

## Verweise

- RPT-209 V6 Requirements (SC-V6-7, SC-V6-8, R-V6-3 Outbound HTTP-Fail-Risk)
- RPT-208 V6 Discovery — Sektion 4.6 Lead-Push + DEC-091 Pattern-Reuse
- MULTIPLIER_MODEL.md Achse 4 Verfeinerung 3 — „Lead-Push nur bei aktiver Mandanten-Initiative"
- Business-System `cockpit/src/app/api/leads/intake/route.ts` (Pflicht-Felder + Auth-Pattern)
- Pattern-Reuse: `src/app/admin/walkthroughs/[id]/page.tsx` (Privacy-Checkbox aus SLC-079)
