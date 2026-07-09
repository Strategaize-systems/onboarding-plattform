# SLC-192 — Exit-Report Devil's-Advocate-Positionierung (FEAT-109)

- Feature: FEAT-109 (BL-517)
- Version: V10.5
- Status: planned
- Priority: High
- Delivery-Mode: SaaS → TDD-Pflicht (coverage-Logik = Business-Logik; Copy = Wording-Review)
- Branch/Worktree: `v10-5-exit-report` (kumulativ nach SLC-191-Merge; Worktree `<repo>.worktrees/v10-5`)
- Migration: **keine**

## Ziel
Die Positionierung, die den Report haftungssicher + glaubwürdig macht (FEAT-109): feste **Spur-Definition** (operative Substanz/Übertragbarkeit/Owner-Dependence — ausdrücklich NICHT Finanz-/Steuer-/Rechts-DD) + **Makler-Disclaimer** („basiert auf Angaben des Eigentümers") + **Ehrlichkeits-/Coverage-Sektion** (was mangels Input NICHT bewertbar war, aus `quality_report`). Positionierung/Copy + Coverage-Renderer, kein Engine-Build.

## Step-0-Reconciliation
- Keine offenen Architektur-Fragen mehr für diesen Slice (Spur/Disclaimer/Coverage sind in DEC-273/276 + PRD §V10.5 FEAT-109 fixiert). Copy-Wording ist Wording-Review-Sache (MT-4), keine offene Design-Frage.
- Legal-Review AGB/Disclaimer/Berufshaftung = **Folge-Gate vor Customer-Live, NICHT dieser Slice** ([[module-lifecycle-discipline]], PRD §V10.5 Out-of-Scope). Der Disclaimer-Text hier ist Positionierung, kein juristisch freigegebener Text.

## Verified-Against-Code-Reality
- `src/lib/pdf/exit-report/positioning.ts` — **NEU** (nach SLC-191 existiert das Modul-Verzeichnis, diese Datei nicht).
- `src/lib/pdf/exit-report/coverage.ts` — **NEU**.
- `src/lib/pdf/exit-report/renderer.tsx` — **MODIFY** (von SLC-191 MT-4 erstellt; hier Positionierungs-/Coverage-Seiten einbetten).
- `src/lib/pdf/exit-report/index.ts` — **MODIFY** (Barrel um coverage/positioning erweitern, falls extern genutzt).
- Reuse-Vorlage Coverage: `SCOPE_SENTENCE` (fahrplan framing.ts) + `parseQualityReport`-Muster (fahrplan data.ts:84-114, `coverage.missing_subtopics` + required `gap_questions`).

## Schema-Grounding
- Quelle der Ehrlichkeits-Sektion = `block_checkpoint.quality_report` (bereits von SLC-191 MT-1 `loadExitReportInput` geladen): `coverage.missing_subtopics[]` + `gap_questions[]` (priority `required`|`nice_to_have`). Keine neue Tabelle/Spalte.

## Symbol-Verifikation
- Neu: `buildCoverageSection(qualityReports)`, `EXIT_SPUR_COPY`, `MAKLER_DISCLAIMER_COPY` (feste Strings/Copy-Konstanten).
- Konsumiert aus SLC-191: `ExitReportInput` (enthält bereits missing/gaps aus dem Fahrplan-Loader), `renderExitReportPdf` (Einbettungs-Punkt).

## Test-Infra
- `coverage.ts` = Pure-Function → `coverage.test.ts` Pure-Mock-Vitest (node-env). `positioning.ts` = Copy-Konstanten → leichter Struktur-/Content-Assert-Test (Spur-Kernaussage vorhanden, Disclaimer-Satz vorhanden). Renderer-Einbettung = `renderToBuffer`-Smoke (Erweiterung des SLC-191 renderer.test.ts). Wording-Review manuell (MT-4).

## Micro-Tasks

#### MT-1: Positionierungs-Copy
- Goal: Spur-Definition + Makler-Disclaimer als feste, wiederverwendbare Copy.
- Files: `src/lib/pdf/exit-report/positioning.ts` (NEU), `src/lib/pdf/exit-report/positioning.test.ts` (NEU).
- Expected behavior: `EXIT_SPUR_COPY` (was wir bewerten: operative Substanz, strukturelle Übertragbarkeit, Owner-Dependence, dokumentiertes Wissen; ausdrücklich NICHT Finanz-/Steuer-/Rechts-DD = Prüfer-/Anwalt-Spur) + `MAKLER_DISCLAIMER_COPY` („basiert auf Angaben des Eigentümers …"). Deutsch, Ton konsistent mit dem Report.
- Verification: `positioning.test.ts` — Spur-Copy enthält beide Seiten (was/was-nicht), Disclaimer-Kernsatz vorhanden. `npm run test` grün.
- Dependencies: SLC-191 gemerged.

#### MT-2: Coverage-/Ehrlichkeits-Sektion (TDD)
- Goal: die nicht-bewertbaren Bereiche deterministisch aus quality_report ableiten.
- Files: `src/lib/pdf/exit-report/coverage.ts` (NEU), `src/lib/pdf/exit-report/coverage.test.ts` (NEU).
- Expected behavior: PURE `buildCoverageSection(input)`: aus `missing_subtopics` + required `gap_questions` eine Liste „was wir mangels Input NICHT bewerten konnten" (dedupliziert, priorisiert required zuerst). Defensiver Fall: fehlender/leerer quality_report → explizit „Coverage nicht ermittelbar" statt leer/irreführend (R-V10.5-4).
- Verification: `coverage.test.ts` — missing+required gemappt, dedup, leerer quality_report→definierter Hinweis. `npm run test` grün.
- Dependencies: MT-1.

#### MT-3: Renderer-Einbettung
- Goal: Positionierung + Coverage in den Report rendern.
- Files: `src/lib/pdf/exit-report/renderer.tsx` (MODIFY), `src/lib/pdf/exit-report/index.ts` (MODIFY), `src/lib/pdf/exit-report/renderer.test.ts` (MODIFY).
- Expected behavior: `renderExitReportPdf` um zwei Sektionen erweitert — Spur/Disclaimer (früh, als Rahmen/Scope-Seite, analog fahrplan `SCOPE_SENTENCE`) + Ehrlichkeits-/Coverage-Sektion (nach den Findings). Barrel ggf. um `buildCoverageSection` erweitern.
- Verification: `renderer.test.ts` erweitert — Buffer non-empty mit Coverage-Fixture; visuelle PDF-Prüfung in /qa (Spur/Disclaimer/Coverage sichtbar). `npm run test` grün.
- Dependencies: MT-1, MT-2.

#### MT-4: Wording-/Tonality-Review
- Goal: Copy-Qualität + Ton sichern.
- Files: keine (Review) — ggf. bestehendes Tonality-Audit-Script nutzen, falls für den Report-Scope anwendbar (in SLC-191/192 prüfen, sonst manuell).
- Expected behavior: Spur/Disclaimer/Coverage-Wording gegen den Devil's-Advocate-Ton (kritisch, aber verbündet; kein Fachjuristen-Anspruch) reviewen; SC-V10.5-6 erfüllt.
- Verification: schriftlicher Wording-Review-Befund im Completion-Report.
- Dependencies: MT-3.

## Cross-Slice-Dependencies
- **Blockiert-von:** SLC-191 (Modul-Verzeichnis, renderer.tsx, Loader mit quality_report). Startet erst nach SLC-191-Merge (kumulativer Branch).
- **Blockiert:** keine (letzter V10.5-Slice).
- Geteilte Datei: `renderer.tsx` + `index.ts` (in SLC-191 erstellt, hier modifiziert) — kumulativ, kein Parallel-Konflikt (sequentiell).

## Worktree / Pre-Merge-Re-Check
Kumulativ auf `v10-5-exit-report` nach SLC-191. Vor Merge in main: Rebase auf origin/main + `npm run test` + Manual-Diff-Review (Single-Flight, 0 MIG).
