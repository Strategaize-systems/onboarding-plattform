# SLC-168 — V9 Handbuch-Integration + Audit/Cost-Aggregation + Source-Attribution-View (FEAT-074)

**Version:** V9
**Feature:** FEAT-074 (Handbuch-Integration + Audit/Cost-Tracking)
**Backlog:** BL-151
**Status:** planned
**Created:** 2026-06-01
**Priority:** High
**Estimate:** ~4-5 MTs, ~2-3 Tage Code-Side + Vitest gegen Coolify-DB
**Worktree Branch:** `v9-bulk-email-import` (gleicher Cumulative-Branch wie SLC-165/166/167)

## Slice Goal

Liefert die **Finalstufe** der V9-Pipeline: akzeptierte Pattern -> V4.1-Handbuch-Snapshot + Source-Attribution + vollstaendiger Audit-Trail.

1. **Idempotenter Handbuch-Import** als Server-Action (DEC-178 Stufe 8 sync): `importToHandbook(bulk_run_id)` uebersetzt `email_pattern WHERE curation_status='accepted' AND imported_to_handbook_at IS NULL` in `knowledge_unit`-Rows mit Source-Attribution-Metadata.
2. **Handbuch-Snapshot-Trigger**: Nach Pattern-Import wird neuer `handbook_snapshot` erzeugt (Reuse FEAT-028 Snapshot-Mechanik).
3. **Source-Attribution-View** im V4.1-Handbuch-Reader: pro `knowledge_unit` mit `metadata.source_type='email_bulk'` neue "Quelle"-Sub-Sektion mit Link zur Bulk-Run-Detail-View.
4. **Bulk-Run-Detail-Page Final-Stats**: total_emails, content_emails, threads, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur.
5. **Admin-Audit-Cross-Tenant-View**: strategaize_admin sieht Cross-Tenant-Audit, tenant_admin sieht eigenen.
6. **Vitest Idempotenz + RLS**.

Output: V9.0 ist code-side komplett. Bulk-Run-Status=`completed`. Pattern sind im V4.1-Handbuch-Reader konsumierbar mit Pseudonym-Source-Attribution.

## In Scope

- **`src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts`** — `importToHandbook(bulk_run_id)` Erweiterung (war Stub in SLC-167 MT-6, jetzt voll implementiert)
- **`src/lib/bulk-email/handbook-import.ts`** — Pure-Function-Layer:
  - `mapPatternToKnowledgeUnit(pattern, bulkRun): KnowledgeUnitInsertInput` (Source-Attribution-Metadata)
  - `triggerHandbookSnapshot(tenantId, templateId): Promise<handbook_snapshot_id>` (Reuse FEAT-028)
- **`src/lib/bulk-email/__tests__/handbook-import.test.ts`** — Vitest gegen Coolify-DB
- **`src/app/dashboard/handbook/[snapshot_id]/components/SourceAttributionBlock.tsx`** — neue Sub-Component im V4.1-Handbuch-Reader (FEAT-028)
- **`src/app/dashboard/handbook/[snapshot_id]/page.tsx`** UPDATE — Source-Attribution-Block bei knowledge_unit mit `metadata.source_type='email_bulk'`
- **`src/app/dashboard/bulk-email-import/[run_id]/page.tsx`** Erweiterung — Final-Stats-Anzeige bei status='completed' + Audit-Trail-Link
- **`src/app/admin/audit/bulk-email/page.tsx`** — Admin-Cross-Tenant-Audit-View (nur strategaize_admin, RLS-enforced via Server-Component)
- **`src/app/admin/audit/bulk-email/__tests__/page.test.ts`** — Vitest fuer RLS-Cross-Tenant-Access
- **`src/lib/bulk-email/__tests__/audit-trail.test.ts`** — Vitest fuer vollstaendige Audit-Spur (Upload + Pre-Filter + Thread + Redact + Pattern + Curation + Import nachweisbar)
- **knowledge_unit.metadata.source_type='email_bulk'** — als generischer JSONB-Wert (kein Schema-Change, kein CHECK-Constraint-Update noetig)
- **`__tests__/rls/v9-bulk-email.rls.test.ts`** Erweiterung — Source-Attribution-Read-RLS, knowledge_unit-Read mit source_type-Filter

## Out of Scope

- **Pattern-Vorschau im Handbuch-Reader vor Akzeptanz** (V9.1+)
- **Pattern-Re-Open zur Edition nach Handbuch-Import** (V9.1+)
- **Auto-Section-Anlage** wenn GF "Andere..." waehlt (V9.1+, V9.0 persistiert Free-Text-Section in `knowledge_unit.section_path` ohne Auto-Erweiterung von `template.handbook_schema`)
- **Pattern-Versionierung** bei aehnlichen Patterns aus zweitem Bulk-Run (V10+ — V9.0 erzeugt duplicate knowledge_unit-Rows)
- **Export der Bulk-Run-Statistiken als PDF/CSV** (V9.1+)
- **Cross-Bulk-Run-Pattern-Diff** (V10+)
- **Tenant-Storage-Quota-Enforcement** (V9.1+)
- **Auto-Delete-Cron fuer .mbox-Files nach N Tagen** (V9.1+)

## Pre-Conditions

- ✓ SLC-167 COMPLETE (Pattern-Extraktion + Curation LIVE)
- ✓ email_pattern.imported_to_handbook_at-Spalte existiert (SLC-165 MIG-051)
- ✓ V4.1 `handbook_snapshot`-Tabelle + Snapshot-Mechanik existiert (FEAT-026 deployed)
- ✓ V4.1 `knowledge_unit`-Tabelle + RLS existiert (FEAT-026 deployed)
- ✓ V4.1 Handbuch-Reader Components existieren (FEAT-028 deployed)
- ✓ vw_bulk_email_cost_monthly View LIVE (SLC-167 MT-1 — Vorzug)
- ⏳ **Worktree `v9-bulk-email-import`** weiter aktiv

## Micro-Tasks

### MT-1: Handbook-Import Pure-Function-Layer
- **Goal**: Pure-Function `mapPatternToKnowledgeUnit` + `triggerHandbookSnapshot`.
- **Files**:
  - `src/lib/bulk-email/handbook-import.ts` (NEU)
  - `src/lib/bulk-email/__tests__/handbook-import.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - `mapPatternToKnowledgeUnit(pattern, bulkRun, tenantTemplateId): KnowledgeUnitInsertInput`:
    - `tenant_id` aus bulkRun.tenant_id
    - `template_id` aus aktivem V4.1-Template des Tenants (Lookup: `SELECT id FROM template WHERE tenant_id=X AND is_active=true`)
    - `section_path` aus pattern.curated_section
    - `title` aus pattern.title (ggf. edited)
    - `content` aus pattern.description + evidence_snippets-Auszug (kompakte Form)
    - `source` = `'email_bulk'` (knowledge_unit.source-Wert, ggf. CHECK-Constraint-Erweiterung in MT-2)
    - `metadata` JSONB mit:
      - `source_type: 'email_bulk'`
      - `bulk_run_id: bulkRun.id`
      - `pattern_id: pattern.id`
      - `thread_id: pattern.thread_id`
      - `participant_pseudonyms: <thread.participant_pseudonyms>`
      - `confidence: pattern.confidence`
      - `extracted_at: <pattern.created_at>`
    - `created_by_user_id` aus pattern.curator_user_id
  - `triggerHandbookSnapshot(tenantId, templateId): Promise<handbook_snapshot_id>` — Reuse FEAT-028 Snapshot-Mechanik (existierende RPC `rpc_trigger_handbook_snapshot` oder Server-Action analog)
- **Verification**: Vitest gegen Coolify-DB:
  - mapPatternToKnowledgeUnit liefert valid KnowledgeUnitInsertInput mit allen Pflicht-Feldern
  - triggerHandbookSnapshot erzeugt neuen handbook_snapshot-Row
  - source_type='email_bulk' korrekt persistiert in metadata-JSONB
- **Dependencies**: SLC-167 COMPLETE

### MT-2: importToHandbook Server-Action (Idempotent)
- **Goal**: `importToHandbook(bulk_run_id)` Server-Action mit Idempotenz + Snapshot-Trigger + Final-Status-Update.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts` (UPDATE — voll-implementieren)
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/__tests__/actions.test.ts` (UPDATE — neue Cases fuer Import)
- **Expected behavior**:
  - Server-Action `importToHandbook(bulk_run_id)`:
    - UPDATE email_bulk_run.status='importing'
    - SELECT email_pattern WHERE bulk_run_id=X AND curation_status='accepted' AND imported_to_handbook_at IS NULL
    - In Transaction:
      - Pro Pattern: INSERT knowledge_unit via mapPatternToKnowledgeUnit + UPDATE email_pattern.imported_to_handbook_at=now() + imported_knowledge_unit_id=<new_id>
      - Nach allen Inserts: triggerHandbookSnapshot(tenant_id, template_id)
      - UPDATE email_bulk_run.status='completed', patterns_imported=N, completed_at=now()
    - Bei Failure mid-Loop: ROLLBACK + status='failed' + failure_reason='handbook_import_error', Re-Try via Idempotenz-Check moeglich (imported_to_handbook_at IS NULL filtert bereits importierte)
  - Pre-Check: ggf. knowledge_unit.source CHECK-Constraint-Erweiterung um `'email_bulk'`-Wert (wenn existiert) — Inline-SQL-ALTER in dieser MT, ODER per separate Migration MIG-053 wenn umfangreich
- **Verification**: Vitest gegen Coolify-DB:
  - 10 accepted Pattern → 10 knowledge_unit-Rows + 1 handbook_snapshot + status='completed' + patterns_imported=10
  - Re-Run der Action: kein duplicate knowledge_unit, kein 2. handbook_snapshot (skipped weil keine neuen Pattern)
  - Failure-Simulation (Mock Snapshot-Trigger throws): ROLLBACK, status='failed', alle email_pattern.imported_to_handbook_at bleiben NULL
- **Dependencies**: MT-1

### MT-3: Source-Attribution-View im V4.1-Handbuch-Reader
- **Goal**: V4.1-Handbuch-Reader (FEAT-028) erweitern um Source-Attribution-Block bei knowledge_unit mit `metadata.source_type='email_bulk'`.
- **Files**:
  - `src/app/dashboard/handbook/[snapshot_id]/components/SourceAttributionBlock.tsx` (NEU)
  - `src/app/dashboard/handbook/[snapshot_id]/page.tsx` (UPDATE — bedingtes Rendering)
  - `src/app/dashboard/handbook/[snapshot_id]/__tests__/SourceAttributionBlock.test.tsx` (NEU)
- **Expected behavior**:
  - Page liest knowledge_unit-Rows wie bisher (FEAT-028-Reader unveraendert)
  - Bei knowledge_unit mit metadata.source_type='email_bulk': render SourceAttributionBlock unter knowledge_unit-Card
  - SourceAttributionBlock:
    - Anzeige: "Aus Email-Bulk-Import vom YYYY-MM-DD" (Datum aus metadata.extracted_at)
    - Link "Quelle ansehen" → `/dashboard/bulk-email-import/[bulk_run_id]` (Plattform-intern, nicht oeffentlich)
    - Evidence-Snippets-Akkordeon read-only mit Pseudonym-Hinweis "Klarnamen wurden pseudonymisiert"
    - Confidence-Score-Pill (gleiche Farb-Skala wie SLC-167 PatternCard)
  - Cross-Tenant-Schutz: Link wird nur gerendert wenn aktueller User Zugriff auf bulk_run_id hat (RLS-Check)
- **Verification**: Vitest:
  - knowledge_unit ohne source_type='email_bulk' → kein SourceAttributionBlock
  - knowledge_unit mit source_type='email_bulk' → Block gerendert mit Datum + Link + Pseudonym-Hint
  - Cross-Tenant: Mock-Tenant-B-User sieht knowledge_unit (wenn shared), aber kein Block-Link
- **Dependencies**: MT-2

### MT-4: Bulk-Run-Detail-Final-Stats + Admin-Audit-View
- **Goal**: Bulk-Run-Detail-Page Final-Stats-Anzeige + Admin-Cross-Tenant-Audit-View.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/page.tsx` (UPDATE — Final-Stats-Section)
  - `src/app/admin/audit/bulk-email/page.tsx` (NEU)
  - `src/app/admin/audit/bulk-email/__tests__/page.test.ts` (NEU, RLS-Cross-Tenant)
  - `src/lib/bulk-email/__tests__/audit-trail.test.ts` (NEU, End-to-End-Audit-Verifikation)
- **Expected behavior**:
  - Detail-Page Final-Stats (nur bei status='completed' angezeigt):
    - total_emails, content_emails, thread_count, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur (aus email_bulk_run direkt)
    - Pre-Filter-Cost vs Pattern-Extraktion-Cost Split-Anzeige
    - Verlauf-Timeline (uploaded → parsed → pre_filtered → thread_redacted → pattern_extracted → completed mit Timestamps)
  - Admin-Audit-View `/admin/audit/bulk-email`:
    - strategaize_admin-only (RLS via Server-Component-Check)
    - Liste aller Bulk-Runs Cross-Tenant mit Filter (Tenant, Status, Datum-Range)
    - Pro Run: Link zu Detail + Tenant-Anzeige + total_cost_eur + Status
    - Cost-Aggregation pro Tenant pro Monat (Reuse vw_bulk_email_cost_monthly)
  - Audit-Trail-Vollstaendigkeit: `audit-trail.test.ts` verifiziert dass pro Bulk-Run alle Stufen-Events nachweisbar sind (upload-Event aus capture_session.metadata oder error_log + Bedrock-Calls aus ai_cost_ledger + Curation aus email_pattern.curated_at + Import aus knowledge_unit.metadata.bulk_run_id-Lookup)
- **Verification**: Vitest gegen Coolify-DB:
  - Final-Stats fuer Test-Bulk-Run mit 1000 Emails, 89 content, 42 threads, 12 patterns_extracted, 8 accepted, 8 imported, 5.4 EUR cost
  - tenant_admin kann eigenen Bulk-Run sehen, aber kein anderen
  - strategaize_admin kann alle Bulk-Runs sehen
  - tenant_member kann KEIN Admin-View
  - Audit-Trail: Pflicht-Events: upload (capture_session-Event), parse (ai_jobs-Event), pre_filter (ai_cost_ledger-Entry mit feature=...), thread_redact (analog), pattern_extraction (analog), curation (email_pattern.curated_at), import (knowledge_unit-Row mit bulk_run_id-Backref)
- **Dependencies**: MT-3

### MT-5: SLC-168 Records-Update + V9-Gesamt-Records + Commit
- **Goal**: slices/INDEX.md SLC-168 + alle V9-Slices done-Status, features/INDEX.md FEAT-070..074 done-Status, planning/backlog.json BL-147..151 done, planning/roadmap.json V9-Status, MIG-Updates, STATE.md, V9-Cumulative-Worktree Master-Merge-Vorbereitung.
- **Files**:
  - `slices/INDEX.md` (UPDATE — SLC-165..168 done)
  - `features/INDEX.md` (UPDATE — FEAT-070..074 done)
  - `planning/backlog.json` (UPDATE — BL-147..151 done)
  - `planning/roadmap.json` (UPDATE — V9 status='active' bleibt, naechstes Sub-Slot-V9.1 anpassen wenn relevant)
  - `docs/MIGRATIONS.md` (UPDATE — MIG-051 + MIG-052 PLANNED → live)
  - `docs/STATE.md` (UPDATE — Current Phase V9 code-side complete)
  - `docs/RELEASES.md` — NOCH KEIN REL-Eintrag (Release erst nach /qa + /final-check + /go-live + /deploy)
- **Expected behavior**: Alle V9-Records-Updates konsistent. SLC-168 + Vorher-Slices alle als `done` markiert. Pflicht-Verifikation: per-Cockpit-Sicht muesste V9 = 4/4 Slices done zeigen.
- **Verification**: `grep -c "done" slices/INDEX.md | grep SLC-16[5-8]` matched genau 4 mal.
- **Dependencies**: MT-4

## Acceptance Criteria

- **AC-SLC-168-1**: Pattern → knowledge_unit-Uebersetzung ist idempotent (Re-Run uebersetzt nur unprocessed Pattern via imported_to_handbook_at IS NULL).
- **AC-SLC-168-2**: Pro knowledge_unit existiert source_attribution-Metadata mit bulk_run_id + pattern_id + thread_id + participant_pseudonyms.
- **AC-SLC-168-3**: Nach Import wird neuer handbook_snapshot erzeugt; Pattern erscheint im V4.1-Handbuch-Reader unter gewaehlter Section.
- **AC-SLC-168-4**: Source-Attribution-View im Reader zeigt "Aus Email-Bulk-Import vom YYYY-MM-DD" + Link zur Run-Detail.
- **AC-SLC-168-5**: Evidence-Snippets im Reader sind pseudonymisiert (kein Klarname sichtbar, Pattern-Scan in /qa).
- **AC-SLC-168-6**: Audit-Log enthaelt komplette Stufen-Spur: Upload + Pre-Filter + Thread-Aggregation + PII-Redact + Pattern-Extraktion + Curation + Handbuch-Integration.
- **AC-SLC-168-7**: Cost-Tracking pro Bulk-Run zeigt total_cost_eur korrekt aggregiert ueber alle LLM-Calls.
- **AC-SLC-168-8**: Cost-Cap-View pro Tenant/Monat zeigt Verbrauchs-Stand (Reuse vw_bulk_email_cost_monthly).
- **AC-SLC-168-9**: Final-Stats am Run-Ende: total_emails, content_emails, threads, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur.
- **AC-SLC-168-10**: strategaize_admin kann Audit-Log Cross-Tenant einsehen, tenant_admin nur eigenen.
- **AC-SLC-168-11**: Tenant-RLS verhindert Cross-Tenant-Read auf knowledge_unit mit metadata.source_type='email_bulk'.
- **AC-SLC-168-12**: Performance: 100 Pattern-Import in <30 Sekunden.
- **AC-SLC-168-13**: Bei Snapshot-Trigger-Failure: ROLLBACK aller knowledge_unit-Inserts, Re-Try moeglich ohne Doppel-Schreib.
- **AC-SLC-168-14**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Notable Risks / Dependencies

- **R1**: knowledge_unit.source CHECK-Constraint kann existieren und `email_bulk` nicht zulassen. Pre-Check in MT-2 ist Pflicht: wenn CHECK existiert, CHECK-Erweiterung inline in der Server-Action-Migration ODER separate Migration MIG-053. /architecture DEC-177 sagt "metadata-JSONB ist generisch" — gilt aber NICHT fuer source-Spalte wenn die CHECK-bewacht ist.
- **R2 (DEC-181)**: "Andere..."-Free-Text-Section landet in knowledge_unit.section_path ohne template.handbook_schema-Erweiterung. V4.1-Reader rendert es trotzdem, aber Section-Hierarchie kann visuell merkwuerdig wirken (z.B. "Andere/Custom-Topic" ohne Parent-Section). V9.1+ Auto-Section-Anlage als Polish-Iteration.
- **R3**: handbook_snapshot-Trigger ist Hard-Dependency auf FEAT-028 + dessen RPC. Wenn RPC nicht direkt callable (z.B. nur als ai_jobs-Worker), muss Server-Action stattdessen ai_jobs-Row enqueuen + auf Completion warten. Polling-Pattern oder Sync-Wait klaeren in MT-1.
- **R4**: Source-Attribution-Link `/dashboard/bulk-email-import/[bulk_run_id]` ist Tenant-intern. Wenn das Handbuch spaeter via Public-Link geteilt wird (V10+ Vision): Link muss conditional disabled werden bei externer Sicht. V9.0 hat das Problem noch nicht (Handbuch ist nur intern sichtbar).
- **R5**: Audit-Trail-Verifikation in MT-4 setzt voraus, dass alle Stufen-Events korrekt persistiert wurden in SLC-165..167. Wenn z.B. Pre-Filter-Worker den ai_cost_ledger-Entry NICHT korrekt schreibt, faellt der Audit-Test in MT-4 auf. Cross-Slice-Integration-Test ist Hauptverifikation hier.
- **R6**: Re-Import-Idempotenz nach Failure: wenn Snapshot-Trigger nach 50 von 100 Inserts crasht, sind 50 knowledge_unit-Rows in DB (RLS-sichtbar) ohne Snapshot. Re-Import-Logik muss `imported_to_handbook_at IS NULL`-Filter halten + Snapshot trotzdem triggern. Test in MT-2 ist Pflicht.
- **D1**: Hard-Dependency auf SLC-167 (accepted Pattern existieren).
- **D2**: Hard-Dependency auf V4.1 FEAT-026/028 deployed.
- **D3**: Hard-Dependency auf vw_bulk_email_cost_monthly LIVE aus SLC-167 MT-1.

## Worktree

- **Branch**: `v9-bulk-email-import` (gleicher Cumulative-Branch, am Ende dieses Slices Master-Merge-Vorbereitung)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v9`

## Next After SLC-168

**V9.0 Code-Side komplett**. Naechste Schritte:
1. **`/qa V9-Gesamt`** — Gesamt-QA ueber alle 4 Slices code-side (Pflicht-Test-Matrix + Tonality-Audit + PII-Pattern-Scan + Cost-Cap-Simulation + RLS-Cross-Tenant-Pen-Test)
2. **`/final-check V9`** — Pre-Release-Audit: Security, Compliance (DSGVO-Audit-Trail), Migrations-Status, Tests-Coverage
3. **`/go-live V9`** — Release-Readiness-Assessment + Master-Merge `v9-bulk-email-import → main` (Fast-Forward) + Coolify-Redeploy
4. **`/deploy V9`** — Production-Deploy auf Hetzner
5. **`/post-launch V9`** — Burn-In ~18-24h + STABLE-Bestaetigung als REL-XXX
