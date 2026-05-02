# SLC-054 — Cross-Snapshot-Suche client-side + Search-History localStorage

## Goal
Reader-Suche von Single-Snapshot auf Cross-Snapshot ausweiten (alle Snapshots des aktuellen Tenants), client-side ohne Backend-Index. Search-History pro User in localStorage persistieren (max 10 Eintraege, FIFO-Trim, dedupliziert). Per DEC-063 keine Schema-Aenderung, kein Backend-Endpoint, keine Cross-Device-Persistenz.

## Feature
V4.3 Maintenance

## Backlog Items
- BL-054 Reader Cross-Snapshot-Suche und Suche-Historie

## In Scope

### A — `useSearchHistory()`-Hook (DEC-063)

Pfad: `src/components/handbook/use-search-history.ts` (neu)
Pfad: `src/components/handbook/__tests__/use-search-history.test.ts` (neu)

Verhalten:
- Hook persistiert unter `localStorage['onboarding.reader.searchHistory.v1']` ein JSON-Array von Strings.
- API: `{ history: string[]; addQuery(q: string): void; clearHistory(): void }`.
- `addQuery`-Logik: dedupliziert (gleiche Query wandert an Position 0), max 10 Eintraege, FIFO-Trim am Ende.
- SSR-safe via `typeof window !== 'undefined'`-Guard.
- localStorage-Quota-Fehler: silent-skip mit `console.warn`, kein User-Error (DEC-063).
- `clearHistory()` setzt localStorage-Key auf `[]`.

### B — Cross-Snapshot-Search-Engine

Pfad: `src/lib/handbook/cross-snapshot-search.ts` (neu)
Pfad: `src/lib/handbook/__tests__/cross-snapshot-search.test.ts` (neu)

Verhalten:
- `searchAcrossSnapshots(query: string, snapshots: HandbookSnapshot[]): SearchResult[]` — case-insensitive String-Match in Section-Title + Section-Body.
- Result-Shape:
  ```typescript
  type SearchResult = {
    snapshotId: string;
    snapshotTitle: string;
    snapshotDate: string;
    sectionId: string;
    sectionTitle: string;
    snippet: string; // ~120 Zeichen Context um den Match
    matchCount: number;
  };
  ```
- Performance: einfacher Iterations-Algorithmus, keine Tokenisierung. Bei Snapshot-Counts > 20 ggf. langsamer (akzeptabel per V4.3 Trade-off, V5+ kann Backend-Index nachruesten).
- Gibt max 50 Treffer zurueck (UI sortiert nach Relevanz: matchCount * snapshotRecency).

### C — `ReaderSearchBox`-Komponente (Q-V4.3-H: Sidebar oben)

Pfad: `src/components/handbook/reader-search-box.tsx` (neu)
Pfad: `src/components/handbook/__tests__/reader-search-box.test.tsx` (neu)

Verhalten:
- Position: in der Reader-Sidebar oben, ueber der TOC-Liste (Q-V4.3-H: Sidebar oben statt sticky Header).
- Eingabefeld + Dropdown:
  - Bei Focus: zeigt Search-History (`history`) als Vorschlaege.
  - Bei Type: zeigt Live-Suchergebnisse ueber `searchAcrossSnapshots`.
  - Each Result-Item ist anklickbar → navigiert zu `/dashboard/handbook/<snapshotId>#<sectionId>` und ruft `addQuery(query)`.
- Search-Trigger: debounced (300ms) damit Live-Search nicht bei jedem Tastendruck rechnet.
- ESC-Key schliesst Dropdown.
- Kleines `X`-Icon in History-Dropdown-Eintrag erlaubt Eintrag-Loeschen (Optional, nur falls Aufwand klein).
- Unter Result-Liste: kleines "Verlauf loeschen"-Link das `clearHistory()` ruft.

### D — Server-Component-Integration: Snapshot-Daten ans Client durchreichen

Pfad: `src/app/dashboard/handbook/[snapshotId]/page.tsx` (geaendert)
Pfad: `src/components/handbook/reader-shell.tsx` (geaendert)

Verhalten:
- Server-Component laedt nicht nur den aktiven Snapshot, sondern auch alle Snapshots des Tenants (mit ihrem Section-Inhalt).
- Trade-off: erweitert DOM-Payload merklich; Performance-Impact bei vielen Snapshots wird in Risks dokumentiert.
- Reduce-Strategie: nur die `metadata` + `sections[].title + sections[].body` werden ans Client durchgereicht — nicht die kompletten Markdown-AST.
- ReaderShell uebergibt Snapshot-Liste an `ReaderSearchBox`.
- Falls Snapshot-Anzahl > 20: Performance-Warning-UI (gleiche Pattern wie SLC-045 Performance-Warning).

### E — Tests

- `src/components/handbook/__tests__/use-search-history.test.ts` (neu): 5 Cases — Empty-Init, Add-First, Add-Duplicate (move-to-front), Trim-on-Limit (>10), SSR-Safe (no `window`).
- `src/lib/handbook/__tests__/cross-snapshot-search.test.ts` (neu): 4 Cases — No-Match, Single-Snapshot-Match, Cross-Snapshot-Match, Snippet-Generation.
- `src/components/handbook/__tests__/reader-search-box.test.tsx` (neu): 3 Cases — History-On-Focus, Live-Search-On-Type, Click-Navigates.

## Out of Scope

- Backend-Search-Index (V5+).
- Cross-Device-History-Sync (V5+).
- Fuzzy-Search / Typo-Tolerance (zu komplex fuer client-side).
- Highlighting der Treffer im Reader-Content nach Navigation (V4.3 Out-of-Scope, kann BL nach V4.3).
- Search-Analytics (V5+).

## Acceptance Criteria

- AC-1: `useSearchHistory()`-Hook persistiert in localStorage unter `onboarding.reader.searchHistory.v1`.
- AC-2: `addQuery` dedupliziert Eintrage und trimmt auf max 10 (FIFO).
- AC-3: Hook ist SSR-safe (kein `window`-Crash bei Server-Render).
- AC-4: `searchAcrossSnapshots()` findet Matches in allen Snapshots des Tenants, case-insensitive.
- AC-5: `ReaderSearchBox` ist in Sidebar oben sichtbar (ueber TOC).
- AC-6: Bei Focus (kein Input): History-Dropdown zeigt letzte 10 Queries.
- AC-7: Bei Input: Live-Suchergebnisse erscheinen debounced (300ms).
- AC-8: Click auf Result navigiert zu `/dashboard/handbook/<snapshotId>#<sectionId>`.
- AC-9: Click ruft `addQuery(query)` damit Eintrag in History landet.
- AC-10: ESC schliesst Dropdown.
- AC-11: localStorage-Quota-Fehler crashed nicht (silent-skip mit warn).
- AC-12: Bei Snapshot-Count > 20: Performance-Warning sichtbar.
- AC-13: Browser-Smoke 1280×800 + 375×667: Search funktioniert auf Desktop + Mobile.
- AC-14: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: SLC-053 done (Tooling).
- Vorbedingung: SLC-051 done (Reader-Sidebar steht stabil; ReaderSearchBox haengt sich oben in die Sidebar).
- Empfohlen: SLC-052 done (Worker-Output mit konsistenten Slugs); aber nicht hart, weil Search ueber Title/Body geht, nicht ueber Slugs.
- Letzter V4.3-Slice per DEC-062 Reihenfolge.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine. Client-side localStorage-only.

## Pflicht-QA-Vorgaben

- localStorage-Persistenz: Search → Page-Reload → History noch da.
- Browser-Smoke 1280×800: Search-Box findet Result quer ueber alle Snapshots, Click navigiert korrekt.
- Browser-Smoke 375×667: Search-Box auf Mobile nutzbar (Tap-Targets, Dropdown nicht abgeschnitten).
- 4-Rollen-RLS-Matrix bleibt 100% PASS (kein Backend-Touch).
- V4.2-Regression-Smoke (Wizard, Reader, Cockpit-Cards, Help, Reminders).
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — DOM-Payload-Groesse bei vielen Snapshots:** Mitigation = nur Title + Body (kein Markdown-AST) ans Client durchreichen; Performance-Warning bei >20 Snapshots; V5+ Backend-Index falls noetig.
- **R2 — localStorage-Quota:** Mitigation = silent-skip per DEC-063 (10 Strings * ~50 chars = ~5KB, weit unter 5MB-Quota).
- **R3 — Search-History-Privacy:** localStorage ist per-Browser-Profil — wenn ein User sich an einem Shared-Computer einloggt, sieht der naechste User die History. Mitigation = bewusst akzeptiert per DEC-063 (Strategaize-Audience nutzt typischerweise persoenliche Geraete); falls noetig: optionaler `localStorage`-Auto-Clear bei Logout (nicht in V4.3-Scope, BL nach V4.3 falls Bedarf).
- **R4 — Live-Search-Performance bei grossen Snapshots:** Mitigation = debounced 300ms; Iteration ist O(n*m) wo n=Snapshots, m=Sections; bei >50 Sections gesamt ggf. spuerbare Latenz; akzeptabel fuer V4.3.
- **R5 — Cross-Snapshot-Result-Sortierung verwirrend:** Mitigation = `matchCount * recency`-Score, Result-Item zeigt Snapshot-Datum sichtbar, User sieht woher Treffer kommt.

## Detail-Decisions aus /architecture (V4.3)

- DEC-063 (Search-History in localStorage, nicht user_settings).
- Q-V4.3-H (Search-UI in Sidebar oben statt sticky Reader-Header — Empfehlung uebernommen).

### Micro-Tasks

#### MT-1: useSearchHistory-Hook + Tests
- Goal: localStorage-persistenter History-Hook.
- Files: `src/components/handbook/use-search-history.ts` (neu), `src/components/handbook/__tests__/use-search-history.test.ts` (neu)
- Expected behavior: Hook liefert `{history, addQuery, clearHistory}`, dedupliziert, FIFO-Trim, SSR-safe.
- Verification: 5 Vitest-Tests.
- Dependencies: none.

#### MT-2: cross-snapshot-search Engine + Tests
- Goal: Reine Function fuer client-side Cross-Snapshot-Suche.
- Files: `src/lib/handbook/cross-snapshot-search.ts` (neu), `src/lib/handbook/__tests__/cross-snapshot-search.test.ts` (neu)
- Expected behavior: Liefert Top-50 Results sortiert nach Relevanz.
- Verification: 4 Vitest-Tests inkl. Snippet-Generation.
- Dependencies: none.

#### MT-3: ReaderSearchBox-Komponente + Tests
- Goal: UI-Komponente fuer Search + History-Dropdown.
- Files: `src/components/handbook/reader-search-box.tsx` (neu), `src/components/handbook/__tests__/reader-search-box.test.tsx` (neu)
- Expected behavior: Focus zeigt History, Type triggert Live-Search debounced, Click navigiert + addQuery.
- Verification: 3 Vitest-Tests + Browser-Smoke.
- Dependencies: MT-1, MT-2.

#### MT-4: Server-Component Snapshot-Liste-Loader
- Goal: Page laedt nicht nur aktiven Snapshot, sondern alle Tenant-Snapshots fuer Cross-Search.
- Files: `src/app/dashboard/handbook/[snapshotId]/page.tsx` (geaendert), `src/lib/handbook/get-tenant-snapshots.ts` (neu falls noetig)
- Expected behavior: Server-Component reicht Snapshot-Liste (Title+Body, kein AST) an ReaderShell durch.
- Verification: SSR-Render-Test + Browser-Smoke (Cross-Snapshot-Search liefert Treffer aus zweitem Snapshot).
- Dependencies: MT-2.

#### MT-5: Sidebar-Integration ReaderSearchBox
- Goal: SearchBox in der Reader-Sidebar oben einbauen.
- Files: `src/components/handbook/reader-shell.tsx` ODER `reader-sidebar.tsx` (geaendert)
- Expected behavior: SearchBox sichtbar oberhalb TOC, Snapshots-Liste wird durchgereicht.
- Verification: Browser-Smoke Sidebar-Visual.
- Dependencies: MT-3 + MT-4.

#### MT-6: Performance-Warning bei vielen Snapshots
- Goal: Wenn Snapshot-Count > 20, kleine Warning unter SearchBox sichtbar.
- Files: `src/components/handbook/reader-search-box.tsx` (geaendert) ODER neue Helper-Komponente.
- Expected behavior: Banner "Suche kann langsamer sein bei vielen Versionen" sichtbar.
- Verification: Browser-Smoke mit Test-Tenant-Snapshot-Count > 20.
- Dependencies: MT-5.
