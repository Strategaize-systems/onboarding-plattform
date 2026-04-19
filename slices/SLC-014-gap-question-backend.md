# SLC-014 — Gap-Question-Schema + Backspelling-Backend

## Zuordnung
- Feature: FEAT-010 + FEAT-011 (Orchestrator + Backspelling Backend)
- Version: V2
- Priority: Blocker
- Depends on: SLC-013

## Ziel
Orchestrator-erkannte Luecken werden als gap_question-Rows persistiert. Nach Beantwortung durch den Kunden wird automatisch eine Re-Condensation ausgeloest (neuer Job-Type recondense_with_gaps). Max 2 Backspelling-Runden.

## Scope
- Migration 041: gap_question-Tabelle + RLS + Indexes
- Migration 047: RPCs fuer Gap-Question-Schreibung + Gap-Answer-Verarbeitung
- Orchestrator-Schritt in handle-job.ts: gap_questions aus quality_report in gap_question-Tabelle schreiben
- Server Action: Gap-Antwort speichern + recondense_with_gaps Job enqueuen
- Worker: Neuer Job-Type recondense_with_gaps (A+C+Orchestrator mit erweitertem Input)
- Runden-Limit: max 2, danach meeting_agenda

## Nicht in Scope
- Gap-Question-UI im Questionnaire (SLC-015)
- Dashboard-Badge (SLC-015)

## Acceptance Criteria
1. gap_question-Tabelle existiert mit RLS
2. Orchestrator schreibt gap_questions aus quality_report in die Tabelle
3. Server Action fuer Gap-Antwort speichert answer_text + setzt status=answered
4. recondense_with_gaps Job wird automatisch nach Antwort enqueued
5. Re-Condensation erzeugt neuen block_checkpoint (type=backspelling_recondense) + aktualisierte KUs
6. Zweite Runde: Orchestrator erkennt weitere Gaps → max Round 2
7. Nach Round 2: verbleibende Gaps werden als meeting_agenda markiert (Feld in gap_question oder separate Logik)
8. npm run build + npm run test erfolgreich

### Micro-Tasks

#### MT-1: Migration 041_gap_question.sql
- Goal: gap_question-Tabelle mit allen Spalten, CHECK-Constraints, RLS, Indexes, GRANTs
- Files: `sql/migrations/041_gap_question.sql`
- Expected behavior: Tabelle wie in ARCHITECTURE.md definiert. RLS: tenant_admin/member Read+Write eigener Tenant, strategaize_admin Cross-Tenant.
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-2: Migration 047_rpc_orchestrator_and_gaps.sql
- Goal: RPCs fuer Gap-Lifecycle
- Files: `sql/migrations/047_rpc_orchestrator_and_gaps.sql`
- Expected behavior: (1) rpc_save_orchestrator_report(checkpoint_id, quality_report JSONB) — UPDATE block_checkpoint. (2) rpc_create_gap_questions(checkpoint_id, questions JSONB[]) — INSERT gap_question-Rows. (3) rpc_answer_gap_question(gap_id, answer_text) — UPDATE status+answer+answered_at.
- Verification: SQL-Syntax korrekt
- Dependencies: MT-1

#### MT-3: Migrationen auf Hetzner ausfuehren
- Goal: gap_question-Tabelle + RPCs auf Produktions-DB
- Files: keine Code-Aenderung
- Expected behavior: Tabelle + Funktionen existieren
- Verification: `\d gap_question` + `\df rpc_*gap*`
- Dependencies: MT-1, MT-2

#### MT-4: handle-job.ts — Orchestrator Gap-Persistierung
- Goal: Orchestrator-Ergebnis aus SLC-013 nutzen, um gap_question-Rows zu schreiben
- Files: `src/workers/condensation/handle-job.ts`
- Expected behavior: Nach Orchestrator-Assessment: if gap_questions.length > 0 → rpc_create_gap_questions aufrufen
- Verification: npm run build
- Dependencies: SLC-013 MT-5, MT-3

#### MT-5: Server Action — Gap-Antwort speichern + Recondense-Trigger
- Goal: Kunde beantwortet Nachfrage → status=answered → ai_job enqueued
- Files: `src/app/capture/[sessionId]/block/[blockKey]/gap-actions.ts`
- Expected behavior: (1) answerGapQuestion(gapId, answerText) — rpc_answer_gap_question + pruefen ob alle required Gaps beantwortet. (2) Wenn alle required beantwortet: INSERT ai_job type=recondense_with_gaps mit payload {block_checkpoint_id, gap_question_ids}.
- Verification: npm run build
- Dependencies: MT-3

#### MT-6: Worker — recondense_with_gaps Job-Type
- Goal: Re-Condensation mit erweitertem Input (Original + Gap-Antworten)
- Files: `src/workers/condensation/handle-recondense.ts`, `src/workers/condensation/claim-loop.ts`
- Expected behavior: (1) Registriere neuen Job-Type in Claim-Loop. (2) Lade Original-Checkpoint + Gap-Antworten. (3) Erstelle erweiterten Input. (4) A+C Loop + Orchestrator (Runde = backspelling_round + 1). (5) Neuer block_checkpoint type=backspelling_recondense. (6) Neue KUs importieren + Embeddings. (7) Wenn weitere Gaps UND round < 2: neue gap_questions. (8) Wenn round >= 2: verbleibende Gaps als meeting_agenda (status bleibt pending, recommendation='meeting_agenda').
- Verification: npm run build, Worker startet ohne Fehler
- Dependencies: MT-4, MT-5

#### MT-7: Test — Gap-Lifecycle
- Goal: Unit-Test fuer Gap-Question-Lifecycle (create → answer → recondense-trigger)
- Files: `src/workers/condensation/__tests__/gap-lifecycle.test.ts`
- Expected behavior: Testet: Orchestrator mit Gaps → gap_questions erstellt, Antwort → recondense Job enqueued, Round-Limit
- Verification: npm run test -- gap-lifecycle
- Dependencies: MT-6
