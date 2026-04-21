# SLC-027 — Meeting Guide UI

## Goal
Meeting-Guide-Editor im Plattform-UI: Themen erstellen, sortieren, Leitfragen definieren, Template-Block-Zuordnung, KI-Vorschlaege uebernehmen, druckbare Ansicht.

## Feature
FEAT-018

## In Scope
- Meeting Guide Editor Page
- Topic Management (Add, Edit, Sort, Delete)
- Leitfragen pro Topic (freies Textfeld, mehrere)
- Template-Block-Zuordnung (Dropdown aus Template-Bloecken)
- KI-Vorschlaege Button + uebernehmbare Vorschlags-Karten
- Meeting-Ziel + Kontext-Notizen
- Print-Ansicht (Print-CSS)
- i18n (de/en/nl Keys)

## Out of Scope
- Intelligence-Level KI-Vorbereitung (Produkt-Split)
- Dialogue Session UI (SLC-029)

## Acceptance Criteria
- AC-1: Editor oeffnet sich fuer eine Capture-Session
- AC-2: Topics hinzufuegen, sortieren (Pfeile), loeschen funktioniert
- AC-3: KI-Vorschlaege-Button liefert Vorschlaege, die uebernommen werden koennen
- AC-4: Template-Block-Zuordnung per Dropdown
- AC-5: Print-Ansicht zeigt sauberes Layout
- AC-6: i18n Keys in de/en/nl

## Dependencies
- SLC-026 (Backend muss stehen)

## Worktree
Empfohlen (SaaS)

### Micro-Tasks

#### MT-1: Meeting Guide Editor Page + Layout
- Goal: Neue Page /admin/session/[sessionId]/meeting-guide mit Editor-Layout
- Files: `src/app/admin/session/[sessionId]/meeting-guide/page.tsx`, `src/app/admin/session/[sessionId]/meeting-guide/meeting-guide-editor.tsx`
- Expected behavior: Server Component laedt Guide + Template. Client Component zeigt Editor mit Ziel, Kontext, Topics-Liste.
- Verification: Page rendert ohne Fehler, zeigt leeren Editor fuer neue Session
- Dependencies: none

#### MT-2: Topic Management Component
- Goal: TopicList + TopicCard mit Add, Edit, Sort, Delete
- Files: `src/components/meeting-guide/topic-list.tsx`, `src/components/meeting-guide/topic-card.tsx`
- Expected behavior: Topics als Karten. Jede Karte: Titel, Beschreibung, Leitfragen, Block-Zuordnung. Sortierung via Pfeil-Buttons. Delete mit Confirm.
- Verification: 3 Topics hinzufuegen, sortieren, loeschen — Save persistiert korrekt
- Dependencies: MT-1

#### MT-3: KI-Vorschlaege Integration
- Goal: Button "Vorschlaege generieren" + Vorschlags-Karten zum Uebernehmen
- Files: `src/components/meeting-guide/ai-suggestions.tsx`
- Expected behavior: Button ruft /api/meeting-guide/suggest. Loading-State waehrend Bedrock-Call. Ergebnis als Karten mit "Uebernehmen"-Button. Uebernommene Topics erscheinen in der Liste.
- Verification: Button klicken → Vorschlaege erscheinen → Uebernehmen → Topic in Liste
- Dependencies: MT-1, MT-2

#### MT-4: Template-Block-Zuordnung + Print-Ansicht
- Goal: Dropdown fuer block_key pro Topic. Print-CSS fuer Meeting-Vorbereitung.
- Files: `src/components/meeting-guide/block-selector.tsx`, `src/app/admin/session/[sessionId]/meeting-guide/print.css`
- Expected behavior: Dropdown zeigt Template-Bloecke (A-I fuer Exit-Readiness). Print-View (@media print) zeigt sauberes Layout ohne UI-Chrome.
- Verification: Block-Zuordnung persistiert. Ctrl+P zeigt druckbare Ansicht.
- Dependencies: MT-2

#### MT-5: i18n Keys
- Goal: Meeting-Guide-spezifische Uebersetzungen in de/en/nl
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Alle UI-Strings uebersetzt (Editor-Labels, Buttons, Placeholders, Vorschlaege-UI)
- Verification: Sprachwechsel zeigt korrekte Uebersetzungen
- Dependencies: MT-1..4
