# SLC-017 — SOP-UI

## Zuordnung
- Feature: FEAT-012 (SOP Generation Frontend)
- Version: V2
- Priority: High
- Depends on: SLC-016

## Ziel
strategaize_admin kann SOPs im Debrief-UI anzeigen, editieren und als JSON exportieren. SOP-Generierung per Button im Debrief.

## Scope
- SOP-Generierungs-Button im Debrief-Block
- SOP-Anzeige (Steps, Risks, Fallbacks) als strukturierte Karten
- SOP-Edit (Inline-Editing von Steps, Titel, Verantwortlichkeiten)
- SOP JSON-Export-Button
- i18n (de/en/nl)

## Nicht in Scope
- PDF-Export (V2.1)
- SOP-Versionierung (V2.1)
- SOP-Regenerierung (V2.1, V2 loescht alte SOP bei neuer Generation)

## Acceptance Criteria
1. Button "SOP generieren" im Debrief-Block sichtbar (nur strategaize_admin)
2. Waehrend Generierung: Loading-State
3. SOP wird nach Generierung als strukturierte Ansicht dargestellt
4. Steps sind inline editierbar
5. JSON-Export-Button downloadet SOP als .json-Datei
6. i18n komplett

### Micro-Tasks

#### MT-1: SOP-Generierungs-Button + Loading-State
- Goal: Button im Debrief-Block, der SOP-Generierung triggert
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/SopGenerateButton.tsx`
- Expected behavior: Button ruft sop-actions.triggerSopGeneration() auf. Zeigt Spinner waehrend Job laeuft (Polling auf sop-Tabelle oder ai_jobs-Status). Verschwindet wenn SOP vorhanden.
- Verification: npm run build
- Dependencies: SLC-016 MT-7

#### MT-2: SOP-Anzeige-Komponente
- Goal: Strukturierte Darstellung der SOP-Daten
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/SopView.tsx`
- Expected behavior: Zeigt: Titel, Objective, Steps als nummerierte Liste (Action, Responsible, Timeframe, Success Criterion), Risks, Fallbacks. Nutzt shadcn/ui Card + Accordion.
- Verification: npm run build
- Dependencies: none

#### MT-3: SOP-Inline-Editor
- Goal: Steps + Titel inline editierbar
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/SopEditor.tsx`
- Expected behavior: Klick auf Step-Text oeffnet Inline-Input. Save-Button speichert via rpc_update_sop. Optimistic-UI-Update.
- Verification: npm run build
- Dependencies: MT-2, SLC-016 MT-3

#### MT-4: SOP-Export-Button
- Goal: JSON-Download der SOP
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/SopExportButton.tsx`
- Expected behavior: Button erzeugt Blob aus sop.content + erzwingt Download als `sop-{blockKey}-{date}.json`. Kein Server-Roundtrip noetig (Daten bereits geladen).
- Verification: npm run build
- Dependencies: MT-2

#### MT-5: Integration in DebriefBlockClient
- Goal: SOP-Bereich in bestehende Debrief-Block-Seite einbinden
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/DebriefBlockClient.tsx`
- Expected behavior: Neue Sektion "SOP" unterhalb KU-Liste + Backspelling-Status. Zeigt SopGenerateButton wenn keine SOP existiert, SopView + SopEditor + SopExportButton wenn SOP vorhanden.
- Verification: npm run build
- Dependencies: MT-1, MT-2, MT-3, MT-4

#### MT-6: i18n Keys
- Goal: SOP-spezifische Texte in de/en/nl
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Keys fuer: sop.generate, sop.generating, sop.title, sop.objective, sop.steps, sop.responsible, sop.timeframe, sop.risks, sop.export
- Verification: npm run build
- Dependencies: MT-5
