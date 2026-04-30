# SLC-048 — Capture-Reminders Backend (Cron-Endpoint + SMTP + Unsubscribe)

## Goal
Backend-Implementation fuer V4.2 Capture-Reminders. Cron-Endpoint `/api/cron/capture-reminders` (POST mit `x-cron-secret`-Header), Werktage-Helper, SMTP-Send-Function fuer Stage-1- und Stage-2-Reminder-E-Mails, Unsubscribe-Endpoint mit Token-Auth, plus Coolify Scheduled Task Setup-Anleitung. `reminder_log` und `user_settings` Tabellen sind in MIG-029 (SLC-046) bereits live — SLC-048 ergaenzt nur den Code drumherum.

## Feature
FEAT-032 (Capture-Reminders) — Backend-Anteil

## In Scope

### A — Werktage-Helper

Pfad: `src/lib/reminders/workdays.ts` (neu)

```typescript
export function workdaysSince(start: Date, end: Date = new Date()): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++; // 0=Sun, 6=Sat
  }
  return count;
}
```

Mo-Fr ohne Holiday-Calendar (DEC-055).

### B — SMTP-Send-Function

Pfad: `src/lib/reminders/send-reminder.ts` (neu)

```typescript
type ReminderInput = {
  to: string;
  tenantName: string;
  stage: 'stage1' | 'stage2';
  unsubscribeToken: string;
  captureUrl: string;
};

export async function sendReminder(input: ReminderInput): Promise<{ ok: boolean; error?: string }>;
```

Verhalten:
- Q-V4.2-I-Entscheidung: Erst pruefen ob `@supabase/supabase-js` Custom-Send-Mail-API hat. Falls nicht: `nodemailer` direkt mit `SUPABASE_SMTP_HOST/PORT/USER/PASS`-ENVs (DEC-056).
- Subject Stage 1: `"Erinnerung: Du hast noch nicht angefangen"`
- Subject Stage 2: `"Letzte Erinnerung: Bitte starte deine Erfassung"`
- Body: HTML-Template (inline TS-String, Q-V4.2-J Empfehlung) mit:
  - Anrede mit Tenant-Name
  - Erklaerungs-Satz (kein "Achtung!"/"Letzte Chance"-Wording — Spam-Trigger vermeiden)
  - CTA-Button mit `captureUrl` (z.B. https://onboarding.../capture/start)
  - Unsubscribe-Link `https://onboarding.../api/unsubscribe/<token>` im Footer
- Returns `{ ok: true }` bei Send-Success, `{ ok: false, error: SMTP-Error-Message }` bei Failure.

### C — Cron-Endpoint

Pfad: `src/app/api/cron/capture-reminders/route.ts` (neu)

```typescript
export async function POST(req: Request) {
  // 1. Auth via x-cron-secret-Header
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    await logError('cron-auth-fail', 'warn');
    return new Response('Unauthorized', { status: 403 });
  }

  // 2. Lade Mitarbeiter-Kandidaten via service_role-Client
  const candidates = await loadInactiveEmployees();

  // 3. Pro Kandidat: Werktage berechnen + Stage bestimmen + Idempotenz pruefen + Send
  const results = await processReminders(candidates);

  // 4. Audit-Log in error_log (severity='info')
  await logError('cron:capture-reminders', 'info', results);

  return Response.json(results);
}
```

`loadInactiveEmployees()` Query (skizziert):
```sql
SELECT u.id AS user_id, u.email, ei.tenant_id, ei.accepted_at,
       t.name AS tenant_name,
       us.reminders_opt_out, us.unsubscribe_token
FROM auth.users u
JOIN employee_invitation ei ON ei.accepted_user_id = u.id AND ei.status='accepted'
JOIN tenants t ON t.id = ei.tenant_id
LEFT JOIN user_settings us ON us.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM block_checkpoint WHERE created_by = u.id)
```

`processReminders(candidates)` Logik:
- Pro Kandidat: `workdays = workdaysSince(accepted_at)`.
- Wenn `workdays >= 3 AND < 7` → Stage 1.
- Wenn `workdays >= 7` → Stage 2 (nur wenn noch nicht gesendet).
- Wenn `workdays >= 14` → kein Reminder (max. 2 Stufen).
- Pruefe `reminder_log` ON CONFLICT-Idempotenz: vor Send `INSERT (employee_user_id, reminder_stage, sent_date) ... ON CONFLICT DO NOTHING RETURNING id`. Wenn `id` zurueckkommt: User hatte heute noch keinen Reminder dieser Stufe → Send.
- Wenn `reminders_opt_out=true`: skip + INSERT log mit `status='skipped_opt_out'`.
- Sonst: `sendReminder()` aufrufen, log mit `status='sent'` oder `status='failed'`.
- Results-Aggregation: `{ stage1_sent, stage2_sent, skipped_opt_out, failed, errors: [] }`.

### D — Unsubscribe-Endpoint

Pfad: `src/app/api/unsubscribe/[token]/route.ts` (neu)

```typescript
export async function GET(req: Request, { params }: { params: { token: string } }) {
  // Service-Role-Lookup, kein Login noetig (DSGVO-konform)
  const settings = await db.query`
    UPDATE user_settings SET reminders_opt_out=true, updated_at=now()
    WHERE unsubscribe_token = ${params.token}
    RETURNING user_id
  `;

  if (settings.rowCount === 0) {
    // Invalid token — neutrale Response, kein Token-Existence-Leak
    return new Response(unsubscribeInvalidPage(), { status: 404, headers: { 'Content-Type': 'text/html' } });
  }

  return new Response(unsubscribeSuccessPage(), { status: 200, headers: { 'Content-Type': 'text/html' } });
}
```

Response-HTML: minimale statische Seite mit Bestaetigung "Du wirst keine weiteren Reminder bekommen" + Link zur Plattform-Hauptseite.

### E — ENV-Setup

Neue ENV-Variable: `CRON_SECRET` (32+-char Hex-String).

In `.env.deploy.example` ergaenzen mit Hinweis. Vor /deploy V4.2 muss User in Coolify ENV setzen.

### F — Tests

- `src/lib/reminders/__tests__/workdays.test.ts` (neu): 6 Test-Cases (Mo-Fr-Spannen, Wochenend-Boundary, gleicher Tag).
- `src/lib/reminders/__tests__/send-reminder.test.ts` (neu): 3 Test-Cases mit Mock-SMTP — Success, Failure, beide Stages.
- `src/app/api/cron/capture-reminders/__tests__/route.test.ts` (neu): 5 Test-Cases mit DB-Mock:
  - Auth-Fail: 403 zurueck.
  - Idempotenz: zwei Calls am selben Tag → 0 Doppel-Mails (Pflicht-Test).
  - Stage-1-Trigger nach 3 Werktagen.
  - Stage-2-Trigger nach 7 Werktagen.
  - Opt-Out-Skip.
- `src/app/api/unsubscribe/[token]/__tests__/route.test.ts` (neu): 2 Test-Cases — valid Token + invalid Token (404 ohne Existence-Leak).

### G — Coolify-Cron-Setup-Anleitung

In `/reports/RPT-114.md` (Slice-Planning-Report) ODER `/docs/RELEASES.md` ODER eigenes File `docs/V4.2-DEPLOY-CHECKLIST.md` — Coolify Scheduled Task Tabelle als Pflicht-Item fuer /deploy V4.2:

| Feld | Wert |
|------|------|
| Name | `capture-reminders-daily` |
| Command | `node -e "fetch('http://localhost:3000/api/cron/capture-reminders', { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then(r => r.json()).then(console.log).catch(console.error)"` |
| Frequency | `0 9 * * *` |
| Container | `app` |

Plus Hinweis: ENV `CRON_SECRET` muss vor erstem Cron-Run in Coolify gesetzt sein.

## Out of Scope

- In-App-Badge "Mitarbeiter ohne Aktivitaet" (SLC-049)
- Mitarbeiter-Liste-Filter `?filter=inactive` (SLC-049)
- User-Settings-UI / Opt-Out-Toggle (SLC-049)
- Help-Sheet (SLC-050)
- Reminder-Customization durch tenant_admin (V4.3+)
- Eskalation an Berater (V5+)
- Multi-Channel (Slack, Teams) (V5+)
- E-Mail an tenant_admin selbst (DEC-054 explizit nein)

## Acceptance Criteria

- AC-1: `workdaysSince`-Helper liefert korrekte Werktage (Mo-Fr, Wochenenden = 0). 6 Tests gruen.
- AC-2: `sendReminder` sendet Stage-1- und Stage-2-Mails ueber SMTP. Mock-Tests gruen.
- AC-3: Cron-Endpoint `/api/cron/capture-reminders` ist POST-only.
- AC-4: Cron-Endpoint validiert `x-cron-secret`-Header gegen ENV `CRON_SECRET`. Bei Mismatch: 403 + error_log severity='warn'.
- AC-5: Cron-Endpoint laedt Mitarbeiter-Kandidaten via service_role-Client (RLS-Bypass legitim, da Cron-System-Aufruf).
- AC-6: Pro Kandidat berechnet Werktage seit `accepted_at`, klassifiziert in stage1 (3-7 Werktage) / stage2 (>=7 Werktage) / skip (<3 oder >=14).
- AC-7: Idempotenz: zwei Cron-Calls am selben Tag senden 0 Doppel-Mails (UNIQUE-Constraint auf reminder_log greift via INSERT ON CONFLICT DO NOTHING).
- AC-8: Opt-Out: Mitarbeiter mit `user_settings.reminders_opt_out=true` wird mit `status='skipped_opt_out'` geloggt, kein Send.
- AC-9: Audit-Log: pro Cron-Run wird in `error_log` ein Eintrag mit `severity='info'` und JSON-Metadata `{stage1_sent, stage2_sent, skipped_opt_out, failed}` geschrieben.
- AC-10: Response JSON enthaelt `{stage1_sent, stage2_sent, skipped_opt_out, failed}`.
- AC-11: Unsubscribe-Endpoint `/api/unsubscribe/[token]` ist GET.
- AC-12: Unsubscribe mit valid Token → UPDATE `user_settings.reminders_opt_out=true` + 200 Success-Page.
- AC-13: Unsubscribe mit invalid Token → 404 mit neutraler Page (kein Existence-Leak).
- AC-14: ENV `CRON_SECRET` ist in `.env.deploy.example` dokumentiert mit Hinweis "must be set before first cron run".
- AC-15: Coolify-Cron-Setup-Anleitung als Tabelle (Name + Command + Frequency + Container) im Slice-Report dokumentiert (feedback_cron_job_instructions).
- AC-16: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: SLC-046 done — MIG-029 deployed (reminder_log + user_settings + Trigger live).
- Vorbedingung: V1.1 `error_log`-Tabelle existiert (V1.1 done).
- Vorbedingung: V4 employee_invitation existiert (V4 done).
- Nachgelagerte V4.2-Slices: SLC-049 (UI fuer Opt-Out + Inactive-Badge nutzt user_settings), SLC-050 (Help — unabhaengig).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine zusaetzliche Migration — reminder_log und user_settings sind in MIG-029 (SLC-046) bereits live.

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Cron-Idempotenz-Test** (zwei Cron-Runs am selben Tag → 0 Doppel-Mails). Pflicht-AC fuer SC-V4.2-12.
- **Pflicht-Gate: Werktage-Helper-Test** mit Wochenend-Boundary-Faellen.
- **Pflicht-Gate: SPF/DKIM-Pre-Check** auf onboarding.strategaizetransition.com. Eigener Maintenance-Sprint, NICHT V4.2-Slice. Falls SPF/DKIM fehlt: Reminder-Mails landen im Spam → Slice-Wert eingeschraenkt. /qa SLC-048 prueft DNS-Records, dokumentiert Issue, schliesst nur ab wenn DKIM-Signing aktiv.
- **Pflicht-Gate: Live-SMTP-Test** mit echtem Test-Account. Test-Mitarbeiter-User mit `accepted_at = today - 3 Werktage` anlegen, Cron-Endpoint manuell triggern, Mail-Empfang verifizieren.
- **Pflicht-Gate: Coolify-Cron-Setup-Anleitung** als Tabelle im Slice-Report (feedback_cron_job_instructions).
- 4-Rollen-RLS-Matrix bleibt unveraendert PASS (Schema steht aus SLC-046).
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — SMTP-Reputations-Issue:** Self-hosted Supabase-SMTP koennte Spam-Reputation haben. Mitigation = neutrale Subject-Lines, SPF/DKIM-Pre-Check vor Live-Cron-Setup. Wenn schlecht: V4.3+ Migration auf Resend/SES.
- **R2 — Cron-Volume-Spike:** Bei vielen Tenants koennten >50 Reminders/Tag entstehen. Mitigation = Cron-Run loggt Warning bei Volume-Schwelle. Hard-Limit ist Supabase-SMTP-Provider-abhaengig.
- **R3 — Service-Role-Client falsch konfiguriert:** Cron-Endpoint nutzt service_role mit RLS-Bypass. Mitigation = service_role-Key kommt aus ENV (existing Pattern), Cross-Tenant-Lookup ist explizit erwuenscht.
- **R4 — `block_checkpoint`-Lookup-Performance:** `NOT EXISTS`-Subquery laeuft ueber alle Mitarbeiter-INSERT-Verlauf. Mitigation = Index `idx_block_checkpoint_created_by` (existing) deckt das ab.
- **R5 — CRON_SECRET wird in Coolify nicht gesetzt:** Cron-Endpoint waere unauthentifiziert oder gibt 403 zurueck. Mitigation = Setup-Anleitung im Slice-Report + AC-14 dokumentiert ENV-Pflicht.

### Micro-Tasks

#### MT-1: Werktage-Helper + Tests
- Goal: `src/lib/reminders/workdays.ts` mit `workdaysSince`-Function + 6 Vitest-Tests.
- Files: `src/lib/reminders/workdays.ts` (neu), `src/lib/reminders/__tests__/workdays.test.ts` (neu)
- Expected behavior: Mo-Fr-Counter, Wochenende = 0, gleicher Tag = 0, sliding window korrekt.
- Verification: `npm run test src/lib/reminders` gruen.
- Dependencies: keine
- TDD-Note: TDD-Pflicht — Tests vor Implementation.

#### MT-2: sendReminder-Function + SMTP-Library-Wahl (Q-V4.2-I)
- Goal: `src/lib/reminders/send-reminder.ts` mit Stage-1- und Stage-2-Templates + SMTP-Send. Q-V4.2-I in dieser MT entscheiden: erst Supabase-SDK pruefen, Fallback nodemailer.
- Files: `src/lib/reminders/send-reminder.ts` (neu), `src/lib/reminders/__tests__/send-reminder.test.ts` (neu), eventuell `package.json` (falls nodemailer noetig)
- Expected behavior: Mock-SMTP-Test sendet Stage-1- und Stage-2-Mail mit korrekten Subjects + Body + Unsubscribe-Link.
- Verification: 3 Vitest-Tests gruen. Falls nodemailer: Build muss gruen sein nach `npm install nodemailer`.
- Dependencies: keine

#### MT-3: Cron-Endpoint mit Idempotenz-Logic
- Goal: `src/app/api/cron/capture-reminders/route.ts` mit Auth + Kandidaten-Lookup + Stage-Berechnung + INSERT-ON-CONFLICT-Idempotenz + Audit-Log.
- Files: `src/app/api/cron/capture-reminders/route.ts` (neu), `src/app/api/cron/capture-reminders/__tests__/route.test.ts` (neu)
- Expected behavior: 403 bei Auth-Fail, korrekte Stage-Bestimmung, Idempotenz-Check (zweiter Run am selben Tag = 0 Doppel-Mails), Opt-Out-Skip, Audit-Log.
- Verification: 5 Vitest-Tests mit DB-Mock + Mock-SMTP. **Pflicht-Test: Idempotenz** (SC-V4.2-12).
- Dependencies: MT-1, MT-2

#### MT-4: Unsubscribe-Endpoint
- Goal: `src/app/api/unsubscribe/[token]/route.ts` mit Token-Lookup + UPDATE + neutralen Response-Pages.
- Files: `src/app/api/unsubscribe/[token]/route.ts` (neu), `src/app/api/unsubscribe/[token]/__tests__/route.test.ts` (neu)
- Expected behavior: Valid Token → UPDATE `reminders_opt_out=true` + 200 Success-Page. Invalid Token → 404 neutrale Page.
- Verification: 2 Vitest-Tests gruen.
- Dependencies: SLC-046 (user_settings + unsubscribe_token Schema live)

#### MT-5: Live-SMTP-Test mit Test-Mitarbeiter
- Goal: End-to-End-Verifikation: Test-Mitarbeiter-User anlegen mit `accepted_at = today - 3 Werktage`, Cron-Endpoint via curl/fetch triggern, Mail-Empfang verifizieren.
- Files: keine (Test-Dokumentation in Slice-Report + Screenshots in /reports/RPT-XXX-test-evidence/)
- Expected behavior: Mail kommt im Test-Postfach an mit korrektem Subject + Body + Unsubscribe-Link. reminder_log enthaelt Eintrag.
- Verification: User-Bestaetigung + Screenshot.
- Dependencies: MT-3 (Cron-Endpoint live), MT-4 (Unsubscribe-Endpoint live).
- Pflicht-Gate: dieser MT ist der Live-Smoke-Beweis.

#### MT-6: SPF/DKIM-Audit
- Goal: DNS-Pre-Check fuer Server-Domain. Pflicht-Vorbereitung fuer V4.2-Production-Deploy.
- Files: keine (Audit-Dokumentation in Slice-Report)
- Expected behavior: DNS-Records von onboarding.strategaizetransition.com pruefen: SPF (`v=spf1 ...`), DKIM (`default._domainkey...` TXT-Record). Wenn fehlt: ISSUE-XXX in KNOWN_ISSUES.md anlegen + V4.2-Pre-Deploy-Pflicht.
- Verification: User-Bestaetigung des DNS-Stands + (falls fehlt) ISSUE in KNOWN_ISSUES.md.
- Dependencies: keine
- Pflicht-Gate: dieser MT ist Pre-Deploy-Pflicht.

#### MT-7: Coolify-Cron-Setup-Anleitung
- Goal: Tabelle mit Name + Command + Frequency + Container im Slice-Report dokumentieren.
- Files: `/reports/RPT-XXX.md` (Slice-Completion-Report nach SLC-048 done)
- Expected behavior: Tabelle ist klar, copy-paste-faehig fuer Coolify-UI.
- Verification: Tabelle vorhanden im Report + User-Bestaetigung "kann ich nachvollziehen".
- Dependencies: alle MTs done.
