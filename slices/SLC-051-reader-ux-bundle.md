# SLC-051 — Reader-UX-Bundle (Scroll-Spy + Permalink + Skeleton + Mobile-h1 + h1-Anchor-Hover)

## Goal
Den Reader-UX-Polish-Stapel aus V4.1 Browser-Smoke abarbeiten: Sidebar-Scroll-Spy, Copy-Permalink-Buttons pro Section, Loading-Skeleton beim Snapshot-Wechsel, Mobile-h1-Wrap-Fix bei 375px, Heading-Anchor-Hover am h1-Titel sichtbar machen. Alle 5 Items beruehren ausschliesslich Reader-UI-Komponenten und CSS, kein Schema-Touch.

## Feature
V4.3 Maintenance (kein FEAT-Eintrag, weil V4.3 ein Sammelrelease ohne neue Features ist)

## Backlog Items
- BL-051 Reader Active-Section-Scroll-Spy
- BL-052 Reader Copy-Permalink-Button
- BL-053 Reader Loading-Skeleton
- BL-055 Reader Mobile-h1-Wrap
- BL-058 Reader h1-Heading-Anchor-Hover sichtbar

## In Scope

### A — Scroll-Spy in Sidebar (BL-051)

Pfad: `src/components/handbook/use-scroll-spy.ts` (neu, Hook)
Pfad: `src/components/handbook/reader-sidebar.tsx` (geaendert)

Verhalten:
- `useScrollSpy(headingIds: string[])`-Hook erstellt einen IntersectionObserver pro h2/h3-Heading.
- Aktive Section wird per State + Sidebar-Active-Class markiert (Brand-Primary-Akzent).
- Threshold: `[0, 0.25, 0.5, 0.75, 1]` mit `rootMargin: "-20% 0px -60% 0px"` damit erst die Section in der oberen Bildschirmhaelfte als aktiv gilt.
- Hook liefert `activeId: string | null`.
- Sidebar-Komponente nutzt den Hook und setzt `data-active="true"` an dem Section-Link.

### B — Copy-Permalink-Button pro Section (BL-052)

Pfad: `src/components/handbook/copy-permalink-button.tsx` (neu)
Pfad: `src/components/handbook/reader-content.tsx` (geaendert) — bzw. der `react-markdown components.h2`-Override.

Verhalten:
- Pro h2/h3-Heading wird neben dem `rehype-autolink-headings`-Anchor (existiert seit V4.1) ein zweiter, kleinerer Clipboard-Icon-Button gerendert.
- Click → `navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#' + headingId)`.
- Toast-Feedback "Permalink kopiert" via shadcn `useToast()`.
- Icon: lucide `Link2` oder `Clipboard`, h-4 w-4.
- Visibility: opacity-0, group-hover:opacity-100 (analog Auto-Anchor-Pattern).

### C — Loading-Skeleton beim Snapshot-Wechsel (BL-053)

Pfad: `src/components/handbook/reader-skeleton.tsx` (neu)
Pfad: `src/app/dashboard/handbook/[snapshotId]/loading.tsx` (neu, Next.js-Konvention) ODER `Suspense`-Fallback in der Page.

Verhalten:
- Skeleton zeigt Sidebar-Outline-Skeleton (5 Lines, 3 Indented) + Content-Block-Skeleton (h1-bar + 8 Paragraph-Lines + 3 sub-h2-bars).
- Wird waehrend der Server-Component-Suspense gezeigt (Next.js liefert beim Klick auf neuen Snapshot automatisch Suspense-Fallback wenn `loading.tsx` existiert).
- `animate-pulse` an allen Skeleton-Elementen.

### D — Mobile-h1-Wrap-Fix bei 375px (BL-055)

Pfad: `src/components/handbook/reader-content.tsx` oder `PROSE_CLASSES`-Block (geaendert)

Verhalten:
- `prose-h1:text-2xl sm:prose-h1:text-3xl` in der `PROSE_CLASSES`-Konstante als Mobile-Override hinzufuegen.
- `text-balance` und `word-break: break-word` an h1 fuer saubere Mehr-Zeilen-Darstellung.
- Pflicht-Pruefung: 375×667px Viewport, h1-Titel bricht max. 2 Zeilen.

### E — h1-Heading-Anchor-Hover sichtbar (BL-058)

Pfad: `src/components/handbook/reader-content.tsx` oder die `rehype-autolink-headings`-Config

Verhalten:
- `rehype-autolink-headings`-Optionen erweitern: `behavior: 'append'` mit `test: ['h1', 'h2', 'h3']` (statt nur h2/h3).
- CSS-Specificity-Fix: das Anchor-Hover-Symbol am h1 bekommt `!important` oder hoehere Spezifitaet als `prose-h1:mt-0`.
- Hit-Bereich des Anchor-Symbols: min h-6 w-6 mit `inline-flex items-center justify-center`.

### F — Tests

- `src/components/handbook/__tests__/use-scroll-spy.test.ts` (neu): IntersectionObserver-Mock + 3 Cases (kein Heading sichtbar, ein Heading sichtbar, mehrere Headings sichtbar mit korrekter Ordnung).
- `src/components/handbook/__tests__/copy-permalink-button.test.tsx` (neu): Clipboard-Mock + Click-Test + Toast-Trigger-Verifikation.
- Visual/Component-Smoke fuer Skeleton + Mobile-h1 + h1-Anchor-Hover laeuft im Browser-Smoke-Pflicht-Gate (siehe Pflicht-QA-Vorgaben).

## Out of Scope

- Cross-Snapshot-Suche (SLC-054)
- Search-History (SLC-054)
- Worker-TOC-Format-Aenderung (SLC-052)
- Help-Konsolidierung (SLC-055)
- Tooltip-Target-Fix (SLC-055)

## Acceptance Criteria

- AC-1: `useScrollSpy`-Hook liefert die ID der aktiven Section korrekt bei vertical scroll. Sidebar-Section-Link bekommt `data-active="true"` + Brand-Primary-Akzent.
- AC-2: Beim Scrollen durch Reader-Content wechselt die Active-Class der Sidebar live mit (kein Polling, IntersectionObserver-driven).
- AC-3: Pro h2/h3-Heading erscheint bei Hover ein Clipboard-Button (opacity 0 → 100 group-hover).
- AC-4: Click auf Clipboard kopiert Permalink mit Section-Anchor in `navigator.clipboard`. Toast "Permalink kopiert" erscheint.
- AC-5: Beim Klick auf einen anderen Snapshot zeigt der Reader fuer ~200-1000ms den Skeleton (Sidebar + Content), bevor neue Inhalte rendern.
- AC-6: Auf 375×667px Mobile-Viewport bricht der h1-Titel max. 2 Zeilen (kein 4-Zeilen-Bruch). Layout bleibt intakt, Sidebar collapsed sauber.
- AC-7: Hovering ueber den h1-Titel zeigt das Heading-Anchor-Hover-Symbol (#) sichtbar an. Klick auf das Symbol fuegt `#section-anchor` zur URL hinzu.
- AC-8: Bestehende h2/h3-Anchor-Hovers funktionieren unveraendert (keine V4.1-Regression).
- AC-9: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: V4.1 Reader-Architektur live (FEAT-028, SLC-044/045).
- Vorbedingung: SLC-053 done (ESLint-9 + Convention-Migration zuerst per DEC-062 Reihenfolge).
- Keine Vorbedingung auf SLC-052 oder SLC-054.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine. V4.3 hat per Constraint keine Schema-Aenderungen.

## Pflicht-QA-Vorgaben

- Browser-Smoke 1280×800 Desktop: Scroll-Spy markiert aktive Section live, Permalink-Button funktioniert, Skeleton sichtbar beim Snapshot-Wechsel, h1-Anchor-Hover-Symbol sichtbar.
- Browser-Smoke 375×667 Mobile: h1 bricht max 2 Zeilen, Sidebar collapsed sauber, Permalink-Button auch auf Mobile aktivierbar (Tap-Target h-8 w-8 mind.).
- 4-Rollen-RLS-Matrix bleibt 100% PASS (kein Backend-Touch erwartet, Pflicht-Verifikation).
- V4.2-Regression-Smoke: Wizard, Reader, Cockpit-Cards, Help-Sheet weiter funktional.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende (per project-records-format).

## Risks

- **R1 — IntersectionObserver-Browser-Compat:** Wird in modernen Browsern flaechendeckend unterstuetzt; Fallback nicht noetig fuer V4.3 (Strategaize-Audience nutzt Chrome/Edge/Firefox aktuell).
- **R2 — Skeleton-Sichtbarkeit zu kurz:** Wenn Snapshot klein, Skeleton flackert ggf. auf <100ms. Akzeptabel — Skeleton ist UX-Improvement, kein Pflicht-Wartebereich.
- **R3 — `prose-h1`-Override kollidiert mit V4.1-Style:** Mitigation = vor dem Aendern aktuelle `PROSE_CLASSES`-Definition lesen, Mobile-Override additiv ergaenzen, V4.1-Smoke-Test im Cockpit-Reader-Pfad.

## Detail-Decisions aus /architecture (V4.3)

- DEC-062 (Slice-Bundling): SLC-051 ist Reader-UX-Bundle in einem Slice — keine Aufteilung in 5 separate Slices.

### Micro-Tasks

#### MT-1: useScrollSpy-Hook + Tests
- Goal: IntersectionObserver-basierter Hook fuer Active-Section-Tracking.
- Files: `src/components/handbook/use-scroll-spy.ts` (neu), `src/components/handbook/__tests__/use-scroll-spy.test.ts` (neu)
- Expected behavior: Hook liefert `activeId` als ID der aktuellen sichtbaren Section nach IntersectionObserver-Threshold.
- Verification: 3 Vitest-Tests, IntersectionObserver-Mock.
- Dependencies: none.

#### MT-2: Sidebar-Active-Class-Integration
- Goal: ReaderSidebar konsumiert useScrollSpy und markiert aktive Section mit `data-active="true"` + Brand-Primary-Akzent.
- Files: `src/components/handbook/reader-sidebar.tsx` (geaendert), evtl. `globals.css` fuer Active-Style
- Expected behavior: Sidebar-Section-Link wird visuell hervorgehoben, sobald die Section im Viewport-Threshold ist.
- Verification: Browser-Smoke (Scroll durch Reader-Content, Sidebar-Active-Class wechselt live).
- Dependencies: MT-1.

#### MT-3: CopyPermalinkButton-Komponente + Tests
- Goal: Clipboard-Button pro h2/h3 mit Toast-Feedback.
- Files: `src/components/handbook/copy-permalink-button.tsx` (neu), `src/components/handbook/__tests__/copy-permalink-button.test.tsx` (neu)
- Expected behavior: Click kopiert Permalink-URL inkl. Section-Anchor, Toast "Permalink kopiert" erscheint.
- Verification: Vitest mit `navigator.clipboard`-Mock + Toast-Mock.
- Dependencies: none.

#### MT-4: Permalink-Button-Integration in ReaderContent
- Goal: CopyPermalinkButton in `react-markdown components.h2`-Override (und h3) einbauen.
- Files: `src/components/handbook/reader-content.tsx` (geaendert)
- Expected behavior: Hover ueber h2/h3 zeigt Clipboard-Button neben dem Auto-Anchor-Symbol.
- Verification: Browser-Smoke + Vitest-Render-Test.
- Dependencies: MT-3.

#### MT-5: ReaderSkeleton-Komponente
- Goal: Loading-Skeleton mit Sidebar-Outline + Content-Block.
- Files: `src/components/handbook/reader-skeleton.tsx` (neu), `src/app/dashboard/handbook/[snapshotId]/loading.tsx` (neu)
- Expected behavior: Beim Snapshot-Wechsel wird Skeleton fuer Suspense-Dauer angezeigt, dann nahtlos durch echten Inhalt ersetzt.
- Verification: Browser-Smoke (Klick auf anderen Snapshot, Skeleton sichtbar).
- Dependencies: none.

#### MT-6: Mobile-h1-Wrap + h1-Heading-Anchor-Hover
- Goal: PROSE_CLASSES Mobile-Override + rehype-autolink-headings Erweiterung auf h1.
- Files: `src/components/handbook/reader-content.tsx` (geaendert), evtl. `tailwind.config.ts` fuer custom prose-Erweiterung.
- Expected behavior: h1 wraps max 2 Zeilen auf 375px, h1-Anchor-Hover sichtbar.
- Verification: Browser-Smoke 1280×800 + 375×667 Pflicht (SC-V4.3-2).
- Dependencies: none.
