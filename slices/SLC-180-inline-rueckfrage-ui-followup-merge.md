# SLC-180 — Inline-Rückfrage-UI + Followup-Merge

- Feature: FEAT-097 (Phase 2) · Backlog: BL-522 · Version: V10.1
- Parallel-Group: D · MIG: keine · Repo: OP (Frontend + Capture-Pfad)
- Status: planned · Dependency: **SLC-179** (Scoring-Action)
- Quelle: /architecture V10.1 DEC-253/F

## Ziel
Die Live-Bewertung (SLC-179) in den Modul-Capture-Wizard (`QuestionnaireWorkspace`) verdrahten: nach Antwort einer geflaggten Kern-Frage bei Trigger eine **inline-Rückfrage** rendern; die Rückfrage-Antwort per **Evidence-Merge-Muster** (`followup.<blockKey>.<questionId>`) an die Eltern-Antwort in `block_checkpoint.content` mergen → fließt ohne Schema-/Logik-Änderung in die Synthese.

## Scope
- IN: Wiring `assessModulAnswer` in den Wizard · inline-Rückfrage-Render · `followup.<block>.<qid>`-Merge in `block_checkpoint.content.answers` (Muster `evidence.<block>.<qid>` in `mergeAnswers`) · Trigger-Hit-Update in metadata · Guardrail-UX (max Rückfragen sichtbar) · Trigger-Hit-Heilung bei akzeptierter Nachantwort (F-E).
- OUT: Server-seitige Bewertung (SLC-179). Ampel-Anzeige (SLC-178). SOP-Brücke (SLC-181). Kein DDL.

## Offene Fragen bei Slice-Start auflösen
- F-E: Trigger-Hit-Heilung — bleibt yellow/red oder heilt bei guter Nachantwort? (Reset-Regel definieren, mit SLC-178-Ampel abstimmen).
- UX-Detail: inline-Nachfrage vs. Folge-Step (Blueprint offene Frage 2).

## Abnahme (AC — Rahmen, final bei Slice-Start)
- AC-180-1: Nach Antwort einer geflaggten Kern-Frage triggert (bei SLC-179-Signal) eine inline-Rückfrage im Wizard.
- AC-180-2: Rückfrage-Antwort wird per `followup.<block>.<qid>` an die Eltern-Antwort gemergt (verifiziert: `assembleQaPairs` sieht die angereicherte Antwort → Synthese-Intake).
- AC-180-3: Trigger-Hit in `capture_session.metadata`; Heilungs-Regel (F-E) angewandt.
- AC-180-4: Guardrail: max N Rückfragen/Block sichtbar durchgesetzt (Nervfaktor R3).
- AC-180-5: Browser-Smoke (Render + Interaktion + 0 Console-Errors); tsc0/eslint0, `next build` PASS.

## Micro-Tasks (Outline — final bei Slice-Start)
- MT-1: Wizard-Wiring `assessModulAnswer` (Antwort-Blur/Submit pro Kern-Frage). Files: `src/app/dashboard/stb/modul/*`, `src/app/capture/[sessionId]/block/[blockKey]/*`.
- MT-2: Inline-Rückfrage-Component + Guardrail-UX. Files: `src/components/stb/*`.
- MT-3: `followup.<block>.<qid>`-Merge in submit-Pfad + Trigger-Hit-Heilung. Files: `src/app/capture/[sessionId]/block/[blockKey]/submit-action.ts`, `src/lib/stb-vertikale/module-context.ts` (mergeAnswers-Kompatibilität verifizieren).

## Risiken / Dependencies
- R-180-1: `mergeAnswers`/`assembleQaPairs` müssen den `followup.*`-Key wie `evidence.*` behandeln — vor Implementierung den mergeAnswers-Code prüfen (evtl. Präfix-Liste erweitern).
- Dependency: SLC-179. Blockt SLC-181 (Scoring-Signale).

## Worktree/Isolation
OP-Worktree (SaaS-Pflicht). Shared Capture-Wizard → Pre-Merge-Re-Check Pattern-Drift beachten.
