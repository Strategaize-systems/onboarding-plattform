# FEAT-041 — Partner-Tenant Foundation + RLS Erweiterung

**Version:** V6
**Status:** planned
**Created:** 2026-05-11

## Zweck

Foundation-Slice fuer V6: Tenant-Hierarchie + neue Rolle `partner_admin` + Pen-Test-Suite. Pflicht-Foundation — alle anderen V6-Features bauen darauf auf. Stellt die bombensichere Cross-Partner- und Cross-Client-Isolation sicher, bevor Daten reinkommen.

## Hintergrund

Die Onboarding-Plattform hat heute eine flache Tenant-Struktur (keine parent/child-Beziehung) und vier RLS-Rollen (`strategaize_admin`, `tenant_admin`, `tenant_member`, `employee`). Fuer den Multiplikator-Layer muss eine Eltern/Kind-Beziehung zwischen Partner-Tenant und Client-Tenant entstehen, plus eine neue Rolle `partner_admin`, die ausschliesslich eigene + eigenen Mandanten Daten sieht.

Die RLS-Test-Matrix der V4/V5-Slices (46/48 Faelle, SAVEPOINT-Pattern fuer expected RLS-Rejections) ist das wiederverwendbare Pattern.

## In Scope

- **Schema-Erweiterungen** an bestehender `tenants`-Tabelle:
  - `tenant_kind TEXT NOT NULL DEFAULT 'direct_client'` mit CHECK-Constraint `IN ('direct_client', 'partner_organization', 'partner_client')`
  - `parent_partner_tenant_id UUID NULL REFERENCES tenants(id) ON DELETE RESTRICT`
  - CHECK-Constraint: `parent_partner_tenant_id` darf nur fuer `tenant_kind='partner_client'` gesetzt sein
  - Daten-Migration: alle Bestands-Tenants bekommen `tenant_kind='direct_client'`, `parent_partner_tenant_id=NULL`
- **Neue Rolle `partner_admin`** in der Rollen-Enum + RLS-Policies:
  - SELECT auf eigene `partner_organization`-Daten + eigene Client-Tenants + deren `capture_session`/`knowledge_unit`/`validation_layer`/`block_checkpoint`/`partner_client_mapping`/`lead_push_consent`/`lead_push_audit`
  - INSERT/UPDATE auf eigene `partner_branding_config` + Mandanten-Einladungen
  - **KEIN SELECT** auf fremde Partner-Tenants oder deren Mandanten
- **Defense-in-Depth-Pattern** wie in V4/V5: jede Policy prueft Tenant-Bindung AND Rollen-Bindung explizit
- **Pen-Test-Suite** mit 5-Rollen-Matrix (`strategaize_admin`, `tenant_admin`, `tenant_member`, `employee`, `partner_admin`) gegen alle V6-Tabellen + regression-Tests gegen bestehende Knowledge-Schema-Tabellen
  - Test-Pattern aus `v5-walkthrough-rls.test.ts` wiederverwenden (SAVEPOINT)
  - Pflicht-Faelle: Cross-Partner-Isolation (Partner A sieht Partner B nicht), Cross-Client-Isolation (Mandant von Partner A sieht Mandant von Partner B nicht), Tenant-Admin-Regression (bestehender Direkt-Kunde sieht weiterhin nur sich)
- **Migration MIG-034** mit den Schema-Erweiterungen + RLS-Policy-Updates, live-appliziert via SQL-Migration-Hetzner-Procedure

## Out of Scope

- `partner_organization`-Tabelle (FEAT-042)
- `partner_client_mapping`-Tabelle (FEAT-043)
- `partner_branding_config`-Tabelle (FEAT-044)
- `lead_push_consent` / `lead_push_audit`-Tabellen (FEAT-046)
- Partner-Admin-Dashboard-UI (FEAT-042)
- Tenant-spezifische Backup/Restore-Faehigkeit (V7+ — Tenant-Restore-Limit fuer V6 bewusst akzeptiert, DEC im /architecture V6)
- Weitere Rollen wie `partner_employee` (V7+) oder `m_and_a_advisor` (V8+)

## Akzeptanzkriterien

- Migration MIG-034 idempotent applizierbar gegen Coolify-DB
- Alle Bestands-Tenants nach Migration: `tenant_kind='direct_client'`, `parent_partner_tenant_id=NULL` — keine Daten-Loesch- oder Aenderungseffekte auf bestehende Kunden
- Neue Rolle `partner_admin` in der Datenbank vorhanden + via JWT-Claim setzbar
- RLS-Policies fuer alle relevanten Tabellen aktualisiert + Defense-in-Depth-konform (Rollen-AND-Tenant-Pruefung)
- Pen-Test-Suite gegen Coolify-DB im node:20-Container PASS — mindestens 5 Rollen × 4 relevante Tabellen × 4 Operationen (SELECT/INSERT/UPDATE/DELETE) = mindestens 80 Faelle, davon mind. 16 explizite Cross-Partner-Isolation-Faelle
- TypeScript-Types fuer `tenant_kind` und `parent_partner_tenant_id` aktualisiert (`src/types/db.ts`)
- Bestehende V5.1-RLS-Matrix (48 Faelle) regression-frei

## Abhaengigkeiten

- Keine harten V6-Abhaengigkeiten (Foundation-Slice)
- Reuse: bestehendes RLS-Pattern + SAVEPOINT-Test-Pattern aus V4/V5
- Reuse: bestehende Migration-Procedure (sql-migration-hetzner.md Rule)

## Verweise

- RPT-209 V6 Requirements
- RPT-208 V6 Discovery — Sektion 4.2 Tenant-Hierarchie-Empfehlung
- STRATEGY_NOTES_2026-05.md Abschnitt 7 — 3 Schutzschichten, Slice-Skizze SLC-080
- MULTIPLIER_MODEL.md Achse 2 — T2 Lead-Qualifikation als Pflicht-Tiefe (Mandant-Daten-Isolation kritisch)
- Pattern-Reuse: `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (48-Faelle-Matrix mit SAVEPOINT)
