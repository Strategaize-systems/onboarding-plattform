# SLC-178 — Modul-Reife-Ampel (Pure-Function + metadata + Reader)

- Feature: FEAT-096 (Phase 1) · Backlog: BL-521 · Version: V10.1
- Parallel-Group: C · MIG: keine · Repo: OP
- Status: planned · Dependency: **SLC-177** (Flags, für Integration) · parallel-fähig zu SLC-179 (disjunkte Files)
- Quelle: /architecture V10.1 DEC-253/C

## Ziel
Eine **deterministische Pure-Function**, die pro Modul (aus Flag-Zuständen + Trigger-Hits) ein Reife-/Ampel-Signal (green/yellow/red) berechnet, es in `capture_session.metadata` ablegt und im Workspace-Reader pro Modul anzeigt. Kein LLM.

## Scope
- IN: `computeModulReifeAmpel(flags, triggerHits)` Pure-Function + Unit-Tests · Persist in `capture_session.metadata.modul_delivery_ampel` · Anzeige im `dashboard/stb/workspace/*`.
- OUT: Live-Bewertung/Trigger-Erzeugung (SLC-179), Rückfrage-UI (SLC-180). Kein DDL.

## Regel (DEC-253/C)
- Ein getriggerter `ko_hart` → **red**; getriggerter `ko_soft`/`deal_blocker`/`owner_dependency` (bei Fehl-/Lücken-Antwort) → **yellow**; sonst **green**.
- „Getriggert" = die Live-Bewertung (SLC-179) markiert eine geflaggte Frage als riskant/unvollständig (Trigger-Hit in metadata). Ohne SLC-179 defaultet triggerHits leer → green (sichere Baseline).

## Abnahme (AC)
- AC-178-1: `computeModulReifeAmpel` ist eine reine Funktion, deterministisch, standalone unit-getestet (alle Regel-Zweige + Grenzfälle).
- AC-178-2: Ampel-Ergebnis wird in `capture_session.metadata.modul_delivery_ampel` (per modulKey) persistiert (Muster `blueprint_adaptive_ampel`, kein Schema-Touch).
- AC-178-3: Workspace-Reader zeigt pro Modul das Ampel-Signal (green/yellow/red) neben dem Reifegrad (Reifegrad bleibt separat aus ki_hebel, DEC-245).
- AC-178-4: tsc0/eslint0, `next build` PASS; 0 Regression bestehender Workspace-Ansicht.

## Micro-Tasks
### MT-1: Pure-Function + Unit-Tests
- Goal: `computeModulReifeAmpel(flags, triggerHits): "green"|"yellow"|"red"`.
- Files: `src/lib/stb-vertikale/module-delivery/reife-ampel.ts`, `.../reife-ampel.test.ts`
- Expected: Regel wie DEC-253/C; alle Zweige getestet.
- Verification: `vitest run` GREEN, standalone (kein DB).
- Dependencies: none (parallel-fähig zu SLC-177/179)

### MT-2: Persist in capture_session.metadata
- Goal: Ampel nach Block-/Modul-Abschluss in metadata schreiben.
- Files: `src/lib/stb-vertikale/module-delivery/persist-ampel.ts` (+ Wiring am Modul-Abschluss-Pfad)
- Expected: `modul_delivery_ampel[modulKey]` gesetzt; idempotent.
- Verification: Integrationstest/DB-Sidecar (metadata-Write).
- Dependencies: MT-1, SLC-177 (Flags real vorhanden)

### MT-3: Workspace-Reader-Anzeige
- Goal: Ampel pro Modul im Reader rendern.
- Files: `src/app/dashboard/stb/workspace/*` (+ ggf. `src/components/stb/*`), i18n `stb.*`
- Expected: green/yellow/red-Badge pro Modul, neben Reifegrad.
- Verification: Browser-Smoke (Render + 0 Console-Errors).
- Dependencies: MT-2

## Risiken / Dependencies
- R-178-1 (F-E): Wie „heilt" ein Trigger-Hit nach guter Nachantwort? → im /backend mit SLC-180 abstimmen (Trigger-Hit-Reset bei akzeptierter Rückfrage-Antwort). Für SLC-178 isoliert: Ampel liest den finalen triggerHits-Stand.
- Dependency: SLC-177 (Flags) für sinnvolle Integration; MT-1 aber standalone startbar.

## Worktree/Isolation
OP-Worktree (SaaS-Pflicht). Parallel-fähig zu SLC-179 (disjunkte Files unter `module-delivery/`).
