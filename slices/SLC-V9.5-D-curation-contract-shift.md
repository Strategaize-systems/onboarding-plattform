# SLC-V9.5-D — Curation-Contract-Shift auf email_synthesized_unit

- Feature: FEAT-080 (DEC-214-Folge)
- Version: V9.5
- Status: planned
- Priority: High
- Backlog: BL-159 (Teil 2/2 — Curation-Anbindung)
- Parallel-Group: **Sequential-Chain S1** (nach SLC-V9.5-C; letzte Slice → Gesamt-/qa + Master-Merge)
- MIG: keine (nutzt `email_synthesized_unit` aus MIG-111)
- Created: 2026-06-12

## Goal
Die GF-Curation kuratiert ab jetzt die konsolidierten `email_synthesized_unit`-Rows statt der n flachen `email_pattern`-Fragmente (DEC-214-Folge / R5). `getCurationData`, die Curation-Server-Actions und der Handbook-Import lesen/promoten `email_synthesized_unit`. Der `knowledge_unit`-INSERT + Snapshot-Trigger bleiben **strukturell unveraendert** (SC-V9.5-5 = das **Target** ist unveraendert; nur die **Source-Query** wechselt). Die thread-lokale Pseudonym-Assembly im Promotion-Mapper **entfaellt** (die Synthese hat P1/P2 bereits entfernt, DEC-214 / ARCH §10).

## In Scope
- `getCurationData` liest `email_synthesized_unit` (+ Progress + Sections).
- `updateUnitCuration` / `bulkAcceptUnits` / `bulkRejectAllUnits` operieren auf `email_synthesized_unit`.
- `finishCurationAndStartHandbookImport` Status-Guard akzeptiert `synthesized`/`curating`.
- `importToHandbook` liest `email_synthesized_unit` (accepted/edited), promotet zu `knowledge_unit` **ohne** Pseudonym-Lookup.
- `helpers.ts` Typen (`CurationUnit` mit `evidence_count`/`source_pattern_ids`).
- `CurationClient.tsx` + `components/` rendern Units (Evidenz-Count-Badge statt Thread-Bezug).
- Handbook-Import-Mapper-Variante ohne `participantPseudonyms`.

## Out of Scope
- Drill-Down von Unit auf rohe `email_pattern` via `_source` (OQ-3 → out; `_source` bleibt nur Provenance/Audit, kein UI).
- Aenderung des `knowledge_unit`-Schemas, des Snapshot-Triggers oder der `handbook_snapshot`-Pipeline.
- Loeschung/Deprecation der alten `email_pattern`-Curation-Pfade falls anderswo referenziert — nur die Bulk-Curation-Route stellt um (im /frontend Referenz-Scan bestaetigen).

## Acceptance
- **AC-D-1 (SC-V9.5-5):** Promotion-Target unveraendert — `importToHandbook` erzeugt `knowledge_unit`-Rows + triggert `handbook_snapshot` exakt wie heute; nur die Source ist `email_synthesized_unit`.
- **AC-D-2 (Pseudonym-Entfall):** Der Promotion-Mapper nutzt KEINEN `participant_pseudonyms`-Lookup mehr; keine P1/P2-Token im `knowledge_unit.body`/`description` (die Synthese hat sie entfernt). /qa-Pattern-Scan.
- **AC-D-3 (Curation-CRUD):** Akzeptieren/Ablehnen/Editieren + Section-Zuordnung + Bulk-Accept (confidence>=threshold) + Bulk-Reject funktionieren auf `email_synthesized_unit` mit Tenant-RLS.
- **AC-D-4 (Status-Flow):** Curation-Page zeigt Units bei Run-Status `synthesized`/`curating`; `finishCuration` flippt `synthesized|curating → importing`; `importToHandbook` `importing → completed`.
- **AC-D-5 (Evidenz-Sichtbarkeit):** Jede Unit-Card zeigt `evidence_count` (Belegdichte) + bis zu 5 `evidence_snippets`.
- **AC-D-6 (Gesamt-V9.5-/qa):** End-to-End auf der Coolify-DB: rohe Patterns → Synthese (B) → Critic (C) → Curation (D) → Handbook-Import; Reduktions-Quote + Evidenz-Aggregation + Tenant-RLS durchgaengig. Quality-Gates tsc=0/ESLint=0/Vollsuite kein Regress.

## Decisions referenced
- DEC-214 (neue Tabelle → Curation liest sie; Pseudonym-Entfall).

## Micro-Tasks

#### MT-1: helpers.ts Typen + getCurationData
- Goal: Curation-Typen + Page-Load auf `email_synthesized_unit` umstellen.
- Files: `src/app/dashboard/bulk-email-import/[run_id]/curation/helpers.ts`, `.../curation/actions.ts` (`getCurationData`).
- Expected behavior: `CurationUnit` (id, title, description, evidence_snippets, themes, suggested_section, evidence_count, source_pattern_ids, aggregated_confidence, curation_status, curated_section, curator_user_id, curated_at) ersetzt/ergaenzt `CurationPattern`. `getCurationData` SELECTet `email_synthesized_unit` WHERE bulk_run_id ORDER BY aggregated_confidence DESC; `computeProgress` auf Units. Sections-Lookup unveraendert.
- Verification: TDD — `getCurationData`-Test gegen Mock liefert Units; `computeProgress`-Test.
- Dependencies: SLC-V9.5-C done.

#### MT-2: Curation-Server-Actions auf Units
- Goal: `updateUnitCuration` / `bulkAcceptUnits` / `bulkRejectAllUnits` / `finishCurationAndStartHandbookImport`.
- Files: `.../curation/actions.ts`, `.../curation/__tests__/actions.test.ts`.
- Expected behavior: identische Logik wie heute, aber `.from("email_synthesized_unit")`; `finishCuration` Status-Guard akzeptiert `synthesized` + `curating` (statt `pattern_extracted`+`curating`); `bulkAccept` nutzt `aggregated_confidence`. Auth-Gate (tenant_admin) + RLS unveraendert.
- Verification: TDD — Accept/Reject/Edit/Bulk-Accept/Bulk-Reject-Cases; Status-Guard-Cases.
- Dependencies: MT-1.

#### MT-3: importToHandbook + Mapper ohne Pseudonyme
- Goal: Promotion-Source = `email_synthesized_unit`; Pseudonym-Lookup entfernen.
- Files: `.../curation/actions.ts` (`importToHandbook`), `src/lib/bulk-email/handbook-import.ts` (`mapSynthesizedUnitToKnowledgeUnit` oder `mapPatternToKnowledgeUnit` mit optionalem Pseudonym-Arg = undefined), `src/lib/bulk-email/__tests__/handbook-import.test.ts`.
- Expected behavior: SELECT `email_synthesized_unit` WHERE accepted/edited + nicht-importiert + curated_section NOT NULL. **Entfernt:** der `email_thread`/`participant_pseudonyms`-Lookup (Z.717-742 der heutigen actions.ts). Mapper baut `knowledge_unit`-Input ohne `participant_pseudonyms` (Source-Attribution via `source_pattern_ids`/`evidence_count` statt Thread-Pseudonyme). `knowledge_unit`-INSERT + Rollback-Loop + `triggerHandbookSnapshot` + Status-Flips **unveraendert**. `imported_knowledge_unit_id`/`imported_to_handbook_at` auf der Unit gesetzt.
- Verification: TDD — Import-Loop-Test (Units → knowledge_unit, Snapshot getriggert); Mapper-Test ohne Pseudonyme; Rollback-Case.
- Dependencies: MT-2.

#### MT-4: CurationClient + Components (Unit-Rendering)
- Goal: UI rendert Units mit Evidenz-Count-Badge.
- Files: `.../curation/CurationClient.tsx`, `.../curation/components/*` (betroffene Card-/List-Komponenten).
- Expected behavior: Unit-Cards zeigen Titel/Beschreibung/`evidence_count`-Badge/`evidence_snippets`/Confidence-Pill (`confidenceTier(aggregated_confidence)`)/Section-Select/Accept-Reject-Edit. Kein Thread-Bezug mehr. Bestehende Interaktions-Patterns (Edit-Modal, Bulk-Accept-Threshold, Progress-Bar) bleiben.
- Verification: Build + (OP-Konvention: keine RTL-Component-Tests) statischer Wiring-Check; Server-Action-Verdrahtung gegen MT-2.
- Dependencies: MT-2.

#### MT-5: Gesamt-V9.5-/qa + Pre-Merge-Re-Check + Master-Merge
- Goal: End-to-End-/qa ueber SLC-V9.5-A..D + Merge `v9-5-bulk-deep-extraction` → `main`.
- Files: ggf. `.../curation/__tests__/synthesized-unit-rls.test.ts` (falls separat von B).
- Verification:
  - AC-D-1..6; Gesamt-Cross-Slice-Wiring drift-frei (Enqueue→Worker→Persist→Curation→Import-Kette).
  - End-to-End gegen Coolify-DB (node:20-Sidecar): Fixture-Run durch alle Stages.
  - **Pre-Merge-Re-Check (6 Schritte, git-release.md):** Rebase auf origin/main; Tests post-Rebase; MIG-Nummer (119) Kollision; Pattern-Drift (cost-cap/claim-loop); Cross-Repo-Pattern; Manual-Diff-Review.
  - Master-Merge `v9-5-bulk-deep-extraction` → `main` (--no-ff) NACH Gesamt-/qa PASS.
- Dependencies: MT-1..MT-4 + SLC-V9.5-A/B/C done.

## Risks
- **R-D-1 (Source-Query-Shift Scope, R5):** Mehrere Call-Sites (getCurationData + 4 Actions + Mapper + Client). Risiko vergessener Referenz auf `email_pattern`. /frontend+/backend Referenz-Scan: `grep email_pattern` im Curation-Pfad → nur bewusst-belassene Pfade (z.B. `_source`-Provenance) duerfen bleiben.
- **R-D-2 (Pseudonym-Entfall-Korrektheit):** Wenn die Synthese (B) P1/P2 doch nicht vollstaendig entfernt, leakt Pseudonym in `knowledge_unit`. AC-D-2 /qa-Pattern-Scan ist die letzte Verteidigung; bei Treffer zurueck zu B-Prompt-Haertung.
- **R-D-3 (Status-Stall-Aufloesung):** Nach SLC-V9.5-B/C stallen Runs bei `synthesized`. D loest das auf (Curation-Guard akzeptiert `synthesized`). End-to-End erst nach D testbar (AC-D-6).
- **R-D-4 (knowledge_unit-Attribution):** Heutige Source-Attribution nutzt Thread-Pseudonyme; neu via `source_pattern_ids`/`evidence_count`. Sicherstellen, dass die Markdown-/metadata-Attribution sinnvoll bleibt (keine leeren Felder).

## Notes
- SC-V9.5-5 Nuance (ARCH §10): „Promotion unveraendert" meint das **Target** (knowledge_unit-INSERT + Snapshot), NICHT die Source-Query. Diese Slice aendert bewusst die Source.
- Master-Merge passiert NUR hier (EIN Merge nach Gesamt-/qa, Cumulative-Single-Branch-Disziplin) — analog V9.1/V3.6.

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" §10 (Curation-Contract-Shift R5), DEC-214. FEAT-080. BL-159.
- Contract-Files: `curation/actions.ts`, `curation/helpers.ts`, `curation/CurationClient.tsx`, `lib/bulk-email/handbook-import.ts`.
