# SLC-024 — Diagnose-Frontend + SOP-Gate

## Feature
FEAT-016 — Template-driven Diagnosis Layer

## Goal
Diagnose-UI im Debrief: Generieren, Anzeigen, Editieren, Bestaetigen, Exportieren. Plus SOP-Gate (SOP erst nach Diagnose-Bestaetigung). Nach diesem Slice ist FEAT-016 komplett nutzbar.

## Scope

### In Scope
- DiagnosisGenerateButton (Trigger + Polling)
- DiagnosisView (Tabelle/Karten pro Subtopic, Ampel-Farben)
- DiagnosisEditor (Inline-Editing aller Felder)
- DiagnosisConfirmButton (Status → confirmed)
- DiagnosisExportButton (JSON-Download)
- Integration in DebriefBlockClient.tsx + page.tsx
- SOP-Gate: SOP-Button nur wenn Diagnose confirmed
- Server Actions erweitern: updateDiagnosisContent, confirmDiagnosis
- i18n (de/en/nl)

### Out of Scope
- Print-CSS / druckbare HTML-Ansicht (Q13, spaeter evaluieren)
- CSV/Excel-Export (V2.1)
- Diagnose-Versionierung (V2.1)

## Acceptance Criteria
- AC-3: Diagnose-Daten als Tabelle/Karten pro Subtopic angezeigt, Ampel farblich visualisiert
- AC-4: Alle Felder inline editierbar, Save persistiert via RPC
- AC-5: "Diagnose bestaetigen" setzt Status auf confirmed
- AC-6: SOP-Button nur sichtbar wenn block_diagnosis.status = 'confirmed', vorher Hinweis
- AC-7: Export-Button downloadet Diagnose als JSON
- AC-8: Diagnose-Keys in de/en/nl vorhanden

## Micro-Tasks

### MT-1: DiagnosisGenerateButton
- Goal: Button zum Triggern der Diagnose-Generierung mit Polling fuer Ergebnis
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DiagnosisGenerateButton.tsx`
- Expected behavior:
  - Button "Diagnose generieren" (nur fuer strategaize_admin)
  - Klick ruft triggerDiagnosisGeneration() auf
  - Loading-State waehrend Generation
  - Pollt fetchDiagnosis() alle 3s bis Ergebnis da
  - Zeigt Erfolgs-Feedback nach Generierung
  - Deaktiviert wenn bereits eine Diagnose existiert (zeigt "Neu generieren" stattdessen)
- Verification: `npm run build`, visueller Check im Browser
- Dependencies: SLC-023 komplett

### MT-2: DiagnosisView
- Goal: Strukturierte Anzeige der Diagnose-Daten pro Subtopic
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DiagnosisView.tsx`
- Expected behavior:
  - Rendert block_diagnosis.content als Karten/Tabelle pro Subtopic
  - Subtopic-Name als Ueberschrift
  - Alle 13 Felder sichtbar (Ist-Situation, Ampel, Reifegrad, etc.)
  - Ampel-Feld als farbiger Badge (gruen/gelb/rot)
  - Zahlenfelder (Reifegrad, Risiko, Hebel) als Zahl mit Label
  - Enum-Felder (Relevanz, Aufwand) als Badge
  - Text-Felder als lesbare Absaetze
  - Leere Felder als Platzhalter (nicht versteckt)
  - Status-Badge (draft/reviewed/confirmed) oben rechts
- Verification: `npm run build`, visueller Check mit Testdaten
- Dependencies: MT-1

### MT-3: DiagnosisEditor + Server Actions
- Goal: Inline-Editing aller Diagnose-Felder
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DiagnosisEditor.tsx`, `src/app/admin/debrief/[sessionId]/[blockKey]/diagnosis-actions.ts` (erweitern um updateDiagnosisContent)
- Expected behavior:
  - Edit-Mode Toggle (analog SopEditor)
  - Text-Felder: Textarea
  - Number-Felder: Number-Input mit min/max
  - Enum-Felder: Select/Dropdown mit Options aus diagnosis_schema
  - Ampel: 3-Button-Toggle (gruen/gelb/rot)
  - Save-Button speichert gesamten content via updateDiagnosisContent()
  - updateDiagnosisContent Server Action ruft rpc_update_diagnosis auf
- Verification: `npm run build`, visueller Check — Edit, Change, Save, Reload zeigt geaenderte Werte
- Dependencies: MT-2

### MT-4: DiagnosisConfirmButton + DiagnosisExportButton
- Goal: Bestaetigung und JSON-Export
- Files:
  - `src/app/admin/debrief/[sessionId]/[blockKey]/DiagnosisConfirmButton.tsx`
  - `src/app/admin/debrief/[sessionId]/[blockKey]/DiagnosisExportButton.tsx`
  - `src/app/admin/debrief/[sessionId]/[blockKey]/diagnosis-actions.ts` (erweitern um confirmDiagnosis)
- Expected behavior:
  - DiagnosisConfirmButton: Button "Diagnose bestaetigen". Klick ruft confirmDiagnosis() → rpc_confirm_diagnosis. Danach zeigt confirmed-Badge. Button wird deaktiviert nach Bestaetigung.
  - DiagnosisExportButton: Button "JSON Export". Klick erstellt Blob aus diagnosis.content, triggert Download als `diagnosis-{blockKey}.json`.
  - confirmDiagnosis Server Action prueft strategaize_admin-Rolle
- Verification: `npm run build`, visueller Check — Confirm setzt Status, Export downloadet JSON
- Dependencies: MT-2

### MT-5: Integration in DebriefBlockClient + page.tsx
- Goal: Diagnose-Sektion zwischen KUs und SOP-Sektion einbinden
- Files:
  - `src/app/admin/debrief/[sessionId]/[blockKey]/page.tsx` (Server Component: fetchDiagnosis laden)
  - `src/app/admin/debrief/[sessionId]/[blockKey]/DebriefBlockClient.tsx` (Diagnose-Sektion rendern)
- Expected behavior:
  - page.tsx: fetchDiagnosis(sessionId, blockKey) aufrufen, Ergebnis als Prop an Client uebergeben
  - DebriefBlockClient: Neue Sektion "Diagnose" zwischen KU-Bereich und SOP-Bereich
  - Collapsible/Accordion-Sektion mit Ueberschrift "Diagnose"
  - Wenn keine Diagnose: nur DiagnosisGenerateButton
  - Wenn Diagnose vorhanden: DiagnosisView + DiagnosisEditor + DiagnosisConfirmButton + DiagnosisExportButton
  - Template diagnosis_schema als Prop fuer Feld-Definitionen (Labels, Types, Options)
- Verification: `npm run build`, visueller Check — Debrief-Seite zeigt Diagnose-Sektion
- Dependencies: MT-1, MT-2, MT-3, MT-4

### MT-6: SOP-Gate
- Goal: SOP-Generierung nur nach Diagnose-Bestaetigung
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DebriefBlockClient.tsx` (SOP-Sektion bedingt rendern)
- Expected behavior:
  - SOP-Sektion prueft: hat dieser Block eine confirmed Diagnose?
  - Wenn ja: SOP-Bereich normal rendern (SopGenerateButton, SopView, etc.)
  - Wenn nein: Info-Alert "Bitte erst die Diagnose bestaetigen, bevor SOPs generiert werden koennen."
  - diagnosisConfirmed wird aus dem in MT-5 geladenen Diagnose-Objekt abgeleitet
- Verification: `npm run build`, visueller Check — SOP-Button nur bei confirmed Diagnose, sonst Hinweis
- Dependencies: MT-5

### MT-7: i18n (de/en/nl)
- Goal: Alle Diagnose-spezifischen UI-Strings in allen 3 Sprachen
- Files: `messages/de.json`, `messages/en.json`, `messages/nl.json`
- Expected behavior: Keys fuer:
  - diagnosis.generate, diagnosis.generating, diagnosis.regenerate
  - diagnosis.title, diagnosis.subtitle
  - diagnosis.confirm, diagnosis.confirmed, diagnosis.export
  - diagnosis.edit, diagnosis.save, diagnosis.cancel
  - diagnosis.status.draft, diagnosis.status.reviewed, diagnosis.status.confirmed
  - diagnosis.sop_gate_hint
  - Feld-Labels (ist_situation, ampel, reifegrad, etc.) — aus diagnosis_schema, aber Fallback-Labels in i18n
- Verification: `npm run build`, App in de/en/nl umschalten — keine fehlenden Keys
- Dependencies: none (kann parallel zu MT-1..6 laufen)

## Execution Order
MT-7 (parallel, unabhaengig) + MT-1 → MT-2 → MT-3 + MT-4 (parallel) → MT-5 → MT-6

## Risks
- R11: Prompt-Qualitaet zeigt sich erst im Live-Test — Diagnose-Ergebnisse muessen nach SLC-023-Deploy visuell geprueft werden.
- R12: Leere Felder in der UI muessen sinnvoll dargestellt werden (nicht als "undefined" oder fehlend).
