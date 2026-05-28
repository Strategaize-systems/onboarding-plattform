# FEAT-064 — Fragebogen-UI-Komponenten (Hygiene + 5-Punkt-Reife + Reflexion)

**Version:** V8
**Status:** planned
**Created:** 2026-05-28
**Related Slice:** SLC-149 (to be planned in /slice-planning V8)

## Purpose

Liefert die drei neuen Antwort-Schema-UI-Komponenten fuer die V8 Mandanten-Report-Teaser-Diagnose, die im bestehenden Fragebogen-Flow (V1 FEAT-003 + V2 FEAT-016 + V6.3 FEAT-045) reibungslos eingebettet werden.

Heute rendert `QuestionFlow.tsx` nur eine Antwort-Form: 5-Choice-Cards mit diskretem Score-Mapping (V6.3 Stand). V8 braucht drei zusaetzliche Antwort-Schemata:

1. **Hygiene-Trichotomie** (Ja/Teilweise/Nein) — Modul 0
2. **5-Punkt-Reife-Skala** (mit klaren Labels "Noch gar nicht vorhanden" .. "Vollstaendig etabliert + belastbar") — Module 1-9
3. **Reflexion-Textareas** (Freitext ohne Score) — Modul 10

## Problem

- V6.3 hat `AnswerOptionCard`-Komponente fuer 5 Choices mit diskreten Scores. Das ist Skala-aehnlich, aber Labels und semantische Bedeutung sind in V6.3-Template-spezifisch ("Trifft voll zu" / "Trifft eher zu" / ...).
- V8 5-Punkt-Reife-Skala hat **andere** Labels (Reife-Stufen, nicht Zustimmungs-Grad). Reuse-Risiko: wenn `AnswerOptionCard` 1:1 reused wird, leiden Labels semantisch.
- Hygiene-Trichotomie (3 Optionen statt 5) ist visuell anders — Pills statt Cards, weil binaer-aehnlich.
- Reflexion-Textareas existieren bisher gar nicht in `QuestionFlow.tsx` — alle V1-V7 Templates haben nur Auswahl-Fragen, keine offenen Felder.

## In Scope

1. **Komponente `HygieneAnswerPills`** — 3 Pills "Ja / Teilweise / Nein" als toggle-button-group. Touch-Target >=44px (DEC-151 konform). State-Persistenz analog AnswerOptionCard via Block-Submit-Pattern. Visualisierung: gruen / amber / rot-tendency (subtil, nicht ueberbetonen — Mandant darf "Nein" antworten ohne sich beschaemt zu fuehlen).

2. **Komponente `ReifeSkalaAnswer`** — 5-Punkt-Skala mit:
   - Horizontale Stufen-Leiste 1-5 (oder vertikal auf Mobile)
   - Pro Stufe sichtbares Label aus `EXIT_READINESS_PRINZIPIEN.md` Fragebogen-Abschnitt:
     - 1 — Noch gar nicht vorhanden
     - 2 — Erste Ansaetze
     - 3 — Teilweise implementiert
     - 4 — Weitgehend etabliert
     - 5 — Vollstaendig etabliert + belastbar
   - Visual-Differenzierung der Stufen (Farb-Gradient rot-amber-gruen oder neutrale Grauskala — Style-Guide-V2-Designentscheidung)
   - Helper-Modal pro Frage falls `helper_text` + `examples_md` im Template (Reuse FEAT-057)

3. **Komponente `ReflexionTextarea`** — Freitext-Eingabe mit:
   - Optional Zeichen-Counter (z.B. 0/2000)
   - Auto-Save-Hinweis (analog V7.3 FEAT-059 AutoSaveIndicator-Pattern)
   - Keine Score-Berechnung (Wert wird in `capture_response.answer_text` gespeichert als Freitext, nicht in `answer_value`)
   - Style-Guide-V2-konforme Textarea

4. **`QuestionFlow.tsx` Switch-Logik** — Branching auf `question.answer_schema_kind` (neuer Template-Datenpfad-Inferenz):
   - `'hygiene_yes_partial_no'` → `<HygieneAnswerPills />`
   - `'reife_skala_5'` → `<ReifeSkalaAnswer />`
   - `'reflexion_freitext'` → `<ReflexionTextarea />`
   - `'choice_5'` (Bestand V6.3) → `<AnswerOptionCard />` (unveraendert)

5. **EditableText-Integration** fuer Frage-Texte (Reuse FEAT-056) — Pflicht-Pattern wie in QuestionFlow.tsx etabliert.

6. **HelperTextModal-Integration** (Reuse FEAT-057) — Info-Icon-Slot pro Frage funktioniert in allen drei neuen Komponenten.

7. **Mobile-Layout** Pflicht — alle drei Komponenten zeigen auf 375px-Viewport saubere Touch-Targets ohne horizontalen Scroll.

## Out of Scope

- **Frage-Reordering UI** — nicht in V8
- **Save-and-resume-later UI** — bestehender Block-Submit-Pattern ohne neue Erweiterung
- **Inline-Helper-Text-Edit** durch strategaize_admin — Reuse-Pattern aus FEAT-057 unveraendert
- **Voice-Input-Integration** fuer Reflexion-Textfelder — V8.1+, Reuse FEAT-015 (Voice Input Whisper) als spaetere Erweiterung
- **Vorschau / Zusammenfassung waehrend Bearbeitung** — Bericht entsteht nach Session-Finalize
- **Cross-Modul-Validierung** (z.B. Modul 4 Vertrieb hoch, aber Modul 6 Datenbasis niedrig — Warnung) — V8.1+

## Acceptance Criteria

- **AC-1 HygieneAnswerPills funktional**: 3 Pills, Klick speichert in `capture_response.answer_value` ('ja'|'teilweise'|'nein'), Touch-Target >=44px Mobile.
- **AC-2 ReifeSkalaAnswer funktional**: 5 Stufen, Klick speichert in `answer_value` (Score 0|2|5|8|10), Labels gerendert aus Template-Daten (FEAT-063), Touch-Target >=44px Mobile.
- **AC-3 ReflexionTextarea funktional**: Freitext-Eingabe, speichert in `capture_response.answer_text`, Auto-Save funktioniert, keine Score-Berechnung.
- **AC-4 Switch-Logik korrekt**: QuestionFlow.tsx rendert pro Frage die richtige Komponente basierend auf `answer_schema_kind`. Vitest fuer alle 4 Branchings.
- **AC-5 EditableText-Konsumiert**: Frage-Text via `<EditableText keyPath="..." defaultText="..." />` gerendert, strategaize_admin kann Frage-Texte editieren ohne Code-Deploy (Reuse-Pattern).
- **AC-6 HelperTextModal funktioniert**: Info-Icon-Klick oeffnet Modal mit Helper-Text + Examples. Wenn `helper_text` leer → kein Icon.
- **AC-7 Live-Smoke Founder-Test**: Founder durchlaeuft komplette V8-Diagnose (alle 47 Fragen) und kann jede Frage ohne UX-Hindernis beantworten. Founder-Verdict dokumentiert in /qa-Report.
- **AC-8 Mobile-Verifikation**: Playwright-Snapshot fuer 5 Schluessel-Fragen-Typen auf 375px-Viewport (1 Hygiene + 2 Skala + 1 Reflexion + 1 Choice-Bestand).
- **AC-9 Telemetrie integriert**: Frage-Start + Frage-Answer + Helper-Text-Open Events werden ueber bestehende `diagnose_event`-Tabelle (FEAT-058) auch fuer V8-Template-Sessions geloggt.

## Technical Notes

- Bestehende QuestionFlow.tsx ist `dashboard/diagnose/run/[id]/page.tsx`-Konsument. Branching erfolgt in dieser Page-Component oder einem Sub-Component.
- `capture_response`-Schema hat heute `answer_value` (numeric) + `answer_text` (string) — additiv fuer Reflexion-Felder nutzen.
- AnswerOptionCard bleibt unveraendert (V6.3 partner_diagnostic_v1-Konsum), parallele Existenz.

## Cross-References

- **Pattern-Reuse:** V2 FEAT-016 Diagnose-Layer (Score-Mapping-Pattern), V6.3 FEAT-045 AnswerOptionCard (Choice-Schema-Pattern), V7.1 FEAT-056 EditableText, V7.1 FEAT-057 HelperTextModal, V7.2 FEAT-058 Telemetrie, V7.3 FEAT-059 AutoSaveIndicator
- **Konsumiert von:** FEAT-066 (Bericht-Renderer rendert die Antworten basierend auf gleichem Schema)
- **Konsumiert:** FEAT-063 (Template-Daten + Stufen-Lookup)
- **Bezug:** [[feedback-style-guide-v2-mandatory]], [[feedback-design-premium-look-pflicht]]
