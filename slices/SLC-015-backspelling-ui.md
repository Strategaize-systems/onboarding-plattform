# SLC-015 — Backspelling-UI

## Zuordnung
- Feature: FEAT-011 (Auto-Gap-Backspelling Frontend)
- Version: V2
- Priority: High
- Depends on: SLC-014

## Ziel
Kunden sehen Nachfragen im Questionnaire-UI und koennen sie beantworten. Dashboard zeigt Badge fuer Bloecke mit offenen Nachfragen. Debrief-UI zeigt Backspelling-Status.

## Scope
- Nachfragen-Sektion im Questionnaire (unterhalb der Block-Fragen)
- Dashboard-Badge fuer offene Nachfragen pro Session/Block
- Debrief-UI: Backspelling-Status-Anzeige (welche Bloecke hatten Backspelling, Runde, Status)
- i18n fuer alle neuen UI-Elemente (de/en/nl)

## Nicht in Scope
- E-Mail-Benachrichtigung bei neuen Nachfragen (V2.1)
- Push-Notification (V2.1)
- Gap-Questions manuell durch Berater erstellen (V3)

## Acceptance Criteria
1. Questionnaire zeigt Nachfragen-Sektion wenn gap_questions fuer den Block existieren
2. Kunde kann Nachfragen beantworten (Textarea + Submit-Button)
3. Nach Submit werden Antworten gespeichert und Re-Condensation gestartet
4. Dashboard zeigt Badge/Count fuer offene Nachfragen
5. Debrief-UI zeigt Backspelling-Status pro Block
6. i18n komplett (de/en/nl)
7. npm run build erfolgreich

### Micro-Tasks

#### MT-1: Gap-Questions Query-Hook
- Goal: React-Hook zum Laden der gap_questions fuer einen Block
- Files: `src/app/capture/[sessionId]/block/[blockKey]/use-gap-questions.ts`
- Expected behavior: Supabase-Query: gap_question WHERE capture_session_id + block_key, sortiert nach priority + created_at. Liefert pending + answered Gaps.
- Verification: npm run build
- Dependencies: none

#### MT-2: GapQuestionsSection-Komponente
- Goal: UI-Sektion fuer Nachfragen im Questionnaire
- Files: `src/app/capture/[sessionId]/block/[blockKey]/gap-questions-section.tsx`
- Expected behavior: Zeigt pending Gaps als Karten (Frage-Text, Kontext, Priority-Badge). Pro Gap: Textarea + Submit-Button. Nach Submit: Aufruf gap-actions.answerGapQuestion(). Spinner waehrend Speicherung. Bestaetigungs-Feedback nach Submit. Bereits beantwortete Gaps ausgegraut mit Antwort-Text.
- Verification: npm run build
- Dependencies: MT-1, SLC-014 MT-5

#### MT-3: Questionnaire-Page Integration
- Goal: GapQuestionsSection in die bestehende Questionnaire-Page einbinden
- Files: `src/app/capture/[sessionId]/block/[blockKey]/page.tsx`
- Expected behavior: Unterhalb der Questionnaire-Fragen wird GapQuestionsSection gerendert (nur wenn Gaps existieren). Keine Aenderung am bestehenden Questionnaire-Flow.
- Verification: npm run build
- Dependencies: MT-2

#### MT-4: Dashboard-Badge fuer offene Gaps
- Goal: Dashboard zeigt Anzahl offener Nachfragen pro Session
- Files: `src/app/dashboard/dashboard-client.tsx`
- Expected behavior: Pro Session-Karte: Badge mit Count offener gap_questions (status=pending). Query: COUNT gap_question WHERE status='pending' GROUP BY capture_session_id. Badge nur sichtbar wenn Count > 0.
- Verification: npm run build
- Dependencies: none

#### MT-5: Debrief-UI Backspelling-Status
- Goal: Debrief-Block-Seite zeigt Backspelling-Info
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DebriefBlockClient.tsx`
- Expected behavior: Neue Sektion "Backspelling" unterhalb der KU-Liste. Zeigt: Anzahl Runden, offene/beantwortete Gaps, Orchestrator-Score (aus quality_report). Nutzt bestehenden Supabase-Query-Pattern.
- Verification: npm run build
- Dependencies: none

#### MT-6: i18n Keys
- Goal: Alle neuen UI-Texte in de/en/nl
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Keys fuer: gap_questions.title, gap_questions.context, gap_questions.submit, gap_questions.answered, gap_questions.pending_badge, debrief.backspelling.title, debrief.backspelling.rounds, debrief.backspelling.score
- Verification: npm run build (keine fehlenden i18n-Keys)
- Dependencies: MT-2, MT-5
