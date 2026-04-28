# FEAT-028 — Handbuch In-App-Reader

- Version: V4.1
- Backlog: BL-047 (gekuerzt fuer V4.1: Reader-Only ohne Inline-Editor, ohne Diff-View)
- Status: planned
- Created: 2026-04-28

## Was

Der `tenant_admin` und `strategaize_admin` koennen einen generierten Unternehmerhandbuch-Snapshot direkt in der Plattform lesen, navigieren und durchsuchen. Heute (V4) ist der einzige Lese-Weg ein ZIP-Download — der Reader ersetzt das fuer den Standard-Lesefall.

## Warum

V4 hat das Handbuch als generierter Markdown-ZIP-Snapshot persistiert. Lesen erfordert Download, Entpacken, externer Markdown-Viewer. Suche und Navigation liegen ausserhalb der Plattform. Reibung pro Lese-Vorgang ist hoch und vermittelt nicht das Gefuehl eines lebenden Handbuchs. Der Reader macht das Handbuch zu einem in-Plattform-Artefakt, das laufend referenziert werden kann.

## V4.1-Scope

### In Scope

- **Reader-Route** unter `/dashboard/handbook/[snapshotId]` (DEC-V4.1-3). `tenant_admin` landet hier ueber Sidebar-Link, `strategaize_admin` ueber `/admin/tenants` Drill-Down oder Direct-Link aus `/admin/handbook`.
- **Sidebar-Navigation** mit Block-Liste aus dem Snapshot (gleiche Reihenfolge wie im generierten Markdown). Klick scrollt zur Block-Sektion im Hauptbereich.
- **Markdown-Hauptbereich** mit gerenderten Inhalten via etablierter Markdown-Library (`react-markdown` oder Aequivalent — finale Wahl in /architecture, Q-V4.1-B).
- **Section-Anchor-Links** innerhalb des Markdowns (Headings als Anchor-Targets, klickbare Inhaltsverzeichnis-Links).
- **Snapshot-Liste** sichtbar im Reader: alle Snapshots des Tenants mit Timestamp + Generator-Info (welche Version, wann generiert, von wem getriggert). Auswahl wechselt den geladenen Snapshot.
- **Volltext-Suche** Client-Side im aktuell geladenen Snapshot. Highlight im Treffer + Scroll-to-Position.
- **Cross-Link "Im Debrief bearbeiten"** pro Block-Sektion fuer `strategaize_admin` — fuehrt zu `/admin/debrief/[sessionId]/[blockKey]`. Fuer `tenant_admin` nicht sichtbar (RLS, kein Editor-Zugriff).
- **Snapshot-Status-Anzeige** wenn der aktuell geladene Snapshot stale ist (neuer Block-Submit nach Snapshot-Datum existiert) — Hinweis "Es gibt neuere Daten — neuen Snapshot generieren".

### Out of Scope (bewusst, V4.1 → spaeter)

- **Inline-Editor fuer KU/SOP** im Reader. Editing bleibt in V4.1 ueber `/admin/debrief` erreichbar (Cross-Link). Begruendung DEC-V4.1-1.
- **Diff-View zwischen Snapshot-Versionen.** Snapshots sind nur als Liste mit Timestamp+Generator sichtbar, kein Vergleichs-View.
- **Cross-Snapshot-Suche** oder Full-Tenant-Search. Suche operiert nur im aktuell geladenen Snapshot.
- **Reader-Zugriff fuer `tenant_member` und `employee`.** Admin-only in V4.1 (DEC-V4.1-2).
- **Re-Generate-Button im Reader.** Trigger bleibt unter `/admin/handbook` (Berater-Hoheit).

## Acceptance Criteria

1. `tenant_admin` von Tenant A oeffnet `/dashboard/handbook/[snapshotId]` (Snapshot von Tenant A) und sieht: Sidebar mit Block-Liste, Markdown-Hauptbereich gerendert, Section-Anchors klickbar, Snapshot-Liste mit mind. 1 Eintrag.
2. `tenant_admin` von Tenant B bekommt bei `/dashboard/handbook/[snapshotId]` (Snapshot von Tenant A) `404` oder Redirect — RLS regelt.
3. `strategaize_admin` kann ueber `/admin/tenants/[id]` einen Direct-Link auf den letzten Snapshot des Tenants oeffnen und den Reader sehen.
4. Volltext-Suche im Reader: Eingabe von 3+ Zeichen markiert alle Treffer im Markdown, Klick auf Treffer-Listen-Eintrag scrollt zur Stelle.
5. Cross-Link "Im Debrief bearbeiten" ist fuer `strategaize_admin` pro Block sichtbar und fuehrt zu `/admin/debrief/[sessionId]/[blockKey]`. Fuer `tenant_admin` nicht im DOM vorhanden.
6. Snapshot-Liste zeigt alle Snapshots des Tenants in Reverse-Chrono-Reihenfolge mit `generated_at`, `generator` (User-Name), `block_review_summary` (X/Y reviewed zum Generierungszeitpunkt).
7. Stale-Snapshot-Warnung erscheint, wenn ein `block_submit` nach `snapshot.generated_at` existiert.
8. `tenant_member` und `employee` bekommen bei Direkt-Aufruf der Reader-Route `403` oder Redirect.
9. RLS-Test-Matrix erweitert um Reader-Zugriff (Permission-Test pro Rolle).

## Abhaengigkeiten

- **V4 Foundation (FEAT-026):** Snapshot-Schema und ZIP-Storage existieren. Reader liest die selben Snapshot-Records.
- **FEAT-029 (Berater-Review):** `block_review_summary`-Daten kommen aus dem `block_review`-Schema. Reader zeigt sie nur an, schreibt sie nicht.

## Cross-Refs

- DEC-V4.1-1, DEC-V4.1-2, DEC-V4.1-3 (PRD V4.1-Sektion)
- SC-V4.1-1, SC-V4.1-2, SC-V4.1-3, SC-V4.1-11 (PRD V4.1-Sektion)
