# SLC-V9.75-B — Stufe-1-Fahrplan-Report-Renderer

> **Status:** planned · **Feature:** FEAT-086 / BL-507 · **Version:** V9.75 · **Created:** 2026-06-17 (RPT-482)
> **Worktree:** `v9-75-exit-readiness` (nach SLC-A) · **MIG reserviert:** keine · **Delivery Mode:** SaaS (TDD)
> **Basis:** ARCHITECTURE.md §0/§6 · DEC-222/223 · /architecture RPT-481

## Ziel
Der einzige echt fehlende Renderer: macht aus der bereits erzeugten Stufe-1-Diagnose ein kundenseitiges, verkaufs-gerahmtes PDF-Deliverable. **Liest ausschliesslich bestehende Daten — 0 Migrationen, 0 neue LLM-Jobs.**

## In Scope
- Daten-Loader: `block_diagnosis.content` + `block_checkpoint.quality_report` pro Session → typisierter `FahrplanInput`.
- Templating: Exit-Wert/Risiko-Kopplung (aus risiko/hebel/relevanz_90d/empfehlung), Priorisierung, Scope-Schaetzung, Owner-Fallback.
- React-PDF-Renderer (Reuse `mandanten-report-v2` Fonts/Theme/Wheel): Reifegrad-Profil + priorisierte Luecken-/To-Do-Liste + Scope-Satz + Exit-Kopplung pro Luecke + 1 Muster-Handbuch-Sektion + Scope-Schaetzung.
- Bereitstellung (Server-Action/Route) + Tier-Gate `blueprint`+ (FEAT-085).

## Out of Scope
- Neuer LLM-Job (DEC-222: alle Felder aus Daten). Web-View (deferred). Stufe-2-Upsell-Bruecke-Vorbefuellung.

## Akzeptanzkriterien
- **AC-B-1** (SC-V9.75-4): Report rendert aus `block_diagnosis.content.subtopics[].fields` (ampel/reifegrad/risiko/hebel/relevanz_90d) das Reifegrad-Profil je Block/Subtopic.
- **AC-B-2** (SC-V9.75-4): priorisierte Luecken-/To-Do-Liste aus `quality_report.gap_questions` (required vor nice_to_have) + `coverage.missing_subtopics`; pro Eintrag Aufwand (`fields.aufwand`), Owner (`fields.owner` else Fallback), naechster Schritt (`fields.naechster_schritt`); Sortierung (priority, risiko*hebel desc, relevanz_90d).
- **AC-B-3** (SC-V9.75-4): pro Luecke getemplatete Exit-Wert/Risiko-Kopplung (deterministisch aus risiko/hebel/relevanz_90d + empfehlung) + gedruckter Scope-Satz („Landkarte, nicht Handbuch") + 1 Muster-Handbuch-Sektion + Scope-Schaetzung.
- **AC-B-4** (SC-V9.75-5): Report-Bereitstellung ist auf `blueprint`+ gated, auf `free` abgelehnt (server-side, Reuse FEAT-085-Gate-Logik).
- **AC-B-5**: 0 neuer LLM-Call (kein Bedrock), 0 Migration; reine Lese-Operation auf bestehenden Daten.
- **AC-B-6**: TSC/ESLint EXIT=0, Vitest GREEN (Loader + Templating + Render-Smoke), `next build` PASS, PDF-Buffer valide (renderToBuffer ohne Throw).

## Risiken
- **R-B-1** (PRD R2 — aufgeloest): Verkaufs-Framing-Felder liegen in `block_diagnosis.content` (mig 051) → kein LLM. Restrisiko: `owner` bewusst leer („" ) → Fallback „GF/noch zu benennen"; `aufwand`/`naechster_schritt` LLM-erzeugt, koennen fehlen → defensives Default-Rendering (Loader testet Null-Felder).
- **R-B-2**: Muster-Handbuch-Sektion — welcher Block (Auswahlregel: hoechster reifegrad confirmed). Reuse `src/lib/handbook/okf/emit.ts renderDiagnosisBody`.
- **R-B-3**: Render-Stack-Reuse — `mandanten-report-v2` Fonts/Theme passen; Wheel optional. Keine neue Dep (`@react-pdf/renderer` vorhanden).

## Micro-Tasks

#### MT-1: Daten-Loader (TDD)
- Goal: Session → typisierter `FahrplanInput` aus diagnosis + quality_report.
- Files: `src/lib/pdf/fahrplan-report/data.ts`, `src/lib/pdf/fahrplan-report/types.ts`, `src/lib/pdf/fahrplan-report/data.test.ts`
- Expected behavior: Join `capture_session → block_checkpoint(quality_report) + block_diagnosis(content)`; baut Reifegrad-Profil + Gap-Liste + Scope-Inputs; defensiv gegen Null-Felder (`aufwand`/`owner`/`naechster_schritt` fehlend).
- Verification: Unit-Test mit Fixture (voll + Null-Felder) → korrektes `FahrplanInput`.
- Dependencies: SLC-A (Gate-Logik vorhanden)

#### MT-2: Templating-Helfer (TDD)
- Goal: deterministische Verkaufs-Framing-Ableitungen.
- Files: `src/lib/pdf/fahrplan-report/framing.ts`, `framing.test.ts`
- Expected behavior: `exitCoupling(risiko,hebel,relevanz_90d,empfehlung)` → Narrative pro (ampel,risiko-Band,hebel-Band); `prioritize(gaps,diagnosis)` Sort; `scopeEstimate(counts)` Heuristik; `ownerOrFallback(owner)`.
- Verification: Unit-Tests (Band-Grenzen, Sort-Stabilitaet, Fallback).
- Dependencies: MT-1

#### MT-3: React-PDF-Renderer (TDD-Smoke)
- Goal: PDF-Dokument aus `FahrplanInput`.
- Files: `src/lib/pdf/fahrplan-report/renderer.tsx`, `src/lib/pdf/fahrplan-report/pages/*.tsx`, `src/lib/pdf/fahrplan-report/index.ts`, `renderer.test.ts`
- Expected behavior: `renderFahrplanReportPdf(input): Promise<Buffer>`; Seiten Reifegrad-Profil / Luecken-To-Do / Muster-Sektion / Scope + Scope-Satz; Reuse `mandanten-report-v2` `fonts.ts`/`theme.ts`.
- Verification: `renderToBuffer` liefert nicht-leeren PDF-Buffer (Smoke), kein Throw bei Null-Feld-Fixture.
- Dependencies: MT-1, MT-2

#### MT-4: Bereitstellung + Tier-Gate (TDD)
- Goal: Server-Action/Route, gated blueprint+.
- Files: `src/app/admin/.../fahrplan-report/route.ts` (oder Action), `+ test`
- Expected behavior: laedt Daten (MT-1), rendert (MT-3), gibt PDF zurueck (`Content-Type: application/pdf`); vor Render `assertSessionTierAllows`-Analog/Tier-Read → `free` abgelehnt (403), `blueprint`+ erlaubt.
- Verification: Test free→denied / blueprint→PDF; manuelle Diff-Review.
- Dependencies: MT-3, SLC-A
