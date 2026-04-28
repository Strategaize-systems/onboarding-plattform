# FEAT-030 — Berater-Visibility-Verlinkung im Cockpit

- Version: V4.1
- Backlog: BL-050
- Status: planned
- Created: 2026-04-28

## Was

Vom strategaize_admin-Cockpit aus erreichbare Direkt-Links zu Berater-Konsultations-Workflows pro Tenant. Eine neue Cross-Tenant-Sicht `/admin/reviews` zeigt alle pendenden Reviews ueber alle Tenants. Eine Pro-Tenant-Sicht `/admin/tenants/[id]/reviews` filtert auf einen Tenant.

## Warum

Der V2-Debrief-UI unter `/admin/debrief/[sessionId]/[blockKey]` existiert seit V2 und ist die etablierte Berater-Konsultations-Flaeche. Das V4-Cockpit verlinkt sie nicht — der Berater muss die URL kennen oder sich durch Sessions klicken. Mit dem neuen Block-Approval-Workflow aus FEAT-029 werden Berater-Reviews zum laufenden Bestandteil des Workflows. Ohne sichtbare Verlinkung im Cockpit bleibt das implizit und schwer auffindbar.

V4.1 macht den Berater-Workflow ueber Cross-Tenant- und Pro-Tenant-Listen sichtbar (DEC-V4.1-7, DEC-V4.1-8). Es wird bewusst kein UI-Switcher / "Berater-Mode-Toggle" gebaut — die Direct-Links reichen.

## V4.1-Scope

### In Scope

- **Neue Top-Level-Page `/admin/reviews` (Cross-Tenant-Aggregat)**:
  - Liste aller Bloecke mit `block_review.status='pending'` ueber alle Tenants
  - Sortiert nach aeltestem `block_session.last_submitted_at` (oldest-first — was am laengsten wartet)
  - Spalten: Tenant-Name, Block-Titel, Anzahl Mitarbeiter-KUs, Letzter Submit-Zeitpunkt, Aktion-Spalte mit Link auf `/admin/blocks/[blockKey]/review?tenant=...`
  - Filter: optional nach Tenant, nach Template
  - Sidebar-Link in Admin-Layout
- **Pro-Tenant-Sicht `/admin/tenants/[id]/reviews`**:
  - Gleiche Liste, gefiltert auf den ausgewaehlten Tenant
  - Verlinkt vom bestehenden `/admin/tenants` Tabellen-Eintrag pro Tenant ("Reviews ansehen")
  - Direct-Links zu Konsolidierter Review-View und zu `/admin/debrief/[sessionId]/[blockKey]`
- **Quick-Stats-Counter im `/admin/tenants` Tabellen-Eintrag** pro Tenant: "X pending Reviews" als Badge. Klick fuehrt zur Pro-Tenant-Reviews-Sicht.

### Out of Scope (bewusst, V4.1)

- **Berater-Mode-Toggle im Cockpit-Header** (Tenant-Impersonation oder UI-Switcher tenant_admin/strategaize_admin). Cross-Tenant-Sicht reicht (DEC-V4.1-7).
- **Notification / E-Mail bei neuer pending Review.** V4.1 ist Pull-Model — Berater muss selbst rueberschauen. Push-Modell ist V4.2 oder spaeter.
- **Auto-Sortierung nach Tenant-Prioritaet.** Default-Sortierung ist nach Alter.
- **Bulk-Approve-Aktion** ueber mehrere Bloecke / Tenants gleichzeitig. Approve bleibt block-weise.

## Acceptance Criteria

1. `strategaize_admin` ruft `/admin/reviews` auf und sieht Cross-Tenant-Aggregat aller pendenden Block-Reviews. Sortierung default oldest-first.
2. Liste ist leer, wenn alle `block_review.status='pending'` aufgeloest sind.
3. Klick auf einen Listen-Eintrag fuehrt zu `/admin/blocks/[blockKey]/review?tenant=...&session=...` (FEAT-029 Konsolidierter Review-View).
4. `/admin/tenants/[id]/reviews` zeigt die gleiche Liste gefiltert auf einen Tenant.
5. `/admin/tenants` Tabellen-Eintrag pro Tenant zeigt Badge mit Anzahl pending Reviews. Badge-Klick fuehrt zur Pro-Tenant-Reviews-Sicht.
6. `tenant_admin` und niedrigere Rollen bekommen `403`/Redirect bei Aufruf von `/admin/reviews` (Admin-only Page).
7. RLS verhindert Cross-Tenant-Lecks: `strategaize_admin` sieht alle Tenants (RLS-bypass Pattern), aber die Aggregations-Query nutzt explizit `tenant_id`-Spalte zur Anzeige.
8. Performance: `/admin/reviews` laedt unter 500ms bei bis zu 50 Tenants × 10 Bloecke. Sonst optimieren mit Index auf `block_review(status, created_at)`.

## Abhaengigkeiten

- **FEAT-029 (Berater-Review):** `block_review`-Tabelle muss existieren mit `status='pending'`-Eintraegen. Ohne Daten ist die Liste leer (kein Bruch).
- **V4 Cockpit (FEAT-027):** `/admin/tenants` existiert. V4.1 erweitert es um die Reviews-Spalte/Badge.

## Cross-Refs

- DEC-V4.1-7, DEC-V4.1-8 (PRD V4.1-Sektion)
- SC-V4.1-8, SC-V4.1-9 (PRD V4.1-Sektion)
