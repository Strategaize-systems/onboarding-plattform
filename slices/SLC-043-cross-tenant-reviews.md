# SLC-043 — Cross-Tenant + Pro-Tenant Reviews-Sichten + Quick-Stats-Badge

## Goal
Berater-Visibility: Vom strategaize_admin-Cockpit aus erreichbare Cross-Tenant- und Pro-Tenant-Sichten der pendenden Reviews. Drei UI-Surfaces: (1) `/admin/reviews` Cross-Tenant-Aggregat aller pendenden Bloecke ueber alle Tenants (oldest-first), (2) `/admin/tenants/[id]/reviews` Pro-Tenant-Filter, (3) Quick-Stats-Badge im bestehenden `/admin/tenants` Tabellen-Eintrag. Direct-Links fuehren zu SLC-042 Konsolidierter Review-View und V2 `/admin/debrief`.

## Feature
FEAT-030 (Berater-Visibility-Verlinkung)

## In Scope

### A — Cross-Tenant `/admin/reviews` Page
- Route `src/app/admin/reviews/page.tsx` (Server-Component):
  - strategaize_admin-only via Middleware oder explizit (tenant_admin etc. → 403/Redirect)
  - Aggregations-Query (siehe ARCHITECTURE.md V4.1-Sektion):
    ```sql
    SELECT br.tenant_id, t.name AS tenant_name, br.capture_session_id,
           br.block_key, br.created_at,
           cs.last_submitted_at,
           (SELECT count(*) FROM knowledge_unit ku
            WHERE ku.tenant_id = br.tenant_id
              AND ku.capture_session_id = br.capture_session_id
              AND ku.block_key = br.block_key
              AND ku.source = 'employee_questionnaire') AS ku_count
    FROM block_review br
    JOIN tenants t ON t.id = br.tenant_id
    LEFT JOIN capture_session cs ON cs.id = br.capture_session_id
    WHERE br.status = 'pending'
    ORDER BY br.created_at ASC;
    ```
  - Index `idx_block_review_status_created` (aus SLC-041 MIG-028) deckt diese Query ab
- UI: Tabelle mit Spalten Tenant | Block | KU-Count | Letzter Submit | Aktion
  - "Aktion"-Spalte: Link zu `/admin/blocks/[blockKey]/review?tenant=...&session=...` (SLC-042 Page)
  - Optional: Sekundaerer Link zu `/admin/debrief/[sessionId]/[blockKey]` (V2-Editor)
- Filter (optional, V4.1 stretch):
  - Filter nach Tenant (Dropdown)
  - Filter nach Template (Dropdown)
- Empty-State: "Aktuell keine pendenden Reviews. Alle Mitarbeiter-Bloecke sind aktuell entweder approved oder rejected." mit Subtext.

### B — Pro-Tenant `/admin/tenants/[id]/reviews` Page
- Route `src/app/admin/tenants/[tenantId]/reviews/page.tsx` (Server-Component):
  - strategaize_admin-only
  - Gleiche Aggregations-Query wie A, aber zusaetzlich `WHERE br.tenant_id = $1`
  - Index `idx_block_review_tenant_status` deckt diese ab
- UI: Tabelle wie A, ohne Tenant-Spalte (durch Filter implizit klar)
- Header: Tenant-Name + Anzahl pending Reviews + Link zurueck zu `/admin/tenants/[id]`
- Empty-State analog A

### C — Quick-Stats-Badge in `/admin/tenants`
- Aenderung in `src/app/admin/tenants/TenantsClient.tsx`:
  - Neue Spalte oder Badge im Tenant-Tabellen-Eintrag: "X pending Reviews"
  - Badge-Styling: gelb wenn `> 0`, grau wenn `0`
  - Klick → linkt zu `/admin/tenants/[id]/reviews`
- Aggregations-Query (Server-Side im TenantsClient-Parent):
  ```sql
  SELECT tenant_id, count(*) FILTER (WHERE status = 'pending') AS pending_reviews
  FROM block_review GROUP BY tenant_id;
  ```
  LEFT-JOIN auf bestehende Tenant-Liste, Map `tenant_id → pending_reviews`.

### D — Sidebar-Link in Admin-Layout
- Aenderung in Admin-Sidebar-Component (vermutlich `src/components/admin/AdminSidebar.tsx` oder analog):
  - Neuer Sidebar-Link "Reviews" (icon: ClipboardCheck o.ae.) zu `/admin/reviews`
  - Sichtbar nur fuer strategaize_admin
  - Optional: Badge im Sidebar-Link mit Total-Pending-Count (Vorsicht — performance check, ggf. lazy-laden)

## Out of Scope
- Berater-Mode-Toggle / Tenant-Impersonation (DEC-047, bewusst nicht in V4.1)
- Push-Notifications / E-Mails bei neuer pending Review (V4.2+)
- Bulk-Approve ueber mehrere Bloecke / Tenants gleichzeitig (V4.2+)
- Auto-Sortierung nach Tenant-Prioritaet (V4.2+)
- Konsolidierter Review-View fuer Block-Approve (in SLC-042)
- Reader-Page (in SLC-044)

## Acceptance Criteria
- AC-1: `strategaize_admin` ruft `/admin/reviews` auf und sieht Cross-Tenant-Aggregat aller pendenden Block-Reviews. Sortierung oldest-first.
- AC-2: tenant_admin und niedrigere Rollen bekommen 403/Redirect bei Aufruf von `/admin/reviews`.
- AC-3: Liste ist leer mit Empty-State-Text wenn keine pending Reviews existieren.
- AC-4: Klick auf Listen-Eintrag fuehrt zu `/admin/blocks/[blockKey]/review?tenant=...&session=...` (SLC-042 Page).
- AC-5: `/admin/tenants/[id]/reviews` zeigt gleiche Liste gefiltert auf einen Tenant. Header zeigt Tenant-Name.
- AC-6: `/admin/tenants` Tabellen-Eintrag pro Tenant zeigt Badge mit Anzahl pending Reviews. Badge-Klick fuehrt zur Pro-Tenant-Reviews-Sicht.
- AC-7: Badge ist gelb bei `> 0`, grau bei `0`.
- AC-8: Sidebar-Link "Reviews" sichtbar fuer strategaize_admin, fuehrt zu `/admin/reviews`. Fuer andere Rollen nicht im DOM.
- AC-9: Performance: `/admin/reviews` laedt unter 500ms bei bis zu 50 Tenants × 10 Bloecke (Index-gestuetzt).
- AC-10: Sub-Sortierung bei gleichem `created_at`: nach Tenant-Name alphabetisch.
- AC-11: `npm run build` + `npm run test` gruen.
- AC-12: Responsive: Tabellen brechen auf mobile sauber (horizontale Scroll oder Card-Layout).

## Dependencies
- Vorbedingung: SLC-041 done (`block_review`-Tabelle + Indizes existieren).
- Empfohlene Vorbedingung: SLC-042 done (Konsolidierter Review-View existiert als Link-Ziel — sonst 404 bis SLC-042 done).
- Kein nachgelagerter V4.1-Slice direkt abhaengig.

## Worktree
Mandatory (SaaS).

## Migrations-Zuordnung
Keine Migration in diesem Slice.

## Pflicht-QA-Vorgaben
- Cross-Rollen-Verifikation: tenant_admin/employee/tenant_member bekommen 403/Redirect bei `/admin/reviews` und `/admin/tenants/[id]/reviews`.
- RLS-Test: strategaize_admin sieht alle Tenants in der Liste; tenant_admin (negativ-Test) sieht nichts in `/admin/reviews`.
- Performance-Test: 50 Tenants × 10 Bloecke Mock-Daten (ggf. via Test-Seed), Page-Load <500ms.
- Empty-State-Verifikation.
- Responsive-Check.
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.
- Cockpit-Records-Update nach Slice-Ende (mandatory).

## Risks
- **R1 — Performance bei vielen Tenants:** Index ist da (idx_block_review_status_created), aber Aggregat-Query mit LEFT-JOIN tenants koennte langsam werden. Mitigation: EXPLAIN ANALYZE in QA, ggf. Materialized View bei Bedarf (nicht in V4.1).
- **R2 — Quick-Stats-Badge in `/admin/tenants` koennte eine N+1-Query erzeugen:** Mitigation: Single Aggregation-Query GROUP BY tenant_id, in JS-Map mit Tenant-Liste joined.
- **R3 — Sidebar-Badge mit Total-Pending-Count koennte teuer sein:** Mitigation: Lazy-Laden via separate Server-Action oder Optional in V4.1 weglassen.
- **R4 — SLC-042 noch nicht done:** Link-Ziele 404. Akzeptabel, sobald SLC-042 done sind die Links funktional.

### Micro-Tasks

#### MT-1: Cross-Tenant `/admin/reviews` Page
- Goal: Cross-Tenant-Aggregat-Page mit Tabelle.
- Files: `src/app/admin/reviews/page.tsx` (neu), `src/lib/reviews/list-cross-tenant.ts` (neu, Aggregations-Query)
- Expected behavior: Server-Component laedt Aggregat, rendert Tabelle mit Spalten + Action-Links, Empty-State.
- Verification: Browser-Test mit Demo-Tenant (mind. 1 pending Block), 403-Check fuer tenant_admin.
- Dependencies: SLC-041 MT-1 (Tabelle existiert)

#### MT-2: Pro-Tenant `/admin/tenants/[id]/reviews` Page
- Goal: Pro-Tenant-Filter-Page.
- Files: `src/app/admin/tenants/[tenantId]/reviews/page.tsx` (neu), `src/lib/reviews/list-pro-tenant.ts` (neu)
- Expected behavior: Filter auf Tenant via Query-Param, Tabelle ohne Tenant-Spalte, Header mit Tenant-Name.
- Verification: Browser-Test, Direct-URL als strategaize_admin, 403 als tenant_admin.
- Dependencies: MT-1 (List-Helper kann gemeinsam sein)

#### MT-3: Quick-Stats-Badge in TenantsClient
- Goal: Badge-Spalte mit Pending-Count pro Tenant.
- Files: `src/app/admin/tenants/TenantsClient.tsx` (geaendert), `src/app/admin/tenants/page.tsx` (geaendert — Aggregations-Query laden), `src/lib/reviews/pending-counts-by-tenant.ts` (neu)
- Expected behavior: Server-Side Single-Query GROUP BY tenant_id, Map an TenantsClient als Prop, Badge-Render in Tabellen-Spalte.
- Verification: Browser-Test, Counter stimmt mit Cross-Tenant-Page Total-Count.
- Dependencies: SLC-041 MT-1

#### MT-4: Sidebar-Link "Reviews"
- Goal: Sidebar-Link in Admin-Layout fuer strategaize_admin.
- Files: `src/components/admin/AdminSidebar.tsx` (geaendert, Pfad ggf. anpassen — verifiziere via Glob)
- Expected behavior: Link sichtbar nur fuer strategaize_admin, fuehrt zu `/admin/reviews`. Optional Badge mit Total-Count (oder weglassen).
- Verification: Browser-Test in beiden Rollen-Sichten.
- Dependencies: MT-1
