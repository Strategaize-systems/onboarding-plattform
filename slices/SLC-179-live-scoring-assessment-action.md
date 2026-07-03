# SLC-179 — Live-Haiku Scoring-Server-Action (assessModulAnswer)

- Feature: FEAT-097 (Phase 2) · Backlog: BL-522 · Version: V10.1
- Parallel-Group: C · MIG: keine · Repo: OP
- Status: planned · Dependency: **SLC-177** (Flags) · parallel-fähig zu SLC-178
- Quelle: /architecture V10.1 DEC-253/A+F

## Ziel
Eine **synchrone Server-Action** `assessModulAnswer(sessionId, modulKey, frageId, answer)`, die im Kontext der Frage-Flags via **Bedrock Haiku 4.5** die konkrete Antwort auf Vollständigkeit/Risiko bewertet, fail-open, und bei Bedarf eine kontextuelle Rückfrage + Trigger-Hit erzeugt. Spiegelt exakt das `assessAnswerAmpel`-Muster (`blueprint/actions.ts:177`).

## Scope
- IN: Server-Action + Haiku-Call (temp 0, kleines Token-Budget) + fail-open + Flag-Kontext-Prompt + Rückfrage-/Trigger-Hit-Entscheidung + error_log-Audit + Guardrail-Logik (Trigger-Schwelle, Max-Rückfragen/Block). Hermetische Unit/Integration-Tests.
- OUT: UI-Wiring + Followup-Merge (SLC-180). Ampel-Berechnung (SLC-178). Kein DDL, kein ai_cost_ledger für den Mikro-Call (V1, wie ISSUE-107).

## Offene Fragen bei Slice-Start auflösen (aus /architecture)
- F-A: konkrete Trigger-Schwelle + Max-Rückfragen/Block (Produkt-Guardrail R3).
- F-B: Latenz-Budget — assess pro Frage vs. beim Block-Advance (wie Blueprint offene Frage 3).

## Abnahme (AC — Rahmen, final bei Slice-Start)
- AC-179-1: `assessModulAnswer` = synchrone Server-Action, Haiku 4.5 (eu-central-1), temp 0, fail-open (LLM-Fehler → keine Rückfrage, Capture läuft weiter), error_log-Audit (provider/region/model).
- AC-179-2: Prompt liest die Frage-Flags (aus Template) als Kontext; Output = strukturiertes JSON (assessment + optional rueckfrage_text + trigger_hit).
- AC-179-3: Guardrail: max N Rückfragen/Block + Trigger-Schwelle (Werte aus F-A).
- AC-179-4: hermetische Tests (Happy / LLM-Fail-fail-open / Guardrail-Cap / kein-Trigger).
- AC-179-5: tsc0/eslint0, `next build` PASS, 0 neue Dep (Haiku-Adapter existiert).

## Micro-Tasks (Outline — final bei Slice-Start)
- MT-1: `assessModulAnswer`-Server-Action + Haiku-Call + fail-open + error_log. Files: `src/lib/stb-vertikale/module-delivery/assess-answer.ts`, `.../assess-answer.test.ts`.
- MT-2: Flag-Kontext-Prompt + JSON-Output-Schema + Guardrail-Logik. Files: `.../assess-answer-prompt.ts`.
- MT-3: Trigger-Hit-Vermerk in `capture_session.metadata` (für SLC-178-Ampel). Files: `.../assess-answer.ts` + metadata-Helper.

## Risiken / Dependencies
- R-179-1 (F-B): Latenz pro Frage → Haiku (nicht Sonnet) + optional Block-Advance-Batch-Fallback.
- Dependency: SLC-177 (Flags müssen gesetzt sein, sonst nichts zu bewerten). Blockt SLC-180.

## Worktree/Isolation
OP-Worktree (SaaS-Pflicht). Parallel-fähig zu SLC-178 (disjunkte Files: assess-answer.* vs. reife-ampel.*).
