# SLC-045 — Reader Volltext-Suche + Performance-Warning + Reader-Polish

## Goal
Letzter V4.1-Slice: Volltext-Suche im Handbuch-Reader (client-side, mit Highlight + Scroll-to-Position), Performance-Warning fuer grosse Snapshots (>500KB Markdown), und Polish-Tasks die nach Browser-Smoke-Test (SLC-044 MT-7) als wichtig identifiziert wurden. Der Reader wird production-ready abgeschlossen.

## Feature
FEAT-028 (Handbuch In-App-Reader) — Suche + Polish

## In Scope

### A — Volltext-Suche
- Erweiterung in `src/components/handbook/HandbookReader.tsx`:
  - Search-Input im Reader-Header (Top-Bar oder Sidebar — UX-Detail in MT-1)
  - Min-Trigger-Length: 3 Zeichen
  - Client-side String-Match (`String.toLowerCase().includes(query.toLowerCase())`) ueber alle Section-Markdown-Strings
  - Highlight-Logik:
    - Treffer im DOM markieren via `<mark>`-Tags (post-render, oder via `react-markdown` rehype-plugin)
    - Empfehlung: Custom rehype-plugin oder DOM-Manipulation post-render mit `mark.js`-aequivalentem Pattern
- Treffer-Counter: "X Treffer in Y Sections" oben sichtbar
- Treffer-Liste als Sidebar-Element oder Dropdown:
  - Pro Treffer: Section-Name + Snippet (50 Zeichen Kontext)
  - Klick scrollt zur Position im Hauptbereich + scrollt das `<mark>`-Element in den View
- Reset-Button (X-Icon im Search-Input) loescht Suche und Highlights

### B — Performance-Warning fuer grosse Snapshots
- Beim Server-Side-Load des Snapshots (in `loadSnapshotContent` aus SLC-044 MT-2):
  - Berechne `totalMarkdownBytes = sum(file.markdown.length for file in sections)`
  - Wenn `totalMarkdownBytes > 500_000` (500KB): Flag `isLargeSnapshot: true` als Prop an HandbookReader
- Reader zeigt bei `isLargeSnapshot`:
  - Banner oben: "Grosser Snapshot (X KB). Suche kann etwas verzoegert sein."
  - Optional: Suchverzoegerung via Debounce auf 500ms (statt 200ms bei normalen Snapshots)

### C — Reader-Polish (post-Smoke-Test)
- Folgende Punkte sind Platzhalter — finale Liste entsteht nach SLC-044 MT-7 Browser-Smoke-Test-Feedback. Beispiele die wahrscheinlich aufkommen:
  - Active-Section-Highlight in Sidebar (Scroll-Spy)
  - Print-friendly CSS (User druckt Snapshot)
  - Copy-Permalink-Button pro Section
  - Keyboard-Shortcuts (Ctrl/Cmd+F oeffnet Suche, Esc schliesst)
  - Loading-Skeleton fuer initialen Render
- Konkrete Polish-Tasks werden in MT-3 als Sub-Tasks aus dem Smoke-Test-Feedback abgeleitet.

## Out of Scope
- Cross-Snapshot-Suche oder Full-Tenant-Search (V4.2+)
- Server-side Search-Index (V4.2+ falls Performance-Bedarf entsteht)
- Search-History oder Search-Suggestions (V4.2+)
- Inline-Editor im Reader (V4.2+, DEC-V4.1-1)
- Diff-View zwischen Snapshots (V4.2+)
- Bookmarks oder Notizen pro Section (V5+)

## Acceptance Criteria
- AC-1: Search-Input im Reader-Header sichtbar.
- AC-2: Eingabe von 3+ Zeichen markiert alle Treffer im Markdown via `<mark>`-Tags (Visual-Verifikation).
- AC-3: Treffer-Counter "X Treffer in Y Sections" oben sichtbar.
- AC-4: Klick auf Treffer-Listen-Eintrag scrollt zur Position, der jeweilige `<mark>` ist sichtbar.
- AC-5: Reset-Button entfernt Suche + alle Highlights.
- AC-6: Performance: Suche reagiert <100ms bei normalen Snapshots (<200KB), <500ms bei grossen (Debounce).
- AC-7: Performance-Warning-Banner sichtbar bei Snapshots >500KB Markdown total.
- AC-8: Suche ist case-insensitive.
- AC-9: Bei 0 Treffern: "Keine Treffer fuer 'X'" Message.
- AC-10: Polish-Tasks aus SLC-044 MT-7 Smoke-Test umgesetzt (oder explizit auf V4.2+ verschoben mit BL-Eintrag).
- AC-11: `npm run build` + `npm run test` gruen.
- AC-12: Responsive: Search-UI bricht auf mobile sauber.

## Dependencies
- Vorbedingung: SLC-044 done (Reader-Komponente + Storage-Read existieren).
- Vorbedingung: SLC-044 MT-7 Browser-Smoke-Test durchgefuehrt (Polish-Tasks-Liste vorhanden).
- Kein nachgelagerter V4.1-Slice — SLC-045 ist der letzte V4.1-Slice vor Gesamt-V4.1-/qa.

## Worktree
Mandatory (SaaS).

## Migrations-Zuordnung
Keine Migration in diesem Slice.

## Pflicht-QA-Vorgaben
- Suche-Funktional-Test: 3-5 Test-Queries auf Demo-Tenant-Snapshot, Treffer-Counter + Scroll-to-Position verifiziert.
- Performance-Test: kuenstlich grosser Snapshot (>500KB), Banner sichtbar, Suche reagiert akzeptabel.
- Polish-Tasks-Verifikation pro umgesetztem Punkt.
- Responsive-Check.
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.
- Cockpit-Records-Update nach Slice-Ende (mandatory).
- **Nach SLC-045: Gesamt-V4.1-/qa starten** (alle 3 Features, 5 Slices, 12 Success Criteria) als Pflicht-Schritt vor /final-check.

## Risks
- **R1 — Highlight-Logik DOM-Manipulation kann mit react-markdown reflow konfliktieren:** Mitigation: rehype-plugin als saubere Loesung, falls DOM-Manipulation Probleme macht.
- **R2 — Polish-Tasks-Scope-Drift:** Smoke-Test-Feedback kann viele Wuensche generieren. Mitigation: Scope-Disziplin — kleine Polish-Items inline, groessere als BL-Eintraege fuer V4.2+.
- **R3 — Performance bei sehr grossen Markdown-Strings (>1MB):** Mitigation: V4.1-Snapshots sind erfahrungsgemaess <200KB (V4-Demo-Daten). >500KB-Banner ist konservativ.

### Micro-Tasks

#### MT-1: Volltext-Suche-UI + Highlight-Logik
- Goal: Search-Input + Highlight im Markdown.
- Files: `src/components/handbook/HandbookReader.tsx` (geaendert), `src/components/handbook/SearchInput.tsx` (neu), `src/components/handbook/SearchResultsList.tsx` (neu), evtl. `src/lib/handbook/highlight-rehype-plugin.ts` (neu)
- Expected behavior: Eingabe markiert Treffer, Counter aktiv, Klick scrollt zur Position. Reset funktioniert.
- Verification: Browser-Test mit 3-5 Test-Queries auf Demo-Snapshot, Treffer-Counter stimmt.
- Dependencies: SLC-044 MT-3 done

#### MT-2: Performance-Warning fuer grosse Snapshots
- Goal: isLargeSnapshot-Flag im Server-Loader, Banner im Reader.
- Files: `src/lib/handbook/load-snapshot-content.ts` (geaendert — Byte-Count + Flag), `src/components/handbook/HandbookReader.tsx` (geaendert — Banner)
- Expected behavior: Bei >500KB Markdown total wird Banner sichtbar, Suche-Debounce auf 500ms.
- Verification: Test mit kuenstlich grossem Snapshot (mock-Markdown-Text auf 600KB padden).
- Dependencies: MT-1, SLC-044 MT-2 done

#### MT-3: Polish-Tasks aus Smoke-Test
- Goal: Konkrete Polish-Items aus SLC-044 MT-7 Feedback umsetzen ODER explizit nach V4.2+ verschieben.
- Files: variabel — entsteht aus Feedback. Wahrscheinliche Kandidaten: Scroll-Spy fuer Active-Section, Print-CSS, Keyboard-Shortcuts.
- Expected behavior: Fuer jeden umgesetzten Polish-Punkt: konkrete UX-Verbesserung. Fuer verschobene Punkte: BL-Eintrag im Backlog mit V4.2+-Tag.
- Verification: Browser-Test pro Polish-Item.
- Dependencies: MT-1, MT-2, SLC-044 MT-7 Feedback vorhanden
- Hinweis: MT-3 ist bewusst flexibel — Scope-Disziplin wichtig.
