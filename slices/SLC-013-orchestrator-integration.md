# SLC-013 — Orchestrator-Integration

## Zuordnung
- Feature: FEAT-010 (3-Agent Orchestrator Loop)
- Version: V2
- Priority: Blocker
- Depends on: V1.1 stable

## Ziel
Der bestehende A+C-Loop im Worker wird um einen Orchestrator-Schritt erweitert. Nach der Konvergenz des Analyst+Challenger-Loops bewertet der Orchestrator die Gesamt-Qualitaet der Knowledge Units und erkennt Wissensluecken. Das Ergebnis wird als quality_report auf dem block_checkpoint gespeichert.

## Scope
- Migration 040: quality_report JSONB auf block_checkpoint, feature-Spalte auf ai_cost_ledger, neue checkpoint_type-Values
- Orchestrator-Prompt (orchestrator-prompt.ts)
- Worker-Erweiterung: Orchestrator-Call nach A+C-Loop
- quality_report auf block_checkpoint speichern
- ai_cost_ledger mit feature='orchestrator' loggen
- ai_iterations_log um Orchestrator-Eintrag erweitern

## Nicht in Scope
- gap_question-Tabelle (SLC-014)
- Gap-Question-UI (SLC-015)
- Re-Condensation (SLC-014)

## Acceptance Criteria
1. Nach Block-Submit laeuft A+C-Loop + Orchestrator (3 Phasen)
2. quality_report ist als JSONB auf block_checkpoint gespeichert
3. quality_report enthaelt: overall_score, coverage, evidence_quality, consistency, gap_questions[], recommendation
4. Orchestrator-Kosten sind in ai_cost_ledger mit feature='orchestrator' protokolliert
5. Orchestrator-Entscheidung ist im ai_iterations_log nachvollziehbar
6. Bestehender A+C-Loop funktioniert unveraendert (kein Regression)
7. npm run build + npm run test erfolgreich

### Micro-Tasks

#### MT-1: Migration 040_orchestrator_extensions.sql
- Goal: DB-Schema fuer Orchestrator-Output vorbereiten
- Files: `sql/migrations/040_orchestrator_extensions.sql`
- Expected behavior: (1) ALTER block_checkpoint ADD quality_report JSONB DEFAULT NULL. (2) ALTER ai_cost_ledger ADD feature TEXT DEFAULT 'condensation'. (3) ALTER block_checkpoint DROP + recreate checkpoint_type CHECK mit zusaetzlichem 'backspelling_recondense'. (4) Idempotent (IF NOT EXISTS / DO $$ ... $$).
- Verification: SQL-Syntax korrekt, Migration-Datei existiert
- Dependencies: none

#### MT-2: Migration auf Hetzner ausfuehren
- Goal: Schema-Erweiterung auf Produktions-DB
- Files: keine Code-Aenderung
- Expected behavior: block_checkpoint hat quality_report-Spalte, ai_cost_ledger hat feature-Spalte
- Verification: `docker exec ... psql -U postgres -d postgres -c "\d block_checkpoint"` zeigt quality_report
- Dependencies: MT-1

#### MT-3: Orchestrator-Prompt erstellen
- Goal: Bedrock-Prompt fuer Meta-Assessment der KU-Qualitaet + Luecken-Erkennung
- Files: `src/workers/condensation/orchestrator-prompt.ts`
- Expected behavior: System-Prompt + User-Prompt-Template. Input: KU-Liste + Original-Antworten + Template-Metadaten. Output: Strukturiertes JSON (overall_score, coverage, evidence_quality, consistency, gap_questions[], recommendation).
- Verification: TypeScript kompiliert, Export-Interface stimmt mit types.ts ueberein
- Dependencies: none

#### MT-4: Orchestrator-Types definieren
- Goal: TypeScript-Interfaces fuer Orchestrator-Output
- Files: `src/workers/condensation/types.ts`
- Expected behavior: OrchestratorOutput-Interface mit quality_report-Feldern. GapQuestion-Interface.
- Verification: TypeScript kompiliert
- Dependencies: none

#### MT-5: Worker handle-job.ts um Orchestrator-Schritt erweitern
- Goal: Nach A+C-Loop + KU-Import den Orchestrator-Call ausfuehren
- Files: `src/workers/condensation/handle-job.ts`
- Expected behavior: (1) Bestehender Flow bleibt unveraendert bis KU-Import. (2) Danach: Orchestrator-Prompt aufbauen, Bedrock-Call, Output parsen. (3) quality_report auf block_checkpoint UPDATE. (4) ai_cost_ledger INSERT mit feature='orchestrator'. (5) ai_iterations_log Eintrag fuer Orchestrator.
- Verification: npm run build erfolgreich, Worker startet ohne Fehler
- Dependencies: MT-2, MT-3, MT-4

#### MT-6: Test fuer Orchestrator-Output-Parsing
- Goal: Unit-Test fuer Orchestrator-Output-Parser
- Files: `src/workers/condensation/__tests__/orchestrator-parse.test.ts`
- Expected behavior: Testet validen Orchestrator-Output, fehlende Felder, ungueltige Scores
- Verification: npm run test -- orchestrator-parse
- Dependencies: MT-3, MT-4
