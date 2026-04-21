# SLC-032 — Pipeline Integration + Debrief

## Goal
Dialogue als gleichwertiger Capture-Mode im gesamten System: Dashboard zeigt Dialogue-Sessions, Session-Erstellung mit Mode-Auswahl, Debrief-UI zeigt Meeting-Summary + Transkript + Gaps, Diagnose/SOP mit Dialogue-KUs.

## Feature
FEAT-021

## In Scope
- Dashboard: Dialogue-Sessions neben Questionnaire-Sessions
- Session-Erstellung: Mode-Auswahl (Questionnaire / Evidence / Dialogue)
- Debrief-UI: Meeting-Summary-Ansicht, Transkript-Link, Gaps-Anzeige
- KU-Source-Badge 'dialogue' im Debrief
- Diagnose-Layer mit Dialogue-KUs (Verifikation — kein Code-Change erwartet)
- SOP mit Dialogue-KUs (Verifikation — kein Code-Change erwartet)
- Navigation: Dialogue-Session-Uebersicht (Guide, Meeting-Status, Summary, KUs)
- i18n Keys

## Out of Scope
- Mid-Meeting-KI (V3.1)
- Cross-Meeting-Verdichtung (V3.1)
- Hybride Sessions (V3.1)

## Acceptance Criteria
- AC-1: Dashboard zeigt Dialogue-Sessions mit Mode-Icon
- AC-2: Session-Erstellung erlaubt Mode-Auswahl
- AC-3: Debrief zeigt Meeting-Summary pro Topic
- AC-4: Transkript als Volltext abrufbar im Debrief
- AC-5: Gaps sichtbar (nicht besprochene Themen)
- AC-6: source='dialogue' als Badge auf KUs
- AC-7: Diagnose-Generation funktioniert mit Dialogue-KUs
- AC-8: SOP-Generation funktioniert mit Dialogue-KUs
- AC-9: Keine Regression in bestehenden Questionnaire/Evidence-Sessions

## Dependencies
- SLC-031 (KUs + Summary + Gaps muessen existieren)
- SLC-027 (Meeting Guide UI)
- SLC-029 (Dialogue Session UI)

## Worktree
Empfohlen (SaaS, UI-Aenderungen an bestehenden Seiten)

### Micro-Tasks

#### MT-1: Session-Erstellung Mode-Auswahl
- Goal: Beim Erstellen einer Capture-Session Mode waehlen
- Files: `src/components/session/create-session-form.tsx` (erweitern oder neu)
- Expected behavior: Radio-Buttons oder Cards: Fragebogen / Dokumente / Gespraech. Mode wird auf capture_session.capture_mode gesetzt. Je nach Mode: Redirect zu Questionnaire, Evidence, oder Meeting-Guide-Editor.
- Verification: Session mit mode='dialogue' erstellen → Redirect zum Guide-Editor
- Dependencies: none

#### MT-2: Dashboard Dialogue-Sessions
- Goal: Dashboard zeigt Dialogue-Sessions gleichwertig
- Files: `src/components/dashboard/dashboard-client.tsx` (erweitern)
- Expected behavior: Session-Liste zeigt Mode-Icon (Fragebogen/Dokument/Mikrofon). Dialogue-Sessions zeigen Meeting-Status statt Block-Completion. Klick fuehrt zur Dialogue-Uebersicht.
- Verification: Dialogue-Session sichtbar im Dashboard mit korrektem Icon
- Dependencies: MT-1

#### MT-3: Dialogue-Session-Uebersicht
- Goal: Uebersichtsseite fuer eine Dialogue-Session
- Files: `src/app/admin/session/[sessionId]/dialogue/[dialogueId]/overview/page.tsx`
- Expected behavior: Zeigt: Meeting-Guide (Zusammenfassung), Meeting-Status, Teilnehmer, Recording-Dauer, Pipeline-Status. Links zu: Meeting-Guide-Editor, Meeting starten, Summary/Debrief.
- Verification: Uebersichtsseite rendert mit allen Informationen
- Dependencies: MT-1

#### MT-4: Debrief Meeting-Summary + Transkript + Gaps
- Goal: Debrief-UI Erweiterung fuer Dialogue-Sessions
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/page.tsx` (erweitern), `src/components/dialogue/meeting-summary-view.tsx`, `src/components/dialogue/transcript-viewer.tsx`, `src/components/dialogue/gaps-list.tsx`
- Expected behavior: Meeting-Summary pro Topic (Highlights, Entscheidungen, offene Punkte). Transkript als scrollbarer Volltext. Gaps als Liste mit Topic-Titeln. Alles unterhalb der bestehenden KU-Sektion.
- Verification: Debrief-Page fuer Dialogue-Block zeigt Summary + Transkript + Gaps
- Dependencies: MT-3

#### MT-5: KU-Source-Badge + Diagnose/SOP-Verifikation
- Goal: source='dialogue' Badge im Debrief. Verifizieren dass Diagnose/SOP mit Dialogue-KUs funktioniert.
- Files: `src/components/debrief/knowledge-unit-card.tsx` (erweitern)
- Expected behavior: KUs mit source='dialogue' zeigen blaues "Gespraech"-Badge (analog "Fragebogen"/"Evidenz"/"Manuell"). Diagnose-Generierung mit Dialogue-KUs liefert Ergebnis. SOP-Generierung liefert Ergebnis.
- Verification: Badge sichtbar. Diagnose + SOP Button funktionieren fuer Dialogue-Block.
- Dependencies: MT-4

#### MT-6: i18n + Regression-Test
- Goal: Uebersetzungen + Sicherstellen keine V2-Regression
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Alle neuen Dialogue-Strings uebersetzt. Bestehende Questionnaire-Session funktioniert unveraendert. Evidence-Session funktioniert unveraendert.
- Verification: Sprachwechsel OK. Bestehende Sessions oeffnen + funktionieren.
- Dependencies: MT-1..5
