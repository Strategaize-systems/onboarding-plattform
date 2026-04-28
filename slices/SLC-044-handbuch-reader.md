# SLC-044 — Handbuch-Reader Page + Markdown-Stack + Sidebar-Nav + Snapshot-Liste

## Goal
In-App-Reader fuer Unternehmerhandbuch unter `/dashboard/handbook/[snapshotId]`. Tenant_admin und strategaize_admin koennen Snapshots direkt in der Plattform lesen mit Sidebar-Navigation, Section-Anchors und Snapshot-Liste — kein ZIP-Download mehr fuer normale Lesefaelle. **Pflicht-Gate: Browser-Smoke-Test mit Nicht-Tech-User-Persona** (Reader-UX-Test analog SC-V4-5).

## Feature
FEAT-028 (Handbuch In-App-Reader) — Hauptanteil

## In Scope

### A — NPM-Pakete
- `react-markdown` (latest stable, MIT-lizenziert) — Markdown-Renderer
- `remark-gfm` — Tables, Strikethrough, Autolinks (GFM-Standard)
- `rehype-slug` — Heading-IDs als Anchor-Targets
- `rehype-autolink-headings` — Klickbare Heading-Links
- Pruefung: gzipped <30KB Reader-Bundle-Erweiterung
- Pinning: `package.json` mit Caret-Versionen, `package-lock.json` aktualisiert

### B — Reader Server-Component
- Route `src/app/dashboard/handbook/[snapshotId]/page.tsx`:
  - Auth-Check: `strategaize_admin` ODER `tenant_admin` (anderes → 403/Redirect via Layout-Middleware oder explizit)
  - Laedt:
    - `handbook_snapshot`-Row via `id` (Service-Role-Client da Snapshot tenant-isoliert)
    - Tenant-Filter: wenn `tenant_admin`, Snapshot.tenant_id == auth.user_tenant_id() — sonst 404
    - Markdown-Files aus Storage-Bucket `handbook` (alle .md-Files unter snapshot.storage_path)
    - Liste aller Snapshots fuer den Tenant (sortiert created_at desc) fuer Sidebar-Navigation
    - block_review-Summary aus `snapshot.metadata` (falls SLC-041 MT-2 das Feld gefuellt hat)
- Stale-Check: Wenn `EXISTS(SELECT 1 FROM block_checkpoint WHERE capture_session_id = X AND created_at > snapshot.generated_at)` → Stale-Banner anzeigen
- Layout: `dashboard`-Layout (Sidebar + Header) + Reader-spezifischer Sub-Layout

### C — HandbookReader Client-Component
- `src/components/handbook/HandbookReader.tsx`:
  - Client-Component (Volltext-Suche kommt in SLC-045, hier Stub-Bereich vorbereiten)
  - Props: { sectionFiles: { filename, markdown }[], tenantId, snapshotId }
  - Rendert pro Section ein scrollbarer Bereich mit:
    - `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings`
    - Section-Header als h1-Anker
    - Sub-Anchors via Heading-Slugs
- Dark-Mode-kompatibel (Tailwind-prose oder analog)

### D — Sidebar-Navigation (Block-Liste aus Snapshot)
- `src/components/handbook/ReaderSidebar.tsx`:
  - Liste aller Sections aus dem Snapshot mit Section-Titel
  - Klick scrollt zur Section im Hauptbereich (Anchor-Navigation)
  - Active-Section-Highlight bei Scroll (optional, kann V4.2 stretch werden)
  - Snapshot-Liste als zweiter Sidebar-Abschnitt unten:
    - Alle Snapshots (timestamp + Generator-Info)
    - Aktiver Snapshot markiert
    - Klick wechselt Snapshot via Client-Navigation `router.push(/dashboard/handbook/[id])`
- Stale-Snapshot-Warnung als Banner ueber dem Hauptbereich (wenn Stale-Check positive)

### E — Cross-Link "Im Debrief bearbeiten"
- Pro Section ein Link "Im Debrief bearbeiten" der zu `/admin/debrief/[sessionId]/[blockKey]` springt
- Sichtbar NUR fuer `strategaize_admin` (server-seitig im Page-Render entschieden — DOM-leer fuer tenant_admin)
- Block-Key Mapping: aus dem Section-Filename ableitbar (Pattern `{order:02d}_{block_key}.md`) ODER aus snapshot.metadata (cleaner)

### F — Storage-Read via API-Proxy
- Markdown-Files werden via existierendem `/api/handbook/[snapshotId]/download` Endpoint geladen ODER neuer Endpoint `/api/handbook/[snapshotId]/section/[filename]` fuer Single-Section-Lesen
- Empfehlung: Server-Component laedt Markdown in einem Schritt mit Service-Role-Client (vermeide doppelten API-Hop)
- Bei sehr grossen Snapshots (>500KB Markdown total): Warnung im Reader-Header (siehe SLC-045 Performance-Warning)

### G — Sidebar-Link in DashboardSidebar
- Aenderung in `src/components/dashboard/DashboardSidebar.tsx` (oder analog):
  - Neuer Sidebar-Link "Unternehmerhandbuch" sichtbar fuer tenant_admin
  - Linkziel: `/dashboard/handbook` (Neue Page ohne ID — listet alle Snapshots des Tenants und linkt zu deren Reader-Pages)

### H — Snapshot-Auswahl-Page `/dashboard/handbook` (ohne ID)
- `src/app/dashboard/handbook/page.tsx`:
  - Server-Component
  - Listet alle Snapshots fuer Tenant des Users
  - Jede Karte: Generated-Date, Generator-Name, block_review_summary, Status, "Oeffnen"-Button → `/dashboard/handbook/[id]`
  - Empty-State: "Noch kein Handbuch generiert. Bitte den Berater (strategaize_admin) bitten, einen Snapshot zu generieren."

## Out of Scope
- Volltext-Suche (SLC-045)
- Performance-Warning fuer grosse Snapshots (SLC-045)
- Inline-Editor fuer KU/SOP (V4.2+, DEC-V4.1-1)
- Diff-View zwischen Snapshot-Versionen (V4.2+)
- KU-granulare Markierungen / Highlights (V4.2+)
- Reader-Zugriff fuer tenant_member oder employee (V5+, DEC-V4.1-2)
- Re-Generate-Button im Reader (Trigger bleibt unter `/admin/handbook`, DEC-043)

## Acceptance Criteria
- AC-1: tenant_admin von Tenant A oeffnet `/dashboard/handbook/[snapshotId]` (Snapshot von Tenant A) und sieht: Sidebar-Nav mit Block-Liste, Markdown-Hauptbereich gerendert, Section-Anchors klickbar, Snapshot-Liste mit mind. 1 Eintrag.
- AC-2: tenant_admin von Tenant B bekommt 404/Redirect bei Aufruf von Snapshot von Tenant A.
- AC-3: tenant_member und employee bekommen 403/Redirect bei Direkt-Aufruf der Reader-Route.
- AC-4: strategaize_admin kann Reader fuer beliebigen Tenant-Snapshot oeffnen via Direct-URL.
- AC-5: Section-Anchors funktionieren — Klick auf Heading-Link in Markdown scrollt zur Heading-Position.
- AC-6: Cross-Link "Im Debrief bearbeiten" pro Section ist fuer strategaize_admin sichtbar, fuer tenant_admin nicht im DOM.
- AC-7: Cross-Link fuehrt zu korrektem `/admin/debrief/[sessionId]/[blockKey]` (Block-Key korrekt aus Section-Filename oder Metadata extrahiert).
- AC-8: Snapshot-Liste in Sidebar zeigt alle Tenant-Snapshots Reverse-Chrono. Aktiver Snapshot markiert. Klick wechselt zu anderem Snapshot.
- AC-9: Stale-Snapshot-Warnung erscheint, wenn ein block_checkpoint nach `snapshot.generated_at` existiert.
- AC-10: `/dashboard/handbook` (ohne ID) zeigt Karten-Liste aller Snapshots fuer den eigenen Tenant.
- AC-11: `/dashboard/handbook` Empty-State korrekt wenn noch kein Snapshot existiert.
- AC-12: Sidebar-Link "Unternehmerhandbuch" sichtbar fuer tenant_admin in DashboardSidebar.
- AC-13: Markdown rendert sauber mit Tables, Lists, Headings, Code-Blocks (GFM-Features).
- AC-14: Responsive: Sidebar collapsiert auf mobile, Hauptbereich nutzt full-width.
- AC-15: `npm run build` + `npm run test` gruen.
- AC-16: **Pflicht-Browser-Smoke-Test mit Nicht-Tech-User-Persona** — Tester oeffnet einen Snapshot, navigiert in 2-3 Sections, findet "Im Debrief bearbeiten"-Link (als strategaize_admin), versteht Snapshot-Liste — Feedback dokumentiert im Completion-Report.

## Dependencies
- Vorbedingung: V4 SLC-039 + SLC-040 done (handbook_snapshot-Tabelle + ZIP-Storage existieren).
- Vorbedingung: SLC-041 done (block_review-Daten existieren fuer block_review_summary; nicht-strikt — Reader funktioniert auch ohne, dann zeigt Summary nur leere Counts).
- Empfohlene Vorbedingung: SLC-042 done fuer vollstaendige UX (sonst sind Cross-Links und Cockpit-Card stub).
- Nachgelagerter Slice: SLC-045 (Volltext-Suche im Reader).

## Worktree
Mandatory (SaaS).

## Migrations-Zuordnung
Keine Migration in diesem Slice.

## Pflicht-QA-Vorgaben
- **Pflicht-Gate: Browser-Smoke-Test mit Nicht-Tech-User-Persona** (R17 analog SC-V4-5). Dokumentation im Completion-Report.
- RLS-Test: tenant_admin sieht nur eigene Snapshots, tenant_member/employee 403.
- Cross-Tenant-Test: strategaize_admin Direct-URL auf fremden Tenant funktioniert.
- Markdown-Render-Test: GFM-Features (Tables, Lists, Code) korrekt.
- Section-Anchor-Klick-Test: Scroll-to-Heading funktioniert.
- Snapshot-Wechsel-Test: Klick auf anderen Snapshot in Sidebar laedt anderen Markdown-Content.
- Stale-Banner-Test mit erzwungenem Mock-Block-Submit.
- Responsive-Check (mobile, tablet, desktop).
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.
- Cockpit-Records-Update nach Slice-Ende (mandatory).

## Risks
- **R1 — react-markdown Plugin-Kompatibilitaet:** Plugins koennen Versions-Konflikte haben. Mitigation: Plugin-Versionen aus react-markdown README zitieren, Build-Test direkt nach Install.
- **R2 — Markdown-Render-Performance bei grossen Snapshots:** Mitigation: Pre-Filter, Performance-Warning kommt in SLC-045.
- **R3 — Cross-Link Block-Key-Mapping:** Wenn Snapshot-Section-Filename-Pattern nicht eindeutig auf block_key mapt, dann Cross-Link fehlerhaft. Mitigation: Block-Key in `snapshot.metadata.section_block_map` schreiben (in SLC-041 MT-2 oder SLC-044 MT-3 als Erweiterung von handle-snapshot-job.ts).
- **R4 — Storage-Read-Performance bei vielen Section-Files:** Mitigation: Service-Role-Client mit batch-Lookup oder ZIP-extract-im-Reader (cached). V4.1: einfacher Loop mit Promise.all.

### Micro-Tasks

#### MT-1: NPM-Pakete installieren + Build verifizieren
- Goal: react-markdown + Plugin-Kette installieren.
- Files: `package.json`, `package-lock.json` (auto)
- Expected behavior: `npm install`, `npm run build` ohne Errors. Bundle-Size-Check (gzipped <30KB Erweiterung).
- Verification: `npm run build` gruen. Bundle-Analyzer optional.
- Dependencies: keine

#### MT-2: Reader Server-Component Page + Storage-Read
- Goal: `/dashboard/handbook/[snapshotId]/page.tsx` mit Auth-Check + Storage-Read der Markdown-Files.
- Files: `src/app/dashboard/handbook/[snapshotId]/page.tsx` (neu), `src/lib/handbook/load-snapshot-content.ts` (neu — Service-Role-Storage-Read)
- Expected behavior: Server-Component laedt Snapshot + alle Section-Markdown-Files, RLS-Check via Tenant-ID, Stale-Check mit block_checkpoint.
- Verification: Browser-Test als tenant_admin (eigener Tenant) + 404-Test (fremder Tenant) + 403-Test (tenant_member).
- Dependencies: MT-1

#### MT-3: HandbookReader Client-Component + Markdown-Render
- Goal: HandbookReader-Komponente mit react-markdown + Plugins + Section-Anchors.
- Files: `src/components/handbook/HandbookReader.tsx` (neu)
- Expected behavior: Sections gerendert, Headings als Anchor-Links klickbar, Tables + Lists korrekt.
- Verification: Browser-Test mit Mock-Snapshot mit GFM-Features. Visual-Verifikation.
- Dependencies: MT-2

#### MT-4: ReaderSidebar mit Block-Liste + Snapshot-Liste
- Goal: ReaderSidebar-Komponente mit zwei Abschnitten (aktuelle Sections + alle Snapshots).
- Files: `src/components/handbook/ReaderSidebar.tsx` (neu), Reader-Page-Integration
- Expected behavior: Section-Liste klickbar (Scroll-to-Anchor), Snapshot-Liste navigiert via router.push, aktive Section/Snapshot-Highlight.
- Verification: Browser-Test mit mind. 2 Snapshots, Wechsel zwischen Snapshots verifiziert.
- Dependencies: MT-2, MT-3

#### MT-5: Cross-Link "Im Debrief bearbeiten" + RLS-Sichtbarkeit
- Goal: Pro Section Cross-Link der nur fuer strategaize_admin gerendert wird.
- Files: HandbookReader.tsx (geaendert), evtl. neue Helper `src/lib/handbook/section-block-map.ts` fuer Section→Block-Key Mapping
- Expected behavior: strategaize_admin sieht Link pro Section, tenant_admin sieht ihn nicht im DOM, Klick fuehrt zu korrektem `/admin/debrief/[sessionId]/[blockKey]`.
- Verification: Browser-Test in beiden Rollen-Sichten + Code-Review (Link nicht im DOM fuer tenant_admin).
- Dependencies: MT-3, MT-4

#### MT-6: Snapshot-Auswahl-Page `/dashboard/handbook` + Sidebar-Link
- Goal: `/dashboard/handbook` ohne ID als Snapshot-Auswahl + Sidebar-Link in DashboardSidebar.
- Files: `src/app/dashboard/handbook/page.tsx` (neu), `src/components/dashboard/DashboardSidebar.tsx` (geaendert — Pfad ggf. anpassen)
- Expected behavior: Snapshot-Liste mit Karten, Empty-State, Sidebar-Link sichtbar fuer tenant_admin.
- Verification: Browser-Test mit Demo-Tenant, Empty-State-Test mit leerem Tenant.
- Dependencies: MT-2

#### MT-7: Pflicht-Browser-Smoke-Test mit Nicht-Tech-User-Persona
- Goal: User selbst (oder Tester) fuehrt durch Reader-UX ohne Erklaerung.
- Files: keine — Test-Dokumentation im Completion-Report
- Expected behavior: Nicht-Tech-User findet Reader, navigiert in Sections, versteht Snapshot-Liste, kann Cross-Link nutzen (falls strategaize_admin-Persona). Was war intuitiv, was hat verwirrt?
- Verification: Feedback-Dokumentation im Completion-Report. Bugs in KNOWN_ISSUES, Verbesserungen in SKILL_IMPROVEMENTS.
- Dependencies: MT-1..MT-6
- Pflicht-Gate fuer V4.1-Release.
