# SLC-106 — Lead-Push opt-in + Outbound Webhook + DSGVO-Audit (FEAT-046, Migration 092)

## Goal

**Erster outbound HTTP-Call der Plattform**. Nach Diagnose-Abschluss klickt Mandant "Ich will mehr von Strategaize", aktiviert DSGVO-Pflicht-Checkbox, Submit triggert synchronen HTTP-Call an Business-System `POST /api/leads/intake` mit Bearer-Auth + UTM-Attribution (`utm_source=partner_<tenant_id>`). Bei Fail: retry-Job in bestehender `ai_jobs`-Queue mit `job_type='lead_push_retry'`, max 3 Versuche, exponentielles Backoff (5min/30min) (DEC-107, DEC-112). Migration 092 legt `lead_push_consent` + `lead_push_audit` Tabellen + RLS + `ai_jobs.job_type` CHECK-Erweiterung an. Audit-Log auf jedem Schritt (`category='lead_push_attempt'` / `'lead_push_failure'`).

## Feature

FEAT-046 (Lead-Push opt-in + Outbound Webhook + DSGVO-Audit). Pattern-Reuse: DEC-091 V5 Pflicht-Privacy-Checkbox-Pattern + Re-Validation in Server Action (`src/app/admin/walkthroughs/[id]/page.tsx` SLC-079); bestehende `ai_jobs`-Queue + Worker-Container fuer Retry-Job; bestehende `error_log`-Audit-Logik (DEC-088); Business-System Lead-Intake-API (`cockpit/src/app/api/leads/intake/route.ts`, externes Endpoint).

## In Scope

### A — Migration 092 SQL-File anlegen

Pfad: `sql/migrations/092_v6_lead_push_audit.sql` (NEU).

Inhalt (vollstaendig, idempotent, ON_ERROR_STOP-faehig):

1. **`lead_push_consent` Tabelle + RLS** (DSGVO-Audit, vollstaendig wie MIG-034 SQL-Skizze):
   - UUID PK
   - `capture_session_id` FK ON DELETE CASCADE
   - `mandant_user_id`, `mandant_tenant_id`, `partner_tenant_id` FK
   - `consent_given_at`, `consent_text_version` (z.B. `'v1-2026-05'`)
   - `consent_ip inet NULL`, `consent_user_agent text NULL`
   - `withdrawal_at timestamptz NULL` (V7+ Rueckruf, V6 immer NULL)
   - `ENABLE ROW LEVEL SECURITY`
   - 4 Policies: SELECT eigene fuer mandant (`mandant_user_id = auth.uid()`), SELECT eigene fuer partner_admin (`partner_tenant_id = auth.user_tenant_id()`), SELECT alle fuer strategaize_admin, INSERT nur via Server-Action mit `service_role` ODER policy fuer mandant `mandant_user_id = auth.uid()`.

2. **`lead_push_audit` Tabelle + RLS** (Send-History, vollstaendig wie MIG-034 SQL-Skizze):
   - UUID PK
   - `consent_id` FK ON DELETE RESTRICT
   - `attempted_at`, `attempt_number int DEFAULT 1`, `status text CHECK IN ('pending','success','failed')`
   - `business_system_response_status int NULL`, `business_system_contact_id uuid NULL`, `business_system_was_new boolean NULL`
   - `error_message text NULL`
   - `attribution_utm_source text NOT NULL`, `attribution_utm_campaign text NOT NULL`, `attribution_utm_medium text NOT NULL DEFAULT 'referral'`
   - `ENABLE ROW LEVEL SECURITY`
   - 4 Policies: SELECT via consent.partner_tenant_id-Join fuer partner_admin, SELECT alle fuer strategaize_admin, SELECT eigene fuer mandant via consent.mandant_user_id-Join (V6 Mandant darf seinen eigenen Audit-Eintrag lesen — Status-Anzeige im Bericht), INSERT via service_role.

3. **`ai_jobs.job_type` CHECK-Erweiterung**:
   - DROP CONSTRAINT IF EXISTS + RECREATE mit allen bisherigen Werten + neu `'lead_push_retry'`.
   - Idempotent.

### B — Outbound HTTP-Adapter

Pfad: `src/lib/integrations/business-system/lead-intake.ts` (NEU) + `src/lib/integrations/business-system/types.ts` (NEU).

```typescript
export interface LeadIntakePayload {
  first_name: string;
  last_name: string;
  email: string;
  notes: string;             // 2-3 Saetze Strukturtext aus Diagnose (KEIN Roh-Bericht)
  utm_source: string;        // z.B. partner_<tenant_id>
  utm_campaign: string;      // z.B. partner_diagnostic_v1
  utm_medium: string;        // 'referral'
  // optional: company, phone — V6 reicht email+name
}

export interface LeadIntakeResponse {
  ok: boolean;
  contact_id?: string;
  was_new?: boolean;
  error?: string;
}

export async function pushLeadToBusinessSystem(payload: LeadIntakePayload): Promise<LeadIntakeResponse> {
  const url = process.env.BUSINESS_SYSTEM_INTAKE_URL;
  const apiKey = process.env.BUSINESS_SYSTEM_INTAKE_API_KEY;
  if (!url || !apiKey) {
    throw new Error('BUSINESS_SYSTEM_INTAKE_URL or BUSINESS_SYSTEM_INTAKE_API_KEY not configured');
  }
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s Timeout
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    // Audit: error_log INSERT (category='lead_push_attempt', ...) ueber Caller
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json() as { contact_id: string; was_new: boolean };
    return { ok: true, contact_id: data.contact_id, was_new: data.was_new };
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') {
      return { ok: false, error: 'Timeout (10s)' };
    }
    return { ok: false, error: (e as Error).message };
  }
}

export function buildNotesFromDiagnose(report: DiagnoseReport): string {
  // 2-3 Saetze Strukturtext (DSGVO-Datensparsamkeit, KEIN Roh-Bericht)
  // Z.B. "Mandant von Steuerberater <X> hat Diagnose-Werkzeug durchlaufen. Durchschnittlicher Score: <Y>. Groesste Strukturluecke: <Z (Block-Name)>. Mandant wuenscht Kontakt."
  // ...
}
```

ENV-Variablen (Coolify-Secrets):
- `BUSINESS_SYSTEM_INTAKE_URL` (z.B. `https://os.strategaize.com/api/leads/intake`)
- `BUSINESS_SYSTEM_INTAKE_API_KEY` (Bearer-Token, generiert in Business-System Admin)

### C — Server Action `requestLeadPush`

Pfad: `src/app/dashboard/diagnose/[capture_session_id]/lead-push-actions.ts` (NEU).

```typescript
'use server';

export async function requestLeadPush(input: {
  capture_session_id: string;
  consent_checkbox_value: boolean;
  consent_text_version: string;
}): Promise<{ ok: true; audit_id: string } | { error: string }> {
  // 1. Pflicht-Re-Validation (DEC-091 V5 Pattern):
  if (!input.consent_checkbox_value) {
    return { error: 'privacy_checkbox_required' };
  }

  // 2. Auth: aufrufender User muss tenant_admin sein
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // 3. Validation: Capture-Session gehoert User, hat status='finalized', ist partner_client
  const session = await loadCaptureSession(input.capture_session_id);
  if (session.tenant_id !== user.user_metadata.tenant_id) return { error: 'forbidden' };
  if (session.status !== 'finalized') return { error: 'not_finalized' };

  const tenant = await loadTenant(session.tenant_id);
  if (tenant.tenant_kind !== 'partner_client') return { error: 'not_partner_client' };
  if (!tenant.parent_partner_tenant_id) return { error: 'no_parent_partner' };

  // 4. Idempotenz-Check: pruefe ob bereits `lead_push_audit.status='success'` fuer diese consent existiert
  const existing = await checkExistingSuccessfulPush(input.capture_session_id, user.id);
  if (existing) return { error: 'already_pushed' };

  // 5. BEGIN TX:
  //    INSERT lead_push_consent (capture_session_id, mandant_user_id, mandant_tenant_id, partner_tenant_id, consent_given_at, consent_text_version, consent_ip, consent_user_agent)
  //    INSERT lead_push_audit (consent_id, attempt_number=1, status='pending', attribution_utm_source=partner_<parent_partner_tenant_id>, attribution_utm_campaign=partner_diagnostic_v1, attribution_utm_medium='referral')
  //    error_log INSERT (category='lead_push_consent_given', metadata={consent_id, capture_session_id, partner_tenant_id})
  //    COMMIT (lese auditId)

  // 6. Build Payload + Synchroner HTTP-Call
  const userProfile = await loadUserProfile(user.id);
  const partnerOrg = await loadPartnerOrganization(tenant.parent_partner_tenant_id);
  const report = await loadDiagnoseReport(input.capture_session_id);
  const payload: LeadIntakePayload = {
    first_name: userProfile.first_name,
    last_name: userProfile.last_name,
    email: userProfile.email,
    notes: buildNotesFromDiagnose(report),
    utm_source: `partner_${tenant.parent_partner_tenant_id}`,
    utm_campaign: 'partner_diagnostic_v1',
    utm_medium: 'referral',
  };
  const response = await pushLeadToBusinessSystem(payload);

  // 7. error_log INSERT (category='lead_push_attempt', metadata={audit_id, attempt: 1, status: response.ok, latency, http_status})

  // 8. UPDATE lead_push_audit basierend auf Response
  if (response.ok) {
    await updateAudit(auditId, { status: 'success', business_system_response_status: 200, business_system_contact_id: response.contact_id, business_system_was_new: response.was_new });
    return { ok: true, audit_id: auditId };
  } else {
    await updateAudit(auditId, { status: 'failed', error_message: response.error });
    // 9. INSERT ai_jobs mit job_type='lead_push_retry', scheduled_at=now()+5min, metadata={audit_id, attempt: 2}
    await enqueueRetryJob(auditId, 2);
    return { ok: true, audit_id: auditId }; // UI bekommt ok=true, UI zeigt generischen Fehler ueber audit-Status lookup
  }
}
```

### D — Worker-Job-Handler `lead_push_retry`

Pfade: `src/workers/lead-push/run.ts` (NEU) + Erweiterung von Worker-Registry (`src/workers/registry.ts` o.ae.).

```typescript
export async function handleLeadPushRetryJob(input: {
  job: AiJob;
  adminClient: SupabaseClient;
}): Promise<void> {
  const { audit_id, attempt } = input.job.metadata;
  if (attempt > 3) {
    // sollte nicht passieren — Safety
    await markAuditFailed(audit_id, 'max_attempts_exceeded');
    return;
  }
  const audit = await loadAudit(audit_id);
  if (!audit) return;
  const consent = await loadConsent(audit.consent_id);
  // Build Payload analog requestLeadPush
  const payload = await buildPayloadFromConsent(consent);
  const start = Date.now();
  const response = await pushLeadToBusinessSystem(payload);
  const latencyMs = Date.now() - start;
  // error_log INSERT (category='lead_push_attempt', metadata={audit_id, attempt, status, latency})
  if (response.ok) {
    await markAuditSuccess(audit_id, response);
  } else {
    if (attempt < 3) {
      // Naechster Retry mit exponentiellem Backoff
      const backoffMs = attempt === 1 ? 5 * 60 * 1000 : 30 * 60 * 1000;  // 5min nach Attempt 1, 30min nach Attempt 2
      await enqueueRetryJob(audit_id, attempt + 1, backoffMs);
    } else {
      // Final fail: error_log INSERT (category='lead_push_failure', metadata={audit_id, consent_id, final_error: response.error})
      await markAuditFailed(audit_id, response.error);
    }
  }
}
```

Worker-Registry: `walkthrough_*` Job-Handler Pattern aus V5 reusen, neuer Job-Type `lead_push_retry`.

### E — "Ich will mehr"-UI im Diagnose-Bericht

Pfade: `src/components/diagnose/IchWillMehrModal.tsx` (NEU) + Erweiterung von `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` (aus SLC-105).

**Modal-Trigger**: Sub-Karte "Ich will mehr von Strategaize" auf Bericht-Page (aus SLC-105-Stub jetzt aktiv).

**Modal-Inhalt**:
- Header: "Strategaize meldet sich"
- Einwilligungs-Text (versioniert, z.B. `v1-2026-05`): "Ich willige ein, dass mein Vor- und Nachname, meine E-Mail-Adresse und die Strukturzusammenfassung meiner Diagnose an Strategaize uebermittelt werden, damit Strategaize Kontakt mit mir aufnehmen kann. Diese Einwilligung kann ich jederzeit widerrufen."
- **Pflicht-Checkbox**: "Ich willige ein" (Pattern aus SLC-079 DEC-091 Privacy-Checkbox).
- Submit-Button: disabled bis Checkbox aktiv.

**Submit-Pfad**:
- Form-Submit ruft Server Action `requestLeadPush` mit `consent_text_version='v1-2026-05'`.
- Bei `{ ok: true, audit_id }`: zeige Confirmation-Block "Wir haben Ihre Anfrage erhalten — Strategaize meldet sich in den naechsten Werktagen", schliesse Modal, ersetze "Ich will mehr"-Karte durch Status-Karte "Anfrage gesendet am {date}" (idempotent — nach Lead-Push kein erneuter Klick moeglich; `existing` Check in requestLeadPush).
- Bei `{ error: 'privacy_checkbox_required' }`: inline-Error im Modal (sollte nicht passieren wegen disabled-Submit, aber Defense-in-Depth Pattern aus SLC-079).
- Bei `{ error: 'already_pushed' }`: zeige "Anfrage bereits gesendet"-Status (idempotent).
- Bei Server-Action-Failure ohne explizites `{ error: ... }`: generische Error-UI "Etwas ist schiefgelaufen, wir kuemmern uns. Bitte spaeter erneut versuchen." (Retry-Job laeuft im Hintergrund — Mandant erfaehrt das ueber nichts, oder Status-Karte zeigt "Anfrage wird erneut zugestellt").

### F — Status-Card im Mandanten-Dashboard

Pfad: `src/app/dashboard/page.tsx` (aus SLC-103 erweitert).

- Wenn `lead_push_audit.status='success'` existiert fuer aktuellen User: Status-Card "Anfrage an Strategaize gesendet am {date}" (statt "Ich will mehr").
- Wenn `lead_push_audit.status='pending|failed'`: Status-Card "Anfrage wird zugestellt..." (nicht-blockend).

### G — TypeScript-Types + Vitest

- `LeadIntakePayload`, `LeadIntakeResponse`, `LeadPushConsent`, `LeadPushAudit` in `src/types/db.ts` und `src/lib/integrations/business-system/types.ts`.
- Vitest fuer:
  - `pushLeadToBusinessSystem` mit Mock-Fetch: 5 Faelle (Happy / HTTP 4xx / HTTP 5xx / Timeout / Network-Error).
  - `requestLeadPush` Server Action: 8 Faelle (Happy / Missing-Checkbox / Auth-Reject / Wrong-Tenant / Not-Finalized / Not-Partner-Client / Already-Pushed / DB-Tx-Fail).
  - `handleLeadPushRetryJob` Worker: 5 Faelle (Happy / Retry 2 / Retry 3 / Max-Attempts / Backoff-Schedule-Verify).
  - `buildNotesFromDiagnose`: 3 Faelle (typische Struktur, leerer Bericht-Edge-Case, Score-Edge-Case).
  - RLS-Tests gegen Coolify-DB: 12 Faelle (4 Rollen × 3 Tabellen, lead_push_consent + lead_push_audit + ai_jobs) — wird Teil der `v6-partner-rls.test.ts` aus SLC-101 (placeholder-Aktivierung).
- Mindestens 30 neue Vitest.

### H — ENV-Konfiguration

- Coolify-Secrets gesetzt:
  - `BUSINESS_SYSTEM_INTAKE_URL` (User setzt via Coolify-UI).
  - `BUSINESS_SYSTEM_INTAKE_API_KEY` (User generiert in Business-System Admin + setzt in Coolify).
- App- + Worker-Container muessen beide die ENVs sehen (Worker fuer Retry-Job).
- ENV-Validierung beim Worker-Start (`src/workers/index.ts` o.ae.): Warn-Log wenn ENVs fehlen.

## Acceptance Criteria

1. Mandant kann "Ich will mehr"-Modal oeffnen, Checkbox aktivieren, Submit klicken.
2. **Ohne Checkbox**: Submit (sollte UI-disabled sein, aber bei Bypass) liefert `privacy_checkbox_required`-Error (DEC-091 V5 Pattern, SC-V6-7).
3. **Mit Checkbox**: Lead landet in Business-System Lead-Intake — verifiziert via DB-Eintrag im Business-System contacts-Tabelle mit korrektem `utm_source=partner_<tenant_id>` (SC-V6-7). Cross-System Smoke-Test in MT-N.
4. **First-Touch-Lock funktioniert**: zweiter "Ich will mehr"-Klick desselben Mandanten aktualisiert NICHT die Attribution im Business-System (Business-System First-Touch-Lock existiert bereits + Onboarding-Plattform-Side `already_pushed`-Check).
5. `lead_push_consent`-Eintrag mit korrekten Audit-Feldern (`consent_text_version`, IP, User-Agent, mandant/partner-IDs).
6. `lead_push_audit`-Eintrag mit `status='success'`, `business_system_response_status=200|201`, `business_system_contact_id` aus Response (SC-V6-8).
7. **Bei Business-System-Downtime**: `lead_push_audit.status='failed'`, Retry-Job in `ai_jobs` queue, UI zeigt generischen Fehler.
8. **Retry-Job laeuft erfolgreich** nach Business-System-Recovery (manueller Test: BS-Container restart waehrend Push → Attempt 1 failed, nach 5min Attempt 2 success).
9. **Max. 3 Versuche** (1 synchron + 2 retry mit 5min/30min Backoff, DEC-112). Nach Attempt-3-Fail: `error_log` mit `category='lead_push_failure'`, kein neuer ai_jobs-Job.
10. Bedrock-/Storage-Cost-Audit unbeeinflusst (Lead-Push ist HTTP-only, kein KI-Call).
11. **`notes`-Field im Lead enthaelt 2-3 Saetze Strukturtext, KEIN Roh-Bericht** (DSGVO-Datensparsamkeit).
12. ENV-Variablen `BUSINESS_SYSTEM_INTAKE_URL` + `BUSINESS_SYSTEM_INTAKE_API_KEY` als Coolify-Secrets gesetzt + beide Container (app + worker) lesen sie korrekt.
13. **Idempotenz**: zweiter `requestLeadPush`-Klick fuer dieselbe `capture_session_id` liefert `already_pushed` ohne neuen DB-Insert.
14. Migration 092 idempotent appliziert (zweiter Apply produziert keinen DML-Drift).
15. Pen-Test-Suite SLC-101 weiter gruen + 12 neue Faelle fuer `lead_push_consent` + `lead_push_audit` aktiviert.
16. ESLint 0/0. `npm run build` PASS. Vitest neue Tests gruen (30+). `npm audit --omit=dev` 0 neue Vulns (SLC-106 fuegt keine npm-Deps hinzu).

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Migration 092 SQL-File anlegen | `sql/migrations/092_v6_lead_push_audit.sql` (NEU) | `psql --syntax-check`, SQL-Skizze MIG-034 konsistent |
| MT-2 | Migration 092 Live-Apply auf Hetzner | Coolify-Container | Pre-Apply-Backup; Apply via base64+psql; `\dt lead_push_*`, `\d ai_jobs` CHECK enthaelt `lead_push_retry` |
| MT-3 | Outbound HTTP-Adapter `lead-intake.ts` + Vitest mit Mock-Fetch | `src/lib/integrations/business-system/lead-intake.ts` + `types.ts` (NEU) + `__tests__/` | 5 Vitest Happy/4xx/5xx/Timeout/Network |
| MT-4 | `buildNotesFromDiagnose` Helper + Vitest | (in `lead-intake.ts` oder eigenes File) | 3 Vitest |
| MT-5 | Server Action `requestLeadPush` + Idempotenz-Check + atomare TX + Vitest | `src/app/dashboard/diagnose/[capture_session_id]/lead-push-actions.ts` (NEU) | 8 Vitest, TX-Rollback verifiziert |
| MT-6 | Worker-Job-Handler `lead_push_retry` + Worker-Registry-Erweiterung + Vitest | `src/workers/lead-push/run.ts` (NEU) + `src/workers/registry.ts` (modifiziert) | 5 Vitest, Backoff-Schedule verifiziert |
| MT-7 | "Ich will mehr"-Modal + Pflicht-Checkbox + Submit-Logic | `src/components/diagnose/IchWillMehrModal.tsx` (NEU) + Erweiterung von Bericht-Page | Build PASS, Submit-Disabled-State korrekt, Pattern aus SLC-079 sauber reused |
| MT-8 | Status-Card im Mandanten-Dashboard nach Push | `src/app/dashboard/page.tsx` (modifiziert) | Build PASS, 3 States (none / success / pending\|failed) korrekt |
| MT-9 | Pen-Test-Faelle fuer `lead_push_*` aktivieren | `src/lib/db/__tests__/v6-partner-rls.test.ts` (modifiziert) | 12 neue PASS-Faelle |
| MT-10 | Quality-Gates: Lint + Build + Test + Audit + Regression Pen-Test-Suite | (gesamt) | 0/0 Lint, Build PASS, alle Vitest gruen, 0 neue Vulns |
| MT-11 | ENV-Setup auf Coolify (app + worker) | Coolify-UI | User-Pflicht: BUSINESS_SYSTEM_INTAKE_URL + BUSINESS_SYSTEM_INTAKE_API_KEY gesetzt, beide Container restarted, ENV-Read im Worker-Log sichtbar |
| MT-12 | Cross-System Live-Smoke (Onboarding → Business-System) | Live-URLs | User-Pflicht: Mandant klickt "Ich will mehr" → Lead landet im Business-System contacts-Tabelle mit korrektem utm_source. Audit-Eintraege auf beiden Seiten sichtbar. |
| MT-13 | Retry-Pfad Live-Smoke | Live | User-Pflicht (optional): Business-System kurz auf Downtime simulieren (z.B. falscher API-Key temporaer) → Attempt 1 failed, nach 5min Attempt 2 (mit korrigiertem Key) success |

## Out of Scope (deferred)

- Rueckruf-Faehigkeit des Consent (Mandant zieht Opt-in zurueck) → V7+, Feld `withdrawal_at` heute schon im Schema
- E-Mail-Bestaetigung an Mandant nach Push ("Bestaetigung Ihrer Anfrage") → V7+, Business-System uebernimmt Folgekommunikation
- Lead-Push fuer Direkt-Kunden (`tenant_kind='direct_client'`) → V6 nur Partner-Client-Pfad
- Re-Push bei aktualisiertem Diagnose-Bericht → V7+
- Lead-Push async-only (V6 ist hybrid: synchron + retry-job, DEC-107)
- Webhook-Endpoint auf Onboarding-Seite (Business-System -> Onboarding Bidirektional bei Lead-Conversion) → V7+
- Manueller Trigger durch `partner_admin` (Partner pushed Lead aktiv) → V6 nur Mandanten-Initiative-Pfad
- Operations-Dashboard "lead_push_failure" Re-Push UI fuer strategaize_admin → V7+ (V6 hat nur DB-Log)
- Bulk-Lead-Export (CSV) fuer manuelle Re-Push-Schleifen → V7+
- Multi-System Push (Onboarding pusht parallel an mehrere Systeme) → niemals (V6-Out-of-Scope)

## Tests / Verifikation

- **Vitest-Mindestumfang**: 30+ neue Tests (Adapter 5 + buildNotes 3 + Server Action 8 + Worker 5 + RLS 12).
- **Live-Migration-Apply**: MT-2 via sql-migration-hetzner.md Pattern.
- **Cross-System Smoke** (MT-12): echter Push an Business-System, DB-Verify in beiden Systemen.
- **Retry-Smoke** (MT-13, optional): manueller Downtime-Test.
- **ENV-Smoke** (MT-11): Worker-Log zeigt korrektes ENV-Read.

## Risks

- **R-106-1** Business-System Endpoint `POST /api/leads/intake` koennte sich aendern (Felder, Auth-Scheme). **Mitigation**: A-V6-2 (Business-System-Vertrag stabil) als Annahme dokumentiert; Cross-System-Smoke vor Release (MT-12). Falls Endpoint sich aendert: Adapter ist isoliert in `src/lib/integrations/business-system/lead-intake.ts`, leicht anpassbar.
- **R-106-2** Bearer-Token-Leck via ENV-Misconfiguration (z.B. ENV gesetzt im Server-Log oder Frontend-Bundle). **Mitigation**: ENV nur im Server-Action / Worker (kein Client-Bundle); `next.config.ts` validieren dass kein `NEXT_PUBLIC_*` mit Lead-Intake-Variablen. Vitest fuer ENV-Lookup-Pfad.
- **R-106-3** Retry-Job-Storm bei dauerhafter Business-System-Downtime: V6 baut max-3-Versuche-Limit (DEC-112) — kein Endlos-Loop. Aber gleichzeitig viele Mandanten in Downtime-Phase = viele failed-Jobs. **Mitigation**: error_log-Audit-Trail erlaubt strategaize_admin Operations-Eingriff; V7+ Operations-Dashboard kuemmert sich.
- **R-106-4** First-Touch-Lock vs Multi-Diagnose-Mandant: wenn Mandant 2x Diagnose macht (V6 nicht moeglich aber theoretisch V7+), kommt 2. Push als Update beim Business-System — V6 First-Touch-Lock blockiert das (Business-System-Side). **Mitigation**: V6 hat keinen Multi-Diagnose-Pfad — Idempotenz reicht.
- **R-106-5** DSGVO-Audit `consent_ip` koennte rechtlich diskutabel sein (IP als personenbezogenes Datum mit Speicher-Notwendigkeit). **Mitigation**: BL-094 AVV-Template + Datenschutz-Erklaerung muessen IP-Speicherung als Audit-Pflicht abbilden. Anwaltsreview kommt im Pre-Production-Compliance-Gate.
- **R-106-6** Timeout 10s ist relativ aggressiv — bei langsamem Netzwerk koennte Push faelschlich als Fail klassifiziert werden. **Mitigation**: Cross-System-Smoke misst typische Latency (erwartet < 1s); falls Latency hoeher: Timeout in V6.1 raufsetzen.
- **R-106-7** `notes`-Field zu lang oder zu kurz: Business-System koennte z.B. max 4096 chars erwarten. **Mitigation**: `buildNotesFromDiagnose` truncated auf 1500 chars + Vitest fuer Edge-Cases.

## Cross-Refs

- DEC-091 (V5 Pflicht-Privacy-Checkbox-Pattern + Re-Validation)
- DEC-107 (Outbound HTTP synchron + retry-Job-Fallback)
- DEC-112 (Lead-Push max. 3 Versuche mit Backoff 5min/30min)
- MIG-034 / Migration 092
- FEAT-046 (Spec)
- ARCHITECTURE.md V6-Sektion (Data Flow E — Lead-Push opt-in End-to-End)
- V5 SLC-079 (Pflicht-Privacy-Checkbox-UI als Vorlage)
- Business-System `cockpit/src/app/api/leads/intake/route.ts` (Endpoint-Spec, externes Repo)
- V4.2 SLC-048 + V5 BL-076 (Worker-Job-Handler-Pattern, Cron-Idempotenz-Pattern)

## Dependencies

- **Pre-Conditions**: SLC-101 done (Schema-Foundation), SLC-103 done (Mandanten-Tenant existiert mit `parent_partner_tenant_id` fuer Attribution), SLC-105 done (Diagnose-Bericht-Page als Einsprungspunkt fuer "Ich will mehr"-Klick).
- **Soft-Pre-Condition**: SLC-104 done (Branding-Resolver — Modal sieht Partner-Branding, nice-to-have aber nicht hart noetig).
- **Cross-System**: Business-System Lead-Intake-API muss erreichbar sein + API-Key vorhanden + Endpoint-Vertrag stabil (A-V6-2 Annahme).
- **Blockt**: keine V6-Slices (SLC-106 ist letzter V6-Slice).
- **Wird nicht blockiert von**: BL-095 (Inhalts-Workshop ist nur fuer SLC-105 relevant).
