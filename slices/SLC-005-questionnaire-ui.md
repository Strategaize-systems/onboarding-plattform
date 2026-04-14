# SLC-005 — Questionnaire-UI-Portierung

- Feature: FEAT-003 (Teil 2/3)
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Blueprint-V3.4-Questionnaire-UI auf das neue `capture_session`-Schema portieren. Kunde kann einen Block oeffnen, Fragen beantworten, Autosave laeuft, KI-Chat (bestehend) laeuft gegen Bedrock.

## In Scope
- Route `/capture/[sessionId]/block/[blockKey]` — Questionnaire-Detail-Seite
- Portierung der bestehenden Blueprint-Questionnaire-Komponenten (Inputs, Textareas, Radio-Groups) auf neue Datenquelle
- Answer-Storage: entweder als Spalte `capture_session.answers jsonb` (MVP) ODER als separate `capture_answer`-Tabelle — **Entscheidung in MT-1 treffen**. Architektur-Doc favorisiert schlank → vorschlagen: JSONB auf Session-Level, Key = block_key + question_id
- Autosave (Debounce 500ms) — Blueprint-Pattern uebernehmen
- KI-Chat-Route `/api/chat/block` auf Bedrock-Client (aus Blueprint-Erbe) — Migration der Chat-UI auf neue Session-Context-Uebergabe
- Keine Block-Submit-Logik (kommt in SLC-006)

## Out of Scope
- Block-Submit + Checkpoint (SLC-006)
- Exception-Feld (SLC-007)
- KI-Verdichtung (SLC-008)

## Acceptance
- Kunde sieht Block-Fragen, kann sie beantworten, Antworten persistieren nach Reload
- KI-Chat im Block funktioniert, geht ueber Bedrock, kein Ollama
- Mindestens 1 Happy-Path-Test fuer Answer-Persistenz
- Cross-Tenant-Write blockiert

## Dependencies
- SLC-001..004

## Risks
- Blueprint-Answer-Shape vs. neue Session-JSONB-Shape: Mapping-Aufwand moeglicherweise unterschaetzt
- Bedrock-Chat-Client koennte im Blueprint noch Ollama-Spuren haben → Rule-4-Stop falls Client-Umbau-Aufwand groesser als erwartet
- Autosave-Race-Condition bei parallelem Tab

## Micro-Tasks

### MT-1: Answer-Storage-Entscheidung
- Goal: Entscheiden, ob Antworten in `capture_session.answers jsonb` oder `capture_answer`-Tabelle.
- Files: `docs/DECISIONS.md` (DEC-011), ggf. `sql/migrations/028_capture_answers_column.sql`
- Expected behavior: Analyse (Lesen-Frequenz vs. RLS-Granularitaet vs. Autosave-Konflikte) → Entscheidung committed. Default-Empfehlung: JSONB auf Session-Ebene, Key `${block_key}.${question_id}`.
- Verification: DEC-011 in DECISIONS.md, Migration falls Spalte noetig.
- Dependencies: SLC-001

### MT-2: Questionnaire-Detail-Route
- Goal: Block-Fragen rendern, Antworten laden, Input-Felder.
- Files:
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/page.tsx`
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/QuestionnaireForm.tsx`
- Expected behavior: Liest Template-Block via session.template_version, rendert Fragen. Formular mit Client-State.
- Verification: Manuell: Block oeffnet, Fragen sichtbar.
- Dependencies: MT-1

### MT-3: Autosave-Server-Action
- Goal: `saveAnswer(sessionId, blockKey, questionId, value)` mit Debounce-Client.
- Files:
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/actions.ts`
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/actions.test.ts`
- Expected behavior: UPDATE capture_session.answers jsonb (oder capture_answer UPSERT). Nach Reload: Werte da.
- Verification: Test + Manual-Reload-Check.
- Dependencies: MT-1, MT-2

### MT-4: KI-Chat-Portierung auf Bedrock
- Goal: Bestehenden Blueprint-Chat-Endpoint fuer neue Session-Context verkabeln.
- Files:
  - `src/app/api/chat/block/route.ts`
  - `src/lib/ai/bedrock-chat-client.ts` (pruefen, ob schon aus Blueprint vorhanden)
- Expected behavior: POST `/api/chat/block` mit `{ sessionId, blockKey, messages }` → Bedrock-Call (Claude Sonnet eu-central-1), streamt Response. Kein Ollama-Codepfad mehr aktiv.
- Verification: grep `ollama` in `src/` liefert 0 Treffer (oder nur in docs/comments). E2E: Chat-Nachricht → Antwort in UI.
- Dependencies: MT-2

### MT-5: Chat-UI-Komponente
- Goal: Chat-Panel neben Questionnaire-Formular.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/ChatPanel.tsx`
- Expected behavior: Message-Liste, Input, Send-Button; nutzt Endpoint aus MT-4.
- Verification: Manuell.
- Dependencies: MT-4

### MT-6: Tests — Answer-Persistenz + RLS-Write-Schutz
- Goal: Zwei Tests: Happy-Path Save + Tenant-B-User darf nicht in Tenant-A-Session schreiben.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/__tests__/persist.test.ts`
- Verification: `npm run test -- persist` gruen.
- Dependencies: MT-3

## Verification Summary
- Build + Tests gruen
- grep `ollama` leer
- Manual: Block bearbeitet, Reload-Persistenz verifiziert, Chat funktioniert
