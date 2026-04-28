# SLC-041 — Block-Review Schema + Worker-Pre-Filter + Approve/Reject Server-Actions

## Goal
Backend-Foundation fuer V4.1 Berater-Review-Workflow: neue Tabelle `block_review` mit RLS, Backfill, ON-INSERT-Trigger im `capture_event` (neue Mitarbeiter-Submits → `pending`), Worker-Pre-Filter im Handbuch-Snapshot-Worker, plus Server-Actions zum Approven/Rejecten von Bloecken. Pflicht-Gate: RLS-Test-Matrix erweitert um die neue Tabelle (4 Rollen × `block_review` = mind. 8 Test-Faelle). Pflicht-Gate: Worker-Backwards-Compat-Test (alte V4-Snapshots ohne `block_review`-Eintraege koennen weiter generiert werden).

## Feature
FEAT-029 (Berater-Review + Quality-Gate) — Backend-Anteil

## In Scope

### A — Migration MIG-028 / sql/migrations/079_block_review.sql
- Neue Tabelle `public.block_review`:
  - `id uuid PK DEFAULT gen_random_uuid()`
  - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `capture_session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE`
  - `block_key text NOT NULL`
  - `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))`
  - `reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`
  - `reviewed_at timestamptz`
  - `note text`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - `UNIQUE (tenant_id, capture_session_id, block_key)`
- Zwei Indizes:
  - `idx_block_review_status_created` partial WHERE `status='pending'` (fuer Cross-Tenant-Reviews-Sicht)
  - `idx_block_review_tenant_status` (tenant_id, status) (fuer Pro-Tenant-Aggregation)
- RLS aktivieren + 4 Policies:
  - SELECT fuer `strategaize_admin` (alle)
  - SELECT fuer `tenant_admin` (eigener Tenant)
  - INSERT/UPDATE/DELETE nur fuer `strategaize_admin`
  - DENY fuer `tenant_member` und `employee` (kein expliziter Eintrag = keine Berechtigung via RLS-Default)
- Updated_at Trigger via existierende `tg_set_updated_at()` Funktion (oder analog).
- Backfill-Step: `INSERT INTO block_review (tenant_id, capture_session_id, block_key, status) SELECT DISTINCT tenant_id, capture_session_id, block_key, 'approved' FROM knowledge_unit WHERE source='employee_questionnaire' ON CONFLICT (tenant_id, capture_session_id, block_key) DO NOTHING;`
- Trigger-Function `tg_block_review_pending_on_employee_submit()` und Trigger ON INSERT in `capture_event`:
  - Pruefe ob `NEW.payload->>'capture_mode' = 'employee_questionnaire'` und `NEW.event_type = 'block_submit'` (oder Aequivalent — finale Spalten-Abfrage je nach `capture_event`-Schema)
  - Wenn ja: Lookup von `tenant_id` + `capture_session_id` + `block_key`, dann `INSERT INTO block_review (..., status='pending') ON CONFLICT (tenant_id, capture_session_id, block_key) DO NOTHING` (laesst bestehende `approved`-Eintraege unberuehrt — KEIN Re-Reset)
  - Wrap in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING 'block_review trigger soft-fail: %', SQLERRM; END;` damit Bug im Trigger Mitarbeiter-Submits nicht blockiert (DEC-048 Soft-Fail)

### B — Worker-Pre-Filter im Handbuch-Worker
- Neuer Helper `src/workers/handbook/block-review-filter.ts`:
  - Function `loadApprovedBlockKeys(client, tenantId, captureSessionId): Promise<Set<string>>`
  - Liest alle `block_review` mit `status='approved'` fuer die Session
  - Returns `Set<block_key>`
  - Wenn keine Eintraege existieren: returns leeres Set, aber der Caller behandelt das wie "alle approved" (siehe Pre-Filter-Logik unten — Backwards-Compat)
- Aenderung in `src/workers/handbook/handle-snapshot-job.ts`:
  - Nach Lade-Phase 5 (KUs geladen), vor Phase 6 (renderHandbook):
    ```typescript
    const approvedBlockKeys = await loadApprovedBlockKeys(adminClient, snapshot.tenant_id, snapshot.capture_session_id);
    const hasAnyReviewData = approvedBlockKeys.size > 0
      || (await hasAnyBlockReviewRows(adminClient, snapshot.tenant_id, snapshot.capture_session_id));
    const filteredKus = hasAnyReviewData
      ? allKus.filter(ku => ku.source !== "employee_questionnaire" || approvedBlockKeys.has(ku.block_key))
      : allKus; // Backwards-Compat: alte Snapshots ohne block_review werden 1:1 generiert
    ```
  - Helper `hasAnyBlockReviewRows` checkt `SELECT EXISTS(...)` ob ueberhaupt Block-Reviews fuer die Session existieren
  - Audit-Field in `handbook_snapshot.metadata` schreiben: `{ pending_blocks: N, approved_blocks: M, rejected_blocks: K }` (UPDATE nach Snapshot-Generation)

### C — Approve/Reject Server-Actions + Server-Helper
- Neuer Pfad `src/app/admin/blocks/[blockKey]/review/actions.ts`:
  - `approveBlockReview(input: { tenantId, sessionId, blockKey, note? }): Promise<{ ok, error? }>`
    - strategaize_admin-Check via `requireRole('strategaize_admin')`
    - UPSERT `block_review` mit `status='approved', reviewed_by=auth.uid(), reviewed_at=now(), note=input.note, updated_at=now()`
    - Audit-Log via existierendem `logger.info`
    - revalidatePath
  - `rejectBlockReview(input)` analog mit `status='rejected'`
- Neuer Helper `src/lib/handbook/get-review-summary.ts`:
  - Function `getReviewSummary(tenantId, sessionId): Promise<{ approved, pending, rejected, totalEmployeeBlocks }>`
  - Aggregiert ueber `block_review` + `knowledge_unit` (employee_questionnaire-Bloecke)
  - Wird in SLC-042 vom TriggerHandbookButton verwendet, in SLC-043 fuer Reviews-Sichten

### D — RLS-Test-Matrix-Erweiterung
- Erweitere `src/lib/db/__tests__/admin-rls.test.ts` (oder neue Datei `src/lib/db/__tests__/block-review-rls.test.ts`):
  - 4 Rollen × `block_review`-Tabelle × {SELECT, INSERT, UPDATE, DELETE} = mind. 16 Test-Cases
  - Mindest-Coverage: 8 Test-Faelle (aus Architecture: 4 Rollen × ALLOW/DENY-Verifikation)
  - Tests gegen Live-DB via SSH-Tunnel-Pattern (IMP-178)
- `src/workers/handbook/__tests__/block-review-filter.test.ts`:
  - 3 Test-Cases:
    - Empty `block_review`-Tabelle → Worker generiert Snapshot wie pre-V4.1 (Backwards-Compat)
    - Mixed approved/pending Bloecke → nur approved Mitarbeiter-KUs im Snapshot, GF-KUs unbeeinflusst
    - All rejected → Mitarbeiter-KUs leer, GF-KUs vollstaendig

## Out of Scope
- Konsolidierter Review-View UI (SLC-042)
- TriggerHandbookButton Confirm-Dialog (SLC-042)
- Cockpit-Card "Mitarbeiter-Bloecke reviewed" (SLC-042)
- Cross-Tenant + Pro-Tenant Reviews-Sichten (SLC-043)
- Reader-Page (SLC-044)
- KU-granulares "Im Handbuch enthalten"-Flag (V4.2+)
- History-Tabelle fuer Status-Transitionen (V4.2+, DEC-050)

## Acceptance Criteria
- AC-1: `block_review`-Tabelle existiert in Live-DB mit allen Spalten + UNIQUE-Constraint + 2 Indizes (verifiziert via `\d block_review`).
- AC-2: RLS aktiv, 4 Policies live (verifiziert via `\d block_review` Policies-Sektion).
- AC-3: Backfill setzt fuer alle existierenden `(session, block)`-Kombinationen mit `source='employee_questionnaire'` KUs den Status `approved`. Idempotent (zweiter Backfill-Run aendert nichts).
- AC-4: Trigger ON INSERT in `capture_event` schreibt bei neuem Mitarbeiter-Submit einen `pending`-Eintrag. Bestehender `approved`-Eintrag wird NICHT zurueckgesetzt (ON CONFLICT DO NOTHING).
- AC-5: Trigger ist Soft-Fail (RAISE WARNING bei Exception, kein BLOCK). Verifiziert via Test mit absichtlich fehlerhaftem Payload.
- AC-6: `loadApprovedBlockKeys` returns korrekt Set<string> aller approved Block-Keys.
- AC-7: Worker-Pre-Filter: Mit `block_review`-Daten werden Mitarbeiter-KUs gefiltert; ohne Daten (leere Tabelle fuer Session) bleiben alle KUs erhalten (Backwards-Compat).
- AC-8: GF-KUs (`source != 'employee_questionnaire'`) sind vom Filter unbeeinflusst — verifiziert in 1 Test-Case.
- AC-9: Server-Actions `approveBlockReview` + `rejectBlockReview` erlauben nur `strategaize_admin` (verifiziert via Negativ-Test mit tenant_admin).
- AC-10: Server-Actions setzen `reviewed_by` + `reviewed_at` korrekt aus `auth.uid()` und `now()`.
- AC-11: `getReviewSummary` gibt `{ approved, pending, rejected, totalEmployeeBlocks }` zurueck — Aggregat ueber Block-Review-Tabelle joined mit knowledge_unit-Distinct.
- AC-12: 4-Rollen-RLS-Matrix-Erweiterung um `block_review`: mind. 8 Test-Faelle, 100% gruen gegen Live-DB.
- AC-13: `npm run build` + `npm run test` gruen.
- AC-14: handbook_snapshot.metadata enthaelt `{ pending_blocks, approved_blocks, rejected_blocks }` nach Worker-Lauf.

## Dependencies
- Vorbedingung: V4 released (FEAT-026, FEAT-022..024 deployed). MIG-023 + MIG-024..027 live.
- Kein vorgelagerter V4.1-Slice — SLC-041 ist der Backend-Foundation-Slice.
- Nachgelagerte V4.1-Slices: SLC-042 (Trigger-Dialog + Cockpit-Card brauchen `getReviewSummary`), SLC-043 (Reviews-Sichten brauchen `block_review`-Tabelle), SLC-044 (Reader liest `block_review_summary` aus snapshot.metadata).

## Worktree
Mandatory (SaaS).

## Migrations-Zuordnung
- MIG-028 / `sql/migrations/079_block_review.sql` — Tabelle + RLS + 2 Indizes + Backfill + Insert-Trigger.

## Pflicht-QA-Vorgaben
- **Pflicht-Gate: RLS-Test-Matrix erweitert** (mind. 8 Test-Faelle gegen Live-DB via SSH-Tunnel — siehe IMP-178 SSH-Tunnel-Pattern).
- **Pflicht-Gate: Worker-Backwards-Compat-Test** — SLC-039 V4-Snapshot kann ohne `block_review`-Daten reproduziert werden (1:1 Markdown-Output gegen pre-V4.1 Baseline).
- Trigger-Soft-Fail-Test (Exception im Trigger blockiert Mitarbeiter-Submit nicht).
- Backfill-Idempotenz-Test (zweiter Run aendert nichts).
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.
- Cockpit-Records-Update nach Slice-Ende (mandatory).

## Risks
- **R1 — Trigger-Function blockiert capture_event-INSERT bei Bug:** Mitigation = Soft-Fail-Wrap. Test verifiziert.
- **R2 — Backfill-Performance bei vielen Bestand-Tenants:** Mitigation = Backfill ist `INSERT ... SELECT DISTINCT` mit `ON CONFLICT DO NOTHING`, plant-Scan Postgres-effizient. Geschaetzt <100 Rows pro V4-Tenant.
- **R3 — Worker-Pre-Filter in Production verfaelscht alte Snapshots wenn re-generiert:** Mitigation = `hasAnyReviewData`-Check + Logging des Pre-Filter-Modus pro Job. Re-Generation alter Snapshots ist explizit ein User-Trigger, kein Auto-Lauf.
- **R4 — RLS-Policy-Drift gegenueber V4-Pattern:** Mitigation = RLS-Policies folgen exakt dem V4-Pattern aus MIG-024..026 (auth.user_role() + auth.user_tenant_id() Helpers).

### Micro-Tasks

#### MT-1: MIG-028 SQL schreiben + Live-Deploy
- Goal: `sql/migrations/079_block_review.sql` mit Tabelle + RLS + Indizes + Backfill + Trigger schreiben und auf Hetzner-DB ausfuehren.
- Files: `sql/migrations/079_block_review.sql` (neu), `docs/MIGRATIONS.md` (MIG-028 von "geplant" auf "live" umstellen nach Deploy)
- Expected behavior: Migration laeuft idempotent, RLS-Policies aktiv, Backfill setzt approved-Eintraege fuer alle Bestand-Mitarbeiter-Bloecke, Trigger feuert bei neuem capture_event.
- Verification: `\d block_review` zeigt Schema; `SELECT count(*) FROM block_review` > 0 nach Backfill (vorausgesetzt Demo-Tenant hat employee_questionnaire-KUs); `SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='tg_block_review_pending_on_employee_submit'` zeigt Trigger.
- Dependencies: keine
- Live-Deploy-Pattern: base64-pipe + `psql -U postgres` auf 159.69.207.29 (siehe IMP-167 SQL-Migration-Pattern, MIG-027 als Vorlage).

#### MT-2: Worker-Pre-Filter Helper + Integration
- Goal: `loadApprovedBlockKeys` Helper schreiben + Worker `handle-snapshot-job.ts` zwischen Lade-Phase und Render-Phase integrieren + Audit-Field in handbook_snapshot.metadata.
- Files: `src/workers/handbook/block-review-filter.ts` (neu), `src/workers/handbook/handle-snapshot-job.ts` (geaendert), `src/workers/handbook/__tests__/block-review-filter.test.ts` (neu)
- Expected behavior: Worker filtert Mitarbeiter-KUs durch approved-Set; Backwards-Compat-Logik aktiv (leere Tabelle = alle KUs durchlassen); GF-KUs unbeeinflusst; metadata enthaelt {pending,approved,rejected}-Counter.
- Verification: 3 Vitest-Test-Cases (empty / mixed / all-rejected) gruen; `npm run test src/workers/handbook` gruen.
- Dependencies: MT-1 (Schema muss existieren fuer Test-Setup)
- TDD-Note: TDD-Pflicht (SaaS) — Tests vor Implementation.

#### MT-3: Approve/Reject Server-Actions + getReviewSummary Helper
- Goal: Server-Actions in `src/app/admin/blocks/[blockKey]/review/actions.ts` + Helper `src/lib/handbook/get-review-summary.ts` mit Unit-Tests.
- Files: `src/app/admin/blocks/[blockKey]/review/actions.ts` (neu), `src/lib/handbook/get-review-summary.ts` (neu), `src/app/admin/blocks/[blockKey]/review/__tests__/actions.test.ts` (neu), `src/lib/handbook/__tests__/get-review-summary.test.ts` (neu)
- Expected behavior: Approve/Reject upsert `block_review` mit Audit-Feldern + Rolle-Check; getReviewSummary aggregiert korrekt; nur strategaize_admin darf approven/rejecten (Negativ-Test mit tenant_admin schlaegt fehl).
- Verification: Vitest gruen + `npm run build` ohne TS-Errors.
- Dependencies: MT-1 + MT-2

#### MT-4: RLS-Test-Matrix-Erweiterung
- Goal: 4-Rollen-RLS-Matrix um `block_review` erweitern (8+ Test-Faelle).
- Files: `src/lib/db/__tests__/block-review-rls.test.ts` (neu) ODER Erweiterung von `admin-rls.test.ts` falls Pattern dort
- Expected behavior: Pro Rolle (strategaize_admin, tenant_admin, tenant_member, employee) je 1 SELECT-Test gegen eigene+fremde Tenant-Daten + 1 INSERT/UPDATE-Test (DENY fuer alle ausser strategaize_admin). Tests laufen via SSH-Tunnel gegen Live-DB.
- Verification: `npm run test src/lib/db` gruen, alle 8+ Test-Faelle PASS gegen Live-DB.
- Dependencies: MT-1 (Schema live), MT-3 (Approve/Reject Server-Actions verfuegbar)
- Pflicht-Gate: dieser MT ist der 4-Rollen-RLS-Matrix-Beweis fuer SC-V4.1-12.
