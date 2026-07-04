# SLC-183 — 5 Standard-Berichte cross-Mandant (visuell) + KI-Kurzfazit

- Feature: FEAT-100 · Backlog: BL-526 · Version: V10.2
- Parallel-Group: 2 (nach SLC-182) · MIG: keine · Repo: OP (Full-Stack, Query-Layer + Frontend)
- Status: planned · Dependency: **SLC-182** (Shell)
- Quelle: /architecture V10.2 DEC-259 + DEC-260 (RPT-563)

## Ziel
Die fünf cross-Mandanten-Standard-Berichte liefern: je eine **visuelle Aggregation** aus Bestandsdaten (Query-Layer, service-role nach Gate) + ein **on-demand 2-3-Satz-KI-Kurzfazit** (Haiku 4.5 EU). 0 Migrationen.

## Scope
- IN: 5 Bericht-Loader (Query-Layer), Kurzfazit-Function (Haiku), 5 visuelle Render-Komponenten, Verdrahtung in die Shell.
- OUT: RAG-Frage-Box (SLC-184), Trendlinien/Snapshots (parked), narrative Voll-Reports (parked), Persistenz-Cache (V1 on-demand).

## Die 5 Berichte (DEC-260 Query-Layer)
1. **Mandanten-Übersicht** — pro Mandant: Fortschritt (`block_checkpoint` submitted/total), Diagnose-Ampel-Rollup (`block_diagnosis.content.subtopics[*].reifegrad`), Modul-Reife-Ampel (`computeModulReifeAmpel`, `capture_session.metadata.modul_delivery_ampel`), letzte Aktivität. Reuse `load-cross-tenant.ts`.
2. **Meine Review-Queue** — offene `knowledge_unit` (status='proposed') + Walkthrough-Reviews pro Mandant.
3. **Wo stockt es** — Mandanten mit langer Inaktivität / roter Diagnose-Ampel / `failed` ai_jobs.
4. **System-/Generierungs-Status** — `ai_jobs` (running/failed) + `error_log` (24h).
5. **Activity-Timeline cross-Mandant** — `capture_events`/`diagnose_event`/`modul_output`/`validation_layer`/`block_checkpoint` nach created_at DESC (seit gestern / seit Login).

## Abnahme (AC)
- AC-183-1: Jeder der 5 Loader liefert cross-Tenant-Aggregat via `createAdminClient` **nur nach** strategaize_admin-Re-Check (kein Fallback auf `auth.user()`, security-audit-standard).
- AC-183-2: Jeder Bericht rendert visuell (Fortschrittsbalken / Ampel-Grid / Status-Badges / Timeline-Liste), keine Widget-Karten.
- AC-183-3: „Kurzfazit"-Button pro Bericht → `invokeHaiku` mit **expliziter** `modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0"` (ISSUE-111), zod-validiert, 2-3 Sätze; **fail-open** (LLM-Fehler → Bericht bleibt nutzbar, error_log-Audit, kein `ai_cost_ledger` per DEC-259).
- AC-183-4: Hermetische Tests für Loader (Aggregations-Logik) + Kurzfazit (Happy / LLM-Fail-fail-open). `tsc` 0, `eslint` 0, `next build` PASS.
- AC-183-5: Browser-Smoke — 5 Berichte laden + je 1 Kurzfazit generiert (Live-Haiku, /qa-Runtime); 0 Console-Errors.

## Micro-Tasks

#### MT-1: 5 Bericht-Loader (Query-Layer)
- Goal: Aggregations-Loader für die 5 Berichte, service-role nach Gate.
- Files: `src/lib/workspace/reports/mandanten-uebersicht.ts`, `review-queue.ts`, `wo-stockt-es.ts`, `system-status.ts`, `activity-timeline.ts`, `index.ts`
- Expected: je `loadX(admin): Promise<XReport>`; Reuse `load-cross-tenant.ts` + `computeModulReifeAmpel`.
- Verification: hermetische Unit-Tests (Fixtures) für Aggregations-Logik; `tsc` 0.
- Dependencies: SLC-182

#### MT-2: KI-Kurzfazit-Function
- Goal: `summarizeReport(reportData): Promise<{fazit|null}>` via Haiku (explizite modelId), fail-open, error_log-Audit.
- Files: `src/lib/workspace/fazit.ts` (+ Test)
- Expected: zod-Schema, temp 0, 2-3 Sätze; LLM-Fehler → null (kein Crash), error_log.
- Verification: hermetische Tests (Happy / Fail-fail-open, `invokeHaiku`-Injection-Hook).
- Dependencies: keine (parallel zu MT-1)

#### MT-3: Visuelle Render-Komponenten
- Goal: 5 Bericht-Render-Komponenten (Balken/Ampel-Grid/Badges/Timeline) + Kurzfazit-on-demand-Button.
- Files: `src/components/workspace/reports/*.tsx`
- Expected: visuelle Darstellung + „Kurzfazit"-Button ruft Server-Action.
- Verification: Browser-Smoke.
- Dependencies: MT-1

#### MT-4: Verdrahtung in Shell + Kurzfazit-Server-Action
- Goal: ReportButtons → Bericht-Anzeige; Kurzfazit-Server-Action.
- Files: `src/app/admin/mein-tag/page.tsx`, `src/components/workspace/ReportButtons.tsx`, `src/app/admin/mein-tag/fazit-action.ts`
- Expected: Button-Klick lädt Bericht; Kurzfazit-Button triggert Haiku.
- Verification: Browser-Smoke Live-Haiku.
- Dependencies: MT-1, MT-2, MT-3

## Risiken / Dependencies
- R-183-1: `createAdminClient` (BYPASSRLS) nur nach Gate — Re-Check im Loader Pflicht (security-audit-standard). Kein `auth.user()`-Fallback.
- R-183-2: Kurzfazit-Latenz/Kosten pro Klick — on-demand, kein Auto-Load; fail-open verhindert Bericht-Blockade.
- R-183-3: Block-Diagnose-Rollup hat keinen zentralen Reader — Aggregation aus `block_diagnosis.content` im Loader (best-effort, wie `diagnose/[id]/lead-push-actions.ts`).
