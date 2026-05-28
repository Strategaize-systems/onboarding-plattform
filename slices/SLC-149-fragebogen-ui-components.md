# SLC-149 — Fragebogen-UI Components (Hygiene + Skala + Reflexion)

**Version:** V8
**Feature:** FEAT-064 (Fragebogen-UI-Komponenten)
**Backlog:** BL-129
**Status:** planned
**Created:** 2026-05-28
**Priority:** High
**Estimate:** ~4-6h Code-Side
**Worktree Branch:** `v8-mandanten-report` (Cumulative-Single-Branch — selbe Branch wie SLC-148, siehe SLC-148 Branch-Strategie)

## Slice Goal

Liefert die **drei neuen Antwort-Schema-UI-Komponenten** fuer die V8 Mandanten-Report-Teaser-Diagnose und die `QuestionFlow.tsx`-Switch-Logik die zwischen V6.3-Bestand (`choice_5` -> `AnswerOptionCard`) und V8-neuen Schemata branched.

Nach diesem Slice kann der Founder die **47 V8-Fragen** im Browser durchklicken — alle drei Antwort-Schemata rendern, Antworten werden persistiert (`capture_response`), Telemetrie fliesst (FEAT-058 Reuse), Mobile-Layout >=44px Touch-Target Pflicht.

**Voraussetzung:** SLC-148 done (Template-Daten mit `answer_schema_kind`-Feld pro Frage muessen LIVE in DB sein).

## In Scope

- **Komponente 1**: `HygieneAnswerPills.tsx` — 3 Pills "Ja / Teilweise / Nein" als toggle-button-group fuer Modul 0
- **Komponente 2**: `ReifeSkalaAnswer.tsx` — 5-Punkt-Reife-Skala mit klaren Labels fuer Module 1-9
- **Komponente 3**: `ReflexionTextarea.tsx` — Freitext mit Zeichen-Counter + Auto-Save-Indikator fuer Modul 10
- **QuestionFlow.tsx-Switch-Logik** auf `question.answer_schema_kind` (4 Branchings)
- **EditableText-Integration** in alle 3 neuen Components (FEAT-056 Reuse)
- **HelperTextModal-Integration** in alle 3 neuen Components (FEAT-057 Reuse)
- **Telemetrie-Integration** ueber bestehende `diagnose_event`-Tabelle (FEAT-058)
- **Pure-Logic-Helpers** in `.ts`-Files (analog [[feedback-pure-helper-extraction-for-jsdom-free-tests]] aus IS SLC-305)
- **Mobile-Layout** Pflicht — alle drei Komponenten zeigen auf 375px-Viewport saubere Touch-Targets >=44px ohne horizontalen Scroll
- **Playwright-Snapshot** fuer 5 Schluessel-Fragen-Typen (1 Hygiene + 2 Skala + 1 Reflexion + 1 Choice-Bestand)

## Out of Scope

- **AnswerOptionCard.tsx-Aenderungen** — V6.3-Bestand strict unveraendert (parallele Existenz)
- **Frage-Reordering UI** — V8.1+
- **Save-and-resume-later UI** — bestehender Block-Submit-Pattern reuse ohne Erweiterung
- **Voice-Input-Integration** fuer Reflexion — V8.1+ (Reuse FEAT-015)
- **Vorschau / Zusammenfassung** waehrend Bearbeitung — Bericht entsteht in SLC-150/151
- **Cross-Modul-Validierung** — V8.1+
- **Style-Guide-V2-Re-Design** — nur konforme Anwendung der V7.3-Style-Guide-V2-Tokens
- **PDF-Renderer** — SLC-150 + SLC-151
- **Integration End-to-End-Email** — SLC-152

## Pre-Conditions

- ✓ SLC-148 done (Template-Daten mit `answer_schema_kind` LIVE auf Coolify-DB)
- ✓ V7.3 Style-Guide-V2-Tokens etabliert (block-colors.ts, AnswerOptionCard-Reuse-Pattern, EditableText, HelperTextModal)
- ✓ FEAT-058 Telemetrie LIVE (V7.2 SLC-139)
- ✓ Worktree `v8-mandanten-report` exists (aus SLC-148 MT-0 Setup)

## Visual-Differenzierung 5-Stufen-Skala (RPT-349 OQ-2 Entscheidung)

**Gewaehlter Pfad: neutrale Grauskala mit subtilem Accent-Indikator beim ausgewaehlten Item.**

**Begruendung:**
- UX-Tonalitaets-Implikation: Mandant darf "Stufe 1" antworten ohne sich beschaemt zu fuehlen
- Rot-Amber-Gruen-Gradient signalisiert "Stufe 1 = schlecht" und triggered Selbst-Schoenfaerbung
- Style-Guide-V2 neutrale Tailwind `slate-XXX`-Palette ist konsistent zu V7.3 Polish-Look
- 5 Stufen-Labels (klare semantische Bedeutung) tragen die Information ohne Farb-Signal
- Bei Auswahl: Accent-Indikator (Border + leichter Background-Highlight in `brand-primary`) markiert Selektion neutral

**Implementierungs-Detail in MT-2:**
- Default-State: alle 5 Stufen `bg-slate-50 border-slate-200 text-slate-700`
- Hover: `bg-slate-100`
- Selected: `bg-brand-primary-50 border-brand-primary text-brand-primary-900`
- Touch-Target: jeder Stufen-Button `min-h-[44px]` + `min-w-[60px]` (Mobile)

## Micro-Tasks

### MT-1: HygieneAnswerPills.tsx + Pure-Logic + Vitest
- **Goal**: 3-Pill-Komponente "Ja / Teilweise / Nein" mit Pure-Logic-Extraction fuer jsdom-freie Vitest-Coverage.
- **Files**:
  - `src/components/diagnose/HygieneAnswerPills.tsx` (NEU) — React-Komponente
  - `src/components/diagnose/hygiene-answer-pills-logic.ts` (NEU) — Pure-Logic-Helpers
  - `src/components/diagnose/__tests__/hygiene-answer-pills-logic.test.ts` (NEU) — Vitest
- **Expected Behavior**:
  - Props: `{ questionId: string, helperText?: string, examplesMd?: string, currentValue?: 'ja' | 'teilweise' | 'nein', onChange: (value) => void, disabled?: boolean }`
  - 3 Pills nebeneinander auf Desktop / vertikal auf Mobile (375px)
  - Touch-Target `min-h-[44px]` + `min-w-[80px]` Pflicht (DEC-151)
  - Klick speichert `value` ueber `onChange` (Parent `QuestionFlow.tsx` handled DB-Persistenz)
  - Visualisierung: alle 3 Pills neutral (default `bg-slate-50`), selektierte Pill `bg-brand-primary-50 border-brand-primary`
  - **Keine** rot/amber/gruen-Farbsignalisierung pro Pill (subtil, nicht beschaemen, analog Skala-Entscheidung)
  - `EditableText` fuer Frage-Text-Render (Reuse FEAT-056)
  - `HelperTextModal`-Info-Icon-Slot bei `helperText` non-empty (Reuse FEAT-057)
  - Telemetrie-Hook fuer "answer-pill clicked" via Bestand-Pattern (`diagnose_event` via existing client-tracker)
  - Pure-Logic in `hygiene-answer-pills-logic.ts`: `getNextValue(currentValue, clickedValue): 'ja' | 'teilweise' | 'nein' | null` (Toggle-Logic: Re-Click same value -> null/deselect)
- **Verification** (Vitest jsdom-frei):
  - `getNextValue(undefined, 'ja')` -> `'ja'`
  - `getNextValue('ja', 'teilweise')` -> `'teilweise'`
  - `getNextValue('ja', 'ja')` -> `null` (Toggle-off)
  - `getNextValue('nein', 'ja')` -> `'ja'`
  - Render-Smoke Component (React-Testing-Library oder visual via Playwright MT-6) — alternativ deferred zu Live-Smoke
- **Dependencies**: SLC-148 done (Template mit `answer_schema_kind='hygiene_yes_partial_no'` LIVE)

### MT-2: ReifeSkalaAnswer.tsx + Pure-Logic + Vitest
- **Goal**: 5-Punkt-Skala-Komponente mit Stufen-Labels + Helper-Modal + neutrale Grauskala (OQ-2 entschieden).
- **Files**:
  - `src/components/diagnose/ReifeSkalaAnswer.tsx` (NEU) — React-Komponente
  - `src/components/diagnose/reife-skala-answer-logic.ts` (NEU) — Pure-Logic-Helpers
  - `src/components/diagnose/__tests__/reife-skala-answer-logic.test.ts` (NEU) — Vitest
- **Expected Behavior**:
  - Props: `{ questionId: string, helperText?: string, examplesMd?: string, currentValue?: number, scoreMapping: { 1: 0, 2: 2, 3: 5, 4: 8, 5: 10 }, onChange: (score: number, stufe: number) => void, disabled?: boolean }`
  - 5 Stufen-Buttons horizontal auf Desktop / vertikal auf Mobile
  - Pro Stufe Label aus FEAT-064 Spec:
    - 1 — "Noch gar nicht vorhanden"
    - 2 — "Erste Ansaetze"
    - 3 — "Teilweise implementiert"
    - 4 — "Weitgehend etabliert"
    - 5 — "Vollstaendig etabliert + belastbar"
  - Touch-Target `min-h-[44px]` + `min-w-[60px]` Mobile
  - Neutrale Grauskala (siehe Visual-Differenzierung oben)
  - Klick mappt Stufe (1-5) auf Score via scoreMapping-Prop und ruft `onChange(score, stufe)`
  - EditableText + HelperTextModal-Integration analog HygieneAnswerPills
  - Pure-Logic in `reife-skala-answer-logic.ts`: `stufeToScore(stufe, scoreMapping): number`, `scoreToStufe(score, scoreMapping): number | null`, `formatStufeLabel(stufe): string`
- **Verification** (Vitest):
  - `stufeToScore(1, {1:0,2:2,3:5,4:8,5:10})` -> `0`
  - `stufeToScore(3, ...)` -> `5`
  - `stufeToScore(5, ...)` -> `10`
  - `scoreToStufe(0, ...)` -> `1`, `scoreToStufe(5, ...)` -> `3`, `scoreToStufe(10, ...)` -> `5`
  - `scoreToStufe(7, ...)` -> `null` (kein exakter Stufen-Match, Defensive)
  - `formatStufeLabel(1)` -> `"Noch gar nicht vorhanden"`
  - `formatStufeLabel(5)` -> `"Vollstaendig etabliert + belastbar"`
- **Dependencies**: SLC-148 done (Template mit `answer_schema_kind='reife_skala_5'` + `score_mapping` LIVE)

### MT-3: ReflexionTextarea.tsx + Pure-Logic + Auto-Save-Indikator + Vitest
- **Goal**: Freitext-Textarea-Komponente mit Auto-Save-Indikator (FEAT-059 V7.3-Pattern-Reuse) + Zeichen-Counter.
- **Files**:
  - `src/components/diagnose/ReflexionTextarea.tsx` (NEU) — React-Komponente
  - `src/components/diagnose/reflexion-textarea-logic.ts` (NEU) — Pure-Logic-Helpers
  - `src/components/diagnose/__tests__/reflexion-textarea-logic.test.ts` (NEU) — Vitest
- **Expected Behavior**:
  - Props: `{ questionId: string, helperText?: string, examplesMd?: string, currentText?: string, maxChars?: number, onChange: (text: string) => void, isSaving?: boolean, disabled?: boolean }`
  - Default `maxChars=2000`
  - Textarea Style-Guide-V2-konform (`rounded-md border-slate-200 focus:border-brand-primary`)
  - Mobile-Layout: min-height 120px, max-height 300px, resize-vertical
  - Zeichen-Counter rechts unten: `{currentLength} / {maxChars}` — bei >90% gelb-Warnung, >100% rot-Block (`disabled` setzen)
  - Auto-Save-Indikator (Reuse V7.3 `AutoSaveIndicator` falls vorhanden): "Wird gespeichert..." (isSaving=true) -> "Gespeichert" (isSaving=false, ~2sec sichtbar) -> verblasst
  - EditableText fuer Frage-Text (Reuse FEAT-056)
  - HelperTextModal-Info-Icon falls helperText (Reuse FEAT-057)
  - **Keine** Score-Berechnung — Wert geht in `capture_response.answer_text`
  - onChange debounced 500ms (Parent QuestionFlow.tsx handled DB-Persistenz via Block-Submit)
  - Pure-Logic in `reflexion-textarea-logic.ts`: `getCounterState(currentLength, maxChars): 'ok' | 'warning' | 'error'`, `truncateToMaxChars(text, maxChars): string`, `shouldDisableSubmit(text, maxChars): boolean`
- **Verification** (Vitest):
  - `getCounterState(0, 2000)` -> `'ok'`, `getCounterState(1800, 2000)` -> `'warning'` (>=90%), `getCounterState(2100, 2000)` -> `'error'` (>100%)
  - `truncateToMaxChars("hello", 3)` -> `"hel"`
  - `truncateToMaxChars("hello", 100)` -> `"hello"` (no-op)
  - `shouldDisableSubmit("ok", 100)` -> `false`, `shouldDisableSubmit("a".repeat(101), 100)` -> `true`
- **Dependencies**: SLC-148 done (Template mit `answer_schema_kind='reflexion_freitext'` LIVE)

### MT-4: QuestionFlow.tsx Switch-Logik + 4-Branch-Vitest
- **Goal**: Branching in `QuestionFlow.tsx` (oder dessen Sub-Component in `/dashboard/diagnose/run/[id]/page.tsx`) auf `question.answer_schema_kind` mit 4 Cases.
- **Files**:
  - `src/components/diagnose/QuestionFlow.tsx` (additiv — Switch-Logik in Render-Branch)
  - `src/components/diagnose/__tests__/question-flow-switch-logic.test.ts` (NEU) — Vitest fuer reine Switch-Logic-Helper
  - `src/components/diagnose/question-flow-switch-logic.ts` (NEU oder additiv falls existent) — Pure-Logic-Helper
- **Expected Behavior**:
  - Pure-Logic-Helper: `getAnswerComponentKind(question: { answer_schema_kind?: string }): 'hygiene' | 'reife_skala' | 'reflexion' | 'choice_5' | 'unknown'`
  - Render-Branch in QuestionFlow.tsx:
    - `'hygiene_yes_partial_no'` -> `<HygieneAnswerPills {...props} />`
    - `'reife_skala_5'` -> `<ReifeSkalaAnswer {...props} scoreMapping={question.score_mapping} />`
    - `'reflexion_freitext'` -> `<ReflexionTextarea {...props} />`
    - `'choice_5'` (V6.3-Bestand) -> `<AnswerOptionCard {...props} />` (UNVERAENDERT)
    - Default/unknown -> Defensive Render mit `<div>Unbekanntes Antwort-Schema</div>` + console.error
- **Verification** (Vitest):
  - `getAnswerComponentKind({ answer_schema_kind: 'hygiene_yes_partial_no' })` -> `'hygiene'`
  - `getAnswerComponentKind({ answer_schema_kind: 'reife_skala_5' })` -> `'reife_skala'`
  - `getAnswerComponentKind({ answer_schema_kind: 'reflexion_freitext' })` -> `'reflexion'`
  - `getAnswerComponentKind({ answer_schema_kind: 'choice_5' })` -> `'choice_5'`
  - `getAnswerComponentKind({})` -> `'unknown'` (V6.3-Backwards-Compatibility: ohne answer_schema_kind-Feld default auf legacy)
  - `getAnswerComponentKind({ answer_schema_kind: 'invalid' })` -> `'unknown'`
- **Dependencies**: MT-1, MT-2, MT-3

### MT-5: Telemetrie-Integration in 3 neue Components
- **Goal**: Frage-Start + Frage-Answer + Helper-Text-Open Events fuer V8-Schemata via bestehende `diagnose_event`-Tabelle (FEAT-058 Reuse).
- **Files**:
  - `src/components/diagnose/HygieneAnswerPills.tsx` (additiv — Telemetry-Hook)
  - `src/components/diagnose/ReifeSkalaAnswer.tsx` (additiv)
  - `src/components/diagnose/ReflexionTextarea.tsx` (additiv)
- **Expected Behavior**:
  - Reuse bestehender Client-Side-Tracker aus FEAT-058
  - Events pro Komponente:
    - `question_start` beim Mount mit `question_id` + `answer_schema_kind`
    - `question_answer` beim Klick/Change mit `question_id` + `value` (bei Reflexion: `text_length` statt `value`)
    - `helper_text_open` beim Helper-Modal-Open (Reuse FEAT-057-Pattern)
  - Optional: `question_skip` falls User Frage ohne Antwort weiterklickt — Reuse-Pattern V7.2 falls existent
- **Verification**:
  - Telemetry-Hook Aufruf via spied mock in jsdom-freier Vitest deferred zu Live-Smoke MT-6
  - Live-Smoke in MT-6 prueft `diagnose_event`-Rows nach Founder-Test
- **Dependencies**: MT-1, MT-2, MT-3

### MT-6: Records + /qa SLC-149 + Mobile-Smoke
- **Goal**: Project-Records updaten + /qa fuer Code-Side + Mobile-Smoke via Playwright-MCP fuer 5 Schluessel-Fragen-Typen.
- **Files**:
  - `docs/STATE.md` — Current-Focus auf SLC-149 done
  - `slices/INDEX.md` — SLC-149 status `done`
  - `planning/backlog.json` — BL-129 status `done`
  - `features/INDEX.md` — FEAT-064 status `done`
  - `reports/RPT-XXX.md` (NEU) — Completion-Report + /qa-Report
- **Expected Behavior**:
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-149-Scope EXIT=0
  - Vitest SLC-149-Scope alle PASS (hygiene + reife_skala + reflexion + question-flow-switch)
  - Founder Live-Smoke via Playwright-MCP auf production (oder via Playwright-MCP gegen Coolify-DB-tunneled dev-server) — 5 Schluessel-Fragen-Typen:
    1. M0.1 Hygiene (HygieneAnswerPills)
    2. F1.1 Skala (ReifeSkalaAnswer)
    3. F9.1 Skala-Modul-9 (ReifeSkalaAnswer)
    4. R10.1.1 Reflexion (ReflexionTextarea)
    5. V6.3 partner_diagnostic_v1-Frage (AnswerOptionCard, Co-Existenz-Check)
  - 375px-Viewport-Smoke: alle 5 Touch-Targets >=44px, kein horizontaler Scroll
  - Telemetrie-Check: diagnose_event-Rows nach Test (per SQL-Query)
- **Verification**:
  - /qa-Report PASS code-side + Mobile-Smoke
  - Co-Existenz: V6.3 partner_diagnostic_v1-Render funktioniert weiter
- **Dependencies**: MT-5

## Acceptance Criteria (zusammengefuegt aus FEAT-064)

- **AC-1 HygieneAnswerPills funktional**: 3 Pills, Klick speichert `'ja'|'teilweise'|'nein'`, Touch-Target >=44px (FEAT-064 AC-1)
- **AC-2 ReifeSkalaAnswer funktional**: 5 Stufen, Klick speichert Score 0|2|5|8|10 + Stufe 1-5, Labels gerendert, Touch-Target >=44px (FEAT-064 AC-2)
- **AC-3 ReflexionTextarea funktional**: Freitext, speichert `answer_text`, Auto-Save indikator, keine Score-Berechnung (FEAT-064 AC-3)
- **AC-4 Switch-Logik korrekt**: QuestionFlow.tsx rendert pro Frage die richtige Komponente, Vitest 4 Branchings (FEAT-064 AC-4)
- **AC-5 EditableText-Konsumiert**: Frage-Text via `<EditableText keyPath defaultText />`, strategaize_admin kann editieren ohne Code-Deploy (FEAT-064 AC-5)
- **AC-6 HelperTextModal funktioniert**: Info-Icon-Klick oeffnet Modal mit helper_text + examples_md (FEAT-064 AC-6)
- **AC-7 Live-Smoke Founder-Test**: Founder durchlaeuft komplette V8-Diagnose (47 Fragen) ohne UX-Hindernis, Verdict dokumentiert (FEAT-064 AC-7)
- **AC-8 Mobile-Verifikation**: Playwright-Snapshot fuer 5 Schluessel-Fragen-Typen auf 375px-Viewport (FEAT-064 AC-8)
- **AC-9 Telemetrie integriert**: question_start + question_answer + helper_text_open Events ueber diagnose_event auch fuer V8-Templates (FEAT-064 AC-9)
- **AC-SLC-149-1 V6.3-Co-Existenz**: AnswerOptionCard mit partner_diagnostic_v1-Template rendert unveraendert, keine Vitest-Snapshot-Regression
- **AC-SLC-149-2 Quality-Gates**: tsc EXIT=0, ESLint EXIT=0, Vitest SLC-149-Scope PASS
- **AC-SLC-149-3 Pure-Logic-jsdom-frei**: alle Vitest-Cases laufen ohne jsdom, Component-Render-Tests deferred zu Live-Smoke MT-6 ([[feedback-pure-helper-extraction-for-jsdom-free-tests]])

## Wiring-Verification-Liste

- ✓ Template-Daten (SLC-148) -> question.answer_schema_kind -> QuestionFlow.tsx-Switch -> 4 Components
- ✓ HygieneAnswerPills onChange -> Parent capture_response.answer_value
- ✓ ReifeSkalaAnswer onChange -> Parent capture_response.answer_value (Score) + answer_value (Stufe? Optional)
- ✓ ReflexionTextarea onChange -> Parent capture_response.answer_text
- ✓ EditableText (FEAT-056) -> Frage-Text-Render in allen 3 neuen Components
- ✓ HelperTextModal (FEAT-057) -> Info-Icon in allen 3 Components bei helper_text non-empty
- ✓ Telemetrie (FEAT-058) -> diagnose_event-Rows pro V8-Frage
- ✓ V6.3 AnswerOptionCard -> unveraendert (Co-Existenz)

## Risks / Notable Concerns

- **R-1 ReifeSkalaAnswer-Visual-Differenzierung-Founder-Verdict**: Neutrale Grauskala (OQ-2 Entscheidung) wird Founder im Live-Smoke MT-6 visuell pruefen. Wenn Founder findet "zu langweilig" -> Pivot zu subtilem Farb-Gradient als Hotfix.
  - **Mitigation**: MT-6 expliziter Founder-Verdict-Check. Bei Pivot: ~30min Tailwind-Color-Change in `reife-skala-answer.tsx`.
- **R-2 jsdom-frei-Pure-Logic-Skopus-Drift**: Versuchung in MT-1..MT-3 React-Testing-Library mit jsdom hinzuzufuegen ist hoch. Strategaize-Setup hat aber kein jsdom ([[feedback-pure-helper-extraction-for-jsdom-free-tests]]).
  - **Mitigation**: Hart durchziehen: Display-Logik in `.ts`-Files, Vitest auf Pure-Funktion. Component-Render-Verifikation in MT-6 Live-Smoke.
- **R-3 QuestionFlow.tsx-Switch-Regression V6.3**: Wenn Switch-Logik falsch implementiert -> V6.3 partner_diagnostic_v1-Fragen rendern broken.
  - **Mitigation**: AC-SLC-149-1 + MT-4 Vitest-Case `'choice_5'` -> `'choice_5'` + MT-6 Live-Smoke 5. Frage-Typ V6.3-Co-Existenz.
- **R-4 EditableText-Re-Render-Stalls**: EditableText (FEAT-056) hat in V7.1 SLC-137 Cache-Invalidation-Bug gehabt. V8-Antwort-Komponenten konsumieren EditableText massiv.
  - **Mitigation**: Pattern-Reuse 1:1 aus QuestionFlow.tsx (V7.1) — keine Re-Implementation. Falls Issue: BL-Item separat (V8.1+).
- **R-5 Telemetrie-Volume-Spike**: 47 Fragen pro Session * 3 Event-Typen = 141 Events pro Session. V7.2 FEAT-058 hat Schwellen ueber 100 Events pro Session ggf. Performance-Implikationen.
  - **Mitigation**: V7.2 Live-Smoke RPT-329 hat 80 Events / Session gezeigt ohne Performance-Issue. Bei Spike: V8.1+ optimieren.
- **R-6 Mobile-375px-Layout-Pflicht-Drift**: 3 neue Components muessen Mobile-konform sein. Touch-Target-Audit-Skript V7.4 (BL-121 wontfix) nicht aktiv.
  - **Mitigation**: MT-6 Playwright-MCP Mobile-Snapshot explizit. AC-8 + AC-2 + AC-1 hart enforcen.

## Verification Strategy

- **TDD jsdom-frei** ([[feedback-pure-helper-extraction-for-jsdom-free-tests]]): Pure-Logic in `.ts`-Files, Vitest auf Helper-Functions
- **Component-Render** deferred zu MT-6 Live-Smoke via Playwright-MCP (Mobile + Desktop)
- **V6.3-Co-Existenz** durch Vitest-Switch-Test (`choice_5`-Branch) + Live-Smoke 5. Frage-Typ
- **Founder Live-Smoke** komplette 47-Fragen-V8-Diagnose End-to-End in MT-6 (AC-7)

## Dependencies / Pre-Conditions Tabelle

| Pre-Condition | Status | Aktion |
|---|---|---|
| SLC-148 done | pending | /backend SLC-148 vor /frontend SLC-149 |
| V7.3 Style-Guide-V2-Tokens | ✓ done | block-colors.ts, AnswerOptionCard-Pattern |
| FEAT-056 EditableText LIVE | ✓ done | V7.1 SLC-137 |
| FEAT-057 HelperTextModal LIVE | ✓ done | V7.1 SLC-138 |
| FEAT-058 Telemetrie LIVE | ✓ done | V7.2 SLC-139 |
| Worktree `v8-mandanten-report` exists | pending | SLC-148 MT-0 Setup |
| OQ-2 Visual-Differenzierung entschieden | ✓ done | Neutrale Grauskala (dieser Slice-File) |

## Cross-References

- **Architektur**: `docs/ARCHITECTURE.md` V8-Addendum (Implementation Direction SLC-149)
- **Feature**: `features/FEAT-064-mandanten-report-fragebogen-ui.md`
- **Decisions**: DEC-151 (Touch-Target 44px shadcn-Default-Button h-11), DEC-150 (EditableText-Pattern)
- **Reuse-Patterns**:
  - V6.3 AnswerOptionCard (Choice-Schema-Pattern, strict unveraendert fuer Co-Existenz)
  - V7.1 FEAT-056 EditableText
  - V7.1 FEAT-057 HelperTextModal
  - V7.2 FEAT-058 Telemetrie + diagnose_event
  - V7.3 FEAT-059 AutoSaveIndicator
- **Memory**:
  - [[feedback-cumulative-single-branch-pattern]] — Branch-Strategie (selber Branch wie SLC-148)
  - [[feedback-pure-helper-extraction-for-jsdom-free-tests]] — Pure-Logic-Pattern fuer Strategaize jsdom-frei Setup
  - [[feedback-style-guide-v2-mandatory]] — V8 nutzt V2-Sidebar-Pattern
  - [[feedback-design-premium-look-pflicht]] — Premium-Look auch fuer UI
