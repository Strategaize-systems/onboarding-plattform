# SLC-007 — Exception-Mode-Layer

- Feature: FEAT-004
- Status: done
- Priority: Medium
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Pro Block gibt es ein optionales Exception-Freitext-Feld. Der Inhalt wird im Block-Submit mit eingefroren (Teil des `block_checkpoint.content`) und fliesst in die KI-Verdichtung ein. Knowledge Units aus Exception-Eintraegen tragen `source = 'exception'`.

## In Scope
- UI: Exception-Textarea im Block-Detail (unter dem Questionnaire) mit klarem Label
- Autosave des Exception-Texts
- Einbindung in Checkpoint-`content` (SLC-006 MT-4 erweitern: `content.exception = text`)
- Verdichtungs-Prompt (SLC-008) erhaelt Exception als separaten Input-Block

## Out of Scope
- Eigenes Exception-Dashboard (V2+)
- Sprach-Input (V5 Voice)

## Acceptance
- User gibt Exception-Text ein, Reload behaelt Text
- Submit erzeugt Checkpoint mit `content.exception`
- Nach SLC-008 Deploy: Verdichtung produziert >= 1 KU mit `source = 'exception'` (wenn Text nicht leer)

## Dependencies
- SLC-005 (Questionnaire-UI)
- SLC-006 (Submit + Checkpoint)
- SLC-008 (fuer End-to-End-Acceptance-Punkt)

## Risks
- Prompt-Engineering-Aufwand fuer Exception-Source-Markierung in SLC-008 — Exception-Absatz im Prompt klar separieren

## Micro-Tasks

### MT-1: Exception-Feld im Answer-Storage
- Goal: Storage-Konvention fuer Exception-Text.
- Files: ggf. `docs/DECISIONS.md` Notiz (Teil DEC-011 oder DEC-012)
- Expected behavior: Storage unter `capture_session.answers.__exception__.${block_key}` oder eigene Spalte. Entscheidung analog SLC-005 MT-1.
- Verification: Konvention dokumentiert.
- Dependencies: SLC-005 MT-1

### MT-2: UI-Textarea + Autosave
- Goal: Sichtbares Exception-Feld unter Questionnaire.
- Files:
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/ExceptionField.tsx`
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/QuestionnaireForm.tsx` (einbinden)
- Expected behavior: Textarea mit Placeholder "Zusaetzliche Beobachtungen, die nicht in die Fragen passen". Autosave wie Answers.
- Verification: Manuell + Reload.
- Dependencies: MT-1

### MT-3: Submit-Action erweitern
- Goal: Exception-Text in Checkpoint-Content.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/submit-action.ts` (erweitern)
- Expected behavior: `content.exception = exceptionText || null`. `content_hash` automatisch neu.
- Verification: Nach Submit: `SELECT content->>'exception' FROM block_checkpoint WHERE id = ...`.
- Dependencies: SLC-006 MT-4, MT-2

### MT-4: Verdichtungs-Prompt erweitern
- Goal: Worker-Prompt (SLC-008) bekommt Exception als eigenen Input-Absatz mit Source-Marker.
- Files: Prompt-Template in `sql/migrations/XXX_ai_prompts_seed.sql` oder `src/workers/condensation/prompt.ts`
- Expected behavior: Prompt enthaelt Absatz "Kunde hat zusaetzlich ausserhalb der Fragen vermerkt: <exception>. Knowledge Units, die daraus entstehen, markiere mit source=exception."
- Verification: Worker-Unit-Test (SLC-008) pruft, dass KUs korrekt `source = exception` bekommen.
- Dependencies: SLC-008 MT-3

### MT-5: Tests
- Goal: Unit-Test Exception-Autosave + Integrationstest Checkpoint-Content.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/__tests__/exception.test.ts`
- Verification: `npm run test -- exception` gruen.
- Dependencies: MT-2, MT-3

## Verification Summary
- Exception-Feld sichtbar, autosave funktioniert
- Checkpoint-Content enthaelt Exception-Text
- Nach SLC-008: KUs mit `source = exception` werden erzeugt
