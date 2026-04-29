# FEAT-033 — In-App-Hilfe

- Version: V4.2
- Backlog: BL-061
- Status: planned
- Created: 2026-04-29

## Was

Right-Side `Sheet` (shadcn/ui) mit kontextueller Markdown-Hilfe pro Hauptansicht, geoeffnet via `?`-Trigger im Header. Help-Inhalte als Markdown-Files unter `/content/help/<page-key>.md` (versionierbar via Git, Berater-pflegbar via PR). Zusaetzlich: `Tooltip`-Komponenten an mindestens 5 kritischen UI-Elementen mit kurzem Erklaerungstext.

## Warum

Jede V4-Hauptansicht (Dashboard, Capture, Bridge-Review, Reviews, Handbuch-Reader) hat genug Komplexitaet, dass ein Erst-User Tooltips oder eine Inline-Erklaerung braucht. Heute (V4.1) gibt es keine In-App-Hilfe — der User muss raten oder den Berater fragen. Das bricht das V4.2-Self-Service-Versprechen.

## V4.2-Scope

### In Scope

- **Help-Sheet-Komponente** (DEC-V4.2-8): Right-Side `Sheet` aus shadcn/ui, oeffnet ueber `?`-Icon-Button im Header. Schliessen via Esc, Outside-Click, X-Button.
- **Help-Content-Format** (DEC-V4.2-7): Markdown-Files unter `/content/help/<page-key>.md` (genaue Pfad-Convention in /architecture, Q-V4.2-C). Zur Build-Zeit via Static-Imports gebundelt — kein Runtime-Fetch, kein DB-Lookup.
- **Help-Content fuer 5 Haupt-Pages** (SC-V4.2-7):
  - `/dashboard` → `dashboard.md`: Was zeigt das Cockpit, was ist der "naechste Schritt"-Banner.
  - `/capture/[sessionId]` → `capture.md`: Wie funktioniert Block-Submit, was sind Knowledge Units.
  - `/admin/bridge` → `bridge.md`: Was macht die Bridge-Engine, wann nutzen.
  - `/admin/reviews` → `reviews.md`: Wozu Block-Reviews, wie approven.
  - `/dashboard/handbook[/...]` → `handbook.md`: Wie liest man das Handbuch, was sind Snapshots.
- **Markdown-Render**: Wiederverwendung von `react-markdown` aus FEAT-028 (Annahme A-V4.2-3). Keine zweite Markdown-Library.
- **Tooltip-Integration** an mindestens 5 UI-Elementen (SC-V4.2-8):
  1. Bridge-Trigger-Button auf `/admin/bridge`: "Erzeugt Mitarbeiter-Capture-Vorschlaege aus GF-Blueprint"
  2. Approve-Block-Button auf `/admin/blocks/[blockKey]/review`: "Approve = Mitarbeiter-Antworten fliessen ins Handbuch"
  3. Generate-Snapshot-Button auf `/admin/handbook`: "Generiert das Unternehmerhandbuch aus aktuellem Stand"
  4. Wizard-"Spaeter"-Button (FEAT-031): "Du kannst den Wizard jederzeit abschliessen"
  5. "Mitarbeiter ohne Aktivitaet"-Badge auf `/dashboard` (FEAT-032): "Mitarbeiter mit accepted Invitation aber ohne Block-Submit"
- **Tooltip-Library**: shadcn `Tooltip` (Radix-basiert), keine Custom-Implementation.
- **Help-Update-Disziplin** (R-V4.2-3 Mitigation): Wenn ein Slice eine der 5 Haupt-Pages aendert, ist Help-File-Update Pflicht-Item im Slice. Lint via Code-Review (kein automatischer CI-Block in V4.2).

### Out of Scope (bewusst, V4.3+ oder spaeter)

- **Onboarding-Tour-Overlay** (Joyride-Pattern) — zu invasiv, wird durch Help-Sheet abgedeckt.
- **Help-Content in der DB + In-App-Editor** — V4.2 nutzt PR-Workflow. Editor wird gebraucht wenn Berater haeufig editiert.
- **Mehrsprachige Help-Inhalte** — Tenant-Language gilt, V4.2 ist DE-only.
- **AI-gestuetzte Hilfe-Antworten** (Chatbot, Q&A) — V5+.
- **Tooltip-"Verstanden, nicht mehr zeigen"-Toggle** — Tooltips sind kontextuell, keine Onboarding-Schritte (Q-V4.2-F).
- **Hilfe-Suche** (alle Help-Files durchsuchbar) — V5+ wenn Help-Volume das rechtfertigt.
- **Externe Onboarding-Videos / Tutorials-Hosting** — V5+.

## Acceptance Criteria

1. Auf `/dashboard` ist ein `?`-Icon-Button im Header sichtbar. Klick oeffnet Right-Side-Sheet mit Markdown-Inhalt aus `/content/help/dashboard.md`.
2. Sheet schliesst via Esc, Outside-Click, X-Button.
3. Auf den 5 Haupt-Pages (`/dashboard`, `/capture/[sessionId]`, `/admin/bridge`, `/admin/reviews`, `/dashboard/handbook[/...]`) ist `?`-Button + Sheet jeweils erreichbar.
4. Jede der 5 Help-Markdown-Files existiert mit mindestens 100 Wortern Inhalt (kein Lorem-Ipsum-Platzhalter).
5. Markdown wird via `react-markdown` gerendert (gleiche Library wie Reader, FEAT-028).
6. Tooltip an Bridge-Trigger-Button erscheint bei Hover/Focus (Standard shadcn-Verhalten).
7. Tooltip-Text fuer alle 5 Elemente ist nicht leer und nicht laenger als 100 Zeichen.
8. Help-Sheet-Lade-Performance: Beim ersten Sheet-Open der Page < 100ms (Markdown ist gebundelt, kein Network-Roundtrip).
9. Build-Bundle-Overhead durch Help-Content < 25KB (5 Files × max 5KB).
10. Help-Sheet ist auf Mobile (375×667) lesbar — Sheet nimmt mind. 80% Screen-Width, Markdown bleibt lesbar.

## Abhaengigkeiten

- **react-markdown aus FEAT-028 (V4.1 Reader)** — wird wiederverwendet.
- **shadcn/ui `Sheet` und `Tooltip` Komponenten** — bereits in V3+ etabliert.
- **Tailwind Prose-Plugin** — bereits in V4.1 eingebunden fuer Reader.

## Cross-Refs

- DEC-V4.2-7, DEC-V4.2-8 (PRD V4.2-Sektion)
- SC-V4.2-7, SC-V4.2-8, SC-V4.2-9 (PRD V4.2-Sektion)
- Q-V4.2-C (Help-Content-Lokalitaet — definitiv in /architecture)
- Q-V4.2-F (Tooltip-Persistenz-Hint — definitiv in /frontend)
- R-V4.2-3 (Help-Content-Drift Mitigation)
