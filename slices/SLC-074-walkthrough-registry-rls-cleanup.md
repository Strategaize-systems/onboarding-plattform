# SLC-074 — Walkthrough Registry-Update + 16-Faelle-RLS-Matrix + Cleanup-Cron

## Goal

V5-Abschluss-Slice. Capture-Mode-Registry-Update (`walkthrough` als produktiver UI-Eintrag, `walkthrough_stub` aus UI entfernt — Code bleibt als Architektur-Beispiel). Vollstaendige 4-Rollen-RLS-Test-Matrix (16 Faelle, SAVEPOINT-Pattern, Vitest gegen Coolify-DB) als SC-V5-4-Pflicht-Gate. Coolify-Scheduled-Task `walkthrough-cleanup-daily` fuer rejected (30d-Retention) + failed (7d-Retention) Storage-Cleanup. Lint/Build/Test alle gruen als V5-Release-Gate.

## Feature

FEAT-034 + FEAT-035 + FEAT-036 — Abschluss / SC-V5-4 + V5-Release-Gate.

## In Scope

### A — Capture-Mode-Registry-Update

Pfad: `src/lib/capture-modes/registry.ts` (modify) — Pfad existiert seit V4 SLC-038. Genauer Pfad pruefen via Code-Suche.

Aenderungen:
- Neuer produktiver Eintrag `walkthrough`:
  - `id: 'walkthrough'`
  - `label: 'Walkthrough'`
  - `description: 'Bildschirm + Mikrofon aufzeichnen — bis zu 30 Minuten'`
  - `icon: <relevantes Icon, z.B. ScreenRecord oder Camera>`
  - `route: (captureSessionId) => /employee/capture/walkthrough/${captureSessionId}`
  - `enabled: true`
- Bestehender Eintrag `walkthrough_stub`:
  - `enabled: false` (UI-Anzeige weg)
  - Code-Komponenten unter `src/components/capture-modes/walkthrough_stub/` bleiben unveraendert (Architektur-Beispiel-Doku).
  - Code-Kommentar im Registry-Eintrag: `// V4-Spike, ersetzt durch 'walkthrough' in V5 — Code bleibt als Architektur-Beispiel`.
- Sortier-Reihenfolge: `walkthrough` erscheint zwischen `evidence` und `dialogue` (oder gemaess existierender UX-Reihenfolge — User-Praeferenz wird im Slice-Report dokumentiert).

### B — Vollstaendige 4-Rollen-RLS-Test-Matrix (16 Faelle)

Pfad: `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (extend, von SLC-071 + SLC-073 partial-Versionen auf vollstaendig).

**Matrix:**

| # | Rolle | Operation | Subject | Erwartet |
|---|-------|-----------|---------|----------|
| 1 | strategaize_admin | SELECT | foreign-tenant Walkthrough | ALLOW |
| 2 | strategaize_admin | INSERT | als foreign-tenant | ALLOW (admin override) |
| 3 | strategaize_admin | UPDATE (approve) | foreign-tenant pending | ALLOW |
| 4 | strategaize_admin | UPDATE (status='transcribing') | service-role required | DENY (bewusst — Admin nicht fuer Worker-Stati) |
| 5 | tenant_admin | SELECT | eigener Tenant Walkthrough | ALLOW |
| 6 | tenant_admin | INSERT | eigener Tenant own user_id | ALLOW |
| 7 | tenant_admin | UPDATE (approve) | eigener Tenant pending | ALLOW |
| 8 | tenant_admin | SELECT | foreign-tenant Walkthrough | DENY |
| 9 | tenant_member | SELECT | eigene aufgenommene Session | ALLOW |
| 10 | tenant_member | SELECT | fremde Session (im selben Tenant) | DENY |
| 11 | tenant_member | INSERT | als eigener User | ALLOW |
| 12 | tenant_member | UPDATE (approve) | eigene Session | DENY |
| 13 | employee | SELECT | eigene aufgenommene Session | ALLOW |
| 14 | employee | SELECT | fremde Session | DENY |
| 15 | employee | INSERT | als eigener User | ALLOW |
| 16 | employee | UPDATE (approve) | eigene Session | DENY |

**Implementierung-Pattern (per coolify-test-setup.md):**
- Test-Datenbank = Coolify-Live-DB (oder Branch-DB). SSH-Tunnel-Pattern.
- Pro Test: SAVEPOINT vor erwartetem Permission-Denial, ROLLBACK TO SAVEPOINT danach (verhindert Tx-Abort).
- Test-Setup: vor Suite ein Test-Tenant + Test-Walkthrough-Sessions in 4 Rollen-Konstellationen erzeugen, nach Suite cleanup.
- 16 it-Bloecke, 1:1-Mapping zur Matrix oben.

### C — Cleanup-Cron `walkthrough-cleanup-daily`

Pfad: `src/app/api/cron/walkthrough-cleanup/route.ts` (neu, GET, CRON_SECRET-protected).

```typescript
GET /api/cron/walkthrough-cleanup
Authorization: Bearer <CRON_SECRET>
```

Verhalten:
- CRON_SECRET-Validation (existing pattern aus capture-reminders).
- Query 1 — rejected: `SELECT id, storage_path FROM walkthrough_session WHERE status='rejected' AND reviewed_at < NOW() - INTERVAL '30 days'`.
- Query 2 — failed: `SELECT id, storage_path FROM walkthrough_session WHERE status='failed' AND created_at < NOW() - INTERVAL '7 days'`.
- Query 3 — stale-transcribing: `SELECT id FROM walkthrough_session WHERE status='transcribing' AND transcript_started_at < NOW() - INTERVAL '1 hour'` → mark als `failed` (Recovery-Pfad fuer Worker-Crashes, R3 aus SLC-072).
- Pro Eintrag aus Q1+Q2: `supabaseAdmin.storage.from('walkthroughs').remove([storage_path])` + `DELETE FROM walkthrough_session WHERE id=...`.
- Pro Eintrag aus Q3: `UPDATE walkthrough_session SET status='failed' WHERE id=...`.
- error_log INSERT mit `category='walkthrough_cleanup'`, `level='info'`, `metadata={ rejected_count, failed_count, stale_count }`.
- Idempotent: Re-Run am gleichen Tag findet nichts (oder gleiche Items mit `< NOW() - INTERVAL`).
- Returns `{ ok: true, rejected_count, failed_count, stale_count }`.

### D — Coolify-Scheduled-Task-Setup

Cron-Anlage durch User in Coolify (analog feedback_cron_job_instructions):

| Property | Wert |
|----------|------|
| Container | app |
| Name | walkthrough-cleanup-daily |
| Schedule | `0 3 * * *` (3:00 Uhr Europe/Berlin) |
| Command | `node -e "fetch('http://localhost:3000/api/cron/walkthrough-cleanup', {method:'GET', headers:{Authorization: 'Bearer ' + process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log).catch(e=>{console.error(e); process.exit(1)})"` |

Slice-Report dokumentiert Cron-ID (Coolify-UI-Link) + ersten Erfolgs-Run-Timestamp + Bestaetigung der Idempotenz (zweiter manueller Run am gleichen Tag findet nichts).

### E — Tests

- `src/app/api/cron/__tests__/walkthrough-cleanup.test.ts` (neu):
  - happy path (kein Permission-Denial): rejected age > 30d → DELETE; failed age > 7d → DELETE; stale-transcribing > 1h → status='failed'.
  - Idempotenz: zweiter Run am gleichen Tag findet 0 Eintraege (alle bereits geloescht).
  - CRON_SECRET-Mismatch → HTTP 401.
- `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (vollstaendig 16 Cases): siehe B.
- BL-076-Mid-Stream-Hotfix-Slot: SLC-074 selbst nimmt KEINEN BL-076-Code mit (klare Slice-Trennung). BL-076-Hotfix laeuft als eigene atomare Aenderung **vor** SLC-074-Beginn — siehe Execution-Order in `slices/INDEX.md`.

### F — V5-Release-Gate (Lint/Build/Test gruen)

- `npm run lint` → 0 Errors, 0 Warnings (V4.4 SLC-061-Standard).
- `npm run build` → ohne neue Warnings.
- `npm run test` → alle Vitest-Suites PASS inkl. 16-Faelle-RLS-Matrix.
- `npm audit --omit=dev` → 0 Vulnerabilities.

## Out of Scope

- Walkthrough-Capture-UI (SLC-071)
- Worker-Handler (SLC-072)
- Berater-Review-UI (SLC-073)
- KI-Pfad / V5.1
- BL-076 Cron-Idempotenz-Hotfix (laeuft VOR SLC-074 als eigene Aenderung — siehe slices/INDEX.md V5 Execution Order)
- Walkthrough-Embed im Handbuch-Reader (V5.1+ via FEAT-038)
- Re-Open-Pfad fuer rejected (V5.2+)

## Acceptance Criteria

- AC-1: `walkthrough` ist im Capture-Mode-Registry als produktiver Mode verfuegbar (`enabled: true`).
- AC-2: `walkthrough_stub` ist im Registry deaktiviert (`enabled: false`); UI zeigt es nicht mehr in Mode-Auswahl.
- AC-3: Code unter `src/components/capture-modes/walkthrough_stub/` bleibt unveraendert (Architektur-Beispiel-Erhalt, dokumentiert SC-V4-6).
- AC-4: 16-Faelle-RLS-Test-Matrix existiert in `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` und ist 100% PASS gegen Live-DB (SC-V5-4-Pflicht-Gate).
- AC-5: SAVEPOINT-Pattern in allen DENY-Tests (Tx bleibt nutzbar nach erwartetem Permission-Denial).
- AC-6: Cleanup-Cron-Endpoint `/api/cron/walkthrough-cleanup` deployed und CRON_SECRET-validiert.
- AC-7: Cleanup-Cron-Logik:
  - rejected age > 30d → Storage-Delete + DB-Delete
  - failed age > 7d → Storage-Delete + DB-Delete
  - stale-transcribing > 1h → status='failed' (kein Storage-Delete sofort, R3-Recovery-Pfad)
- AC-8: Cleanup-Cron ist idempotent (zweiter Run am gleichen Tag findet 0 Eintraege).
- AC-9: error_log-Eintrag mit category='walkthrough_cleanup' bei jedem Cron-Run.
- AC-10: Coolify-Scheduled-Task `walkthrough-cleanup-daily` angelegt (User-Pflicht), Cron-ID + erster Run-Timestamp im Slice-Report dokumentiert.
- AC-11: Mindestens ein erfolgreicher Cron-Live-Run nach Deploy.
- AC-12: 3 Vitest-Cron-Test-Cases gruen (happy + idempotency + auth).
- AC-13: `npm run lint` 0/0 + `npm run build` + `npm run test` + `npm audit --omit=dev` = 0 Vulns.
- AC-14: SC-V5-1 Mitarbeiter-Self-Test (Nicht-Tech-User-Persona-Smoke ueber gesamten Capture-Pfad: Permission-Prompts → Recording → Stop → Upload → Status → Transkript) im Slice-Report dokumentiert (User-Pflicht).
- AC-15: SC-V5-3 Berater-Review-Smoke ueber alle 3 Routen (cross-tenant, per-tenant, detail) inkl. Approve+Reject mit + ohne Checkbox (User-Pflicht).
- AC-16: Pflicht-Gates fuer V5-Release alle PASS (siehe Pflicht-QA-Vorgaben).

## Dependencies

- Vorbedingung: SLC-071 + SLC-072 + SLC-073 done.
- Vorbedingung: BL-076 Cron-Idempotenz-Hotfix VOR SLC-074-Beginn fertig (Pattern fuer Cleanup-Cron muss aus BL-076 kommen).
- Voraussetzung fuer V5 Gesamt-/qa + /final-check + /go-live + /deploy.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — SLC-074 nutzt das in SLC-071 deployed Schema.

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: SC-V5-4 RLS-Matrix gruen** (16 Faelle Vitest gegen Coolify-DB).
- **Pflicht-Gate: SC-V5-1 Mitarbeiter-Self-Test** (Nicht-Tech-User-Smoke gesamter Capture-Pfad — User selbst).
- **Pflicht-Gate: SC-V5-3 Berater-Review-Smoke** alle 3 Routen, Approve+Reject mit + ohne Checkbox.
- **Pflicht-Gate: SC-V5-5 Code-Quality** — 0 Lint-Errors, 0 Lint-Warnings, alle Vitest gruen, 0 Vulns.
- **Pflicht-Gate: Cleanup-Cron-Live-Smoke** — mindestens 1 erfolgreicher Run dokumentiert, idempotent verifiziert.
- **Pflicht-Gate: Cron-Anlage-Anleitung** im Slice-Report (Tabelle + Bestaetigung-Pattern aus feedback_cron_job_instructions).
- **Pflicht-Gate: Walkthrough-Stub-UI-Removal verifiziert** (Mode-Auswahl im Mitarbeiter-Capture-Pfad zeigt `walkthrough_stub` nicht mehr).
- **Pflicht-Gate: Backwards-Compat** existing Capture-Modi (questionnaire, evidence, dialogue, employee_questionnaire) weiter sichtbar+nutzbar.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-074 status `done`, planning/backlog.json BL-077..080 alle → `done` (FEAT-034..036 vollstaendig done), STATE.md Phase auf `qa` (Gesamt-V5-/qa) oder `final-check` (je nach Gesamt-/qa-Ergebnis).

## Risks

- **R1 — RLS-Test-Matrix faengt einen real existierenden Permission-Bug erst hier**: Mitigation = SLC-071/SLC-073 hatten partial-Tests, SLC-074 ist die Vollabdeckung. Findings werden als Hotfix in SLC-074 selbst gefixt (kein Re-Open eines V5-Slice).
- **R2 — Cleanup-Cron loescht zu aggressiv (Berater hatte 30d nicht reviewed → wuerde Cron rejected loeschen?)**: Mitigation = Cron loescht NUR `status IN ('rejected', 'failed')`, NICHT `pending_review`. Berater-Review-Backlog bleibt unangetastet. Test-Case verifiziert.
- **R3 — Cron-CRON_SECRET-Verlust waehrend Coolify-Deploy**: Mitigation = ENV-Pruefung im Slice-Report (`docker exec <app-container> printenv | grep CRON_SECRET`).
- **R4 — Storage-Delete schlaegt fehl (Bucket-Permission)**: Mitigation = service_role-Delete-Policy aus 084-Migration; Test mit Mock-Fail verifiziert dass DB-Delete NICHT vor erfolgreichem Storage-Delete erfolgt (transactional).
- **R5 — Walkthrough-Stub-Removal bricht V4-Code-Pfade**: Mitigation = Stub-Code unter `src/components/capture-modes/walkthrough_stub/` bleibt erhalten — nur Registry-Eintrag deaktiviert. V4-Tests die `walkthrough_stub` als Pseudo-Mode referenzieren laufen weiter. Verifiziert via Backwards-Compat-Lauf.

### Micro-Tasks

#### MT-1: Capture-Mode-Registry-Update
- Goal: `walkthrough` produktiv aktivieren, `walkthrough_stub` UI-deaktivieren (Code bleibt).
- Files: `src/lib/capture-modes/registry.ts` (modify, exact path via Code-Suche zu bestaetigen), `src/components/capture-modes/walkthrough_stub/*` UNVERAENDERT.
- Expected behavior: Mode-Auswahl im Mitarbeiter-Capture-UI zeigt 5 produktive Modes (questionnaire, evidence, dialogue, employee_questionnaire, walkthrough). `walkthrough_stub` nicht mehr sichtbar.
- Verification: Browser-Smoke des Mitarbeiter-Capture-Pfads. Vitest-Snapshot-Test fuer Registry-Output.
- Dependencies: SLC-071 + SLC-072 + SLC-073 alle done.

#### MT-2: 16-Faelle-RLS-Test-Matrix
- Goal: Vollstaendige Matrix in `src/lib/db/__tests__/v5-walkthrough-rls.test.ts`.
- Files: `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (extend von partial in SLC-071+SLC-073 auf 16 Cases).
- Expected behavior: Alle 16 Cases gruen gegen Live-DB. SAVEPOINT-Pattern in allen DENY-Cases.
- Verification: `npm run test src/lib/db/__tests__/v5-walkthrough-rls.test.ts` 16/16 PASS.
- Dependencies: SLC-071 RLS-Schema live, SLC-073 UPDATE-Policy.
- TDD-Note: Tests sind Pflicht-Beweis fuer SC-V5-4.

#### MT-3: Cleanup-Cron-Endpoint + Tests
- Goal: `/api/cron/walkthrough-cleanup` mit CRON_SECRET, 3 Queries (rejected/failed/stale-transcribing), Storage+DB-Delete, error_log.
- Files: `src/app/api/cron/walkthrough-cleanup/route.ts` (neu), `src/app/api/cron/__tests__/walkthrough-cleanup.test.ts` (neu, +3 Cases).
- Expected behavior: GET mit Bearer-Token findet alle 3 Cleanup-Kategorien. Idempotent. Returns Counts.
- Verification: 3 Vitest-Cases (happy + idempotency + auth-fail).
- Dependencies: SLC-071 Schema. BL-076-Hotfix muss VORHER fertig sein (Pattern fuer Cleanup-Cron).
- TDD-Note: TDD-Pflicht.

#### MT-4: Coolify-Scheduled-Task-Anlage
- Goal: User legt Cron in Coolify an (`0 3 * * *`, Container `app`, Command-Tabelle siehe oben).
- Files: keine — Coolify-UI-Aktion. Slice-Report dokumentiert Cron-ID + Setup-Screenshot + erster Erfolgs-Run.
- Expected behavior: Erster Cron-Run um 3:00 Uhr produziert error_log-Eintrag. Idempotenz verifiziert (zweiter Run am gleichen Tag findet 0 Eintraege).
- Verification: `SELECT * FROM error_log WHERE category='walkthrough_cleanup' ORDER BY created_at DESC LIMIT 5`.
- Dependencies: MT-3 deployed auf Coolify (User-Pflicht: manueller Coolify-Deploy nach MT-3).

#### MT-5: V5-Release-Gate (Lint/Build/Test/Audit)
- Goal: Alle Quality-Gates gruen als V5-Release-Voraussetzung.
- Files: keine — nur Verifikation.
- Expected behavior: 0 Lint-Errors, 0 Lint-Warnings, Build ohne neue Warnings, Vitest 100% PASS, `npm audit --omit=dev` 0 Vulns.
- Verification: Output-Snapshots im Slice-Report.
- Dependencies: MT-1..MT-4 alle done.
