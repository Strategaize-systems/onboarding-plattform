# SLC-136 — FEAT-055 Inline-Text-Override-Foundation

**Feature:** FEAT-055
**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~12-18h Code-Side + Pen-Test
**Pre-Conditions:** Keine (Foundation-Slice)
**Worktree:** `slc-136-text-override-foundation` (Pflicht, SaaS-Mode)

## Zweck

Generische `text_override` + `text_override_history` Tabellen + Resolver-Lib + Save/Reset-Server-Actions + Admin-Override-Liste-Page + Pen-Test-Suite-Erweiterung. Foundation-Slice fuer alle weiteren V7.1-Slices.

## Pre-Migration-Check (Pflicht VOR MT-1)

VOR Migration 101 Apply muessen folgende DB-Objekte existieren (V6 Migration 090):
- Function `is_strategaize_admin(uuid) -> boolean`
- View `partner_admin_view (user_id uuid, partner_org_id uuid)`
- View `tenant_to_partner_view (tenant_id uuid, partner_org_id uuid)`
- Function `current_tenant_id() -> uuid`

Falls eine davon fehlt: Pre-Migration in Migration 101 nachziehen oder als ISSUE eskalieren.

## In Scope

Siehe FEAT-055 In-Scope vollstaendig. Konkret:
- Migration 101 mit text_override + text_override_history
- Resolver-Lib + Cache-Map
- Save/Reset-Server-Actions mit History-Audit
- Admin-Liste-Page + History-Sub-Page
- RLS-Pen-Test (4 Cases)

## Out of Scope

- EditableText-Komponente (SLC-137)
- Text-Migration der Hardcodes (SLC-137)
- Helper-Texts Schema (SLC-138)
- Telemetrie-Tabelle (SLC-139)

## Micro-Tasks

### MT-1: Migration 101 text_override + text_override_history Tabellen
- Goal: Beide Tabellen + Constraints + Indizes + RLS-Policies + GRANTs idempotent appliziert auf Coolify-DB.
- Files: `sql/migrations/101_v71_text_override_foundation.sql`, `docs/MIGRATIONS.md` (MIG-044 Status `live` setzen nach Apply).
- Expected behavior: Apply via `docker exec ... psql -U postgres -d postgres < /tmp/101.sql` durch (Pattern aus `sql-migration-hetzner.md`-Rule). NOTIFY pgrst 'reload schema' Pflicht. Re-Apply (idempotent) wirft keinen Fehler.
- Verification: `\d text_override` zeigt alle Spalten + Constraints. `\d text_override_history` zeigt alle Spalten. SELECT auf beide Tabellen liefert 0 Rows (leer). `\dp text_override` zeigt RLS aktiviert. `\df is_strategaize_admin` Pre-Check.
- Dependencies: Pre-Migration-Check (Helper-Functions existent).

### MT-2: Resolver-Lib loadOverrides + resolveText + Cache
- Goal: TypeScript-Library liest alle relevanten Overrides in einem Query, mergt nach Scope-Reihenfolge partner > template > global, bietet O(1)-Lookup mit 60s-TTL-Cache.
- Files: `src/lib/text-override/resolver.ts`, `src/lib/text-override/__tests__/resolver.test.ts`.
- Expected behavior: `loadOverrides(partnerOrgId, locale)` returnt Map. `resolveText(map, key, default)` returnt Map.get(key) ?? default. Cache invalidiert nach 60s oder via `invalidateCache(cacheKey)`-Helper.
- Verification: Vitest mit 6+ Cases (global-only, template-only, partner-only, partner > template > global Reihenfolge, missing-key returns default, Cache-Hit innerhalb 60s).
- Dependencies: MT-1.

### MT-3: Save/Reset-Server-Actions mit History-Audit
- Goal: `saveTextOverride(scope, scopeId, textKey, newValue, locale)` + `resetTextOverride(scope, scopeId, textKey, locale)` Server-Actions. Beide schreiben History-Eintrag mit action='create'|'update'|'delete'.
- Files: `src/lib/text-override/actions.ts`, `src/lib/text-override/__tests__/actions.test.ts`.
- Expected behavior: saveTextOverride macht UPSERT in text_override + INSERT in text_override_history mit old_value+new_value. resetTextOverride macht DELETE + History-INSERT mit action='delete'. Beide rufen revalidatePath() + Cache-Invalidate.
- Verification: Vitest mit 8+ Cases: erstmaliges Save = create, zweites Save auf gleichen Key = update mit old_value, Reset auf existierende Row = delete, Reset auf non-existing = no-op. RLS-Pflicht im Action via supabase-server-client.
- Dependencies: MT-1, MT-2.

### MT-4: Admin-Page /admin/text-overrides + History-Sub-Page
- Goal: Server-Component-Liste aller Overrides mit Filter (scope, partner_org, text_key-Praefix, locale). History-Sub-Page zeigt Audit-Trail pro Override.
- Files: `src/app/admin/text-overrides/page.tsx`, `src/app/admin/text-overrides/[id]/history/page.tsx`, `src/app/admin/text-overrides/components/OverrideRow.tsx`.
- Expected behavior: Liste rendert pro Override-Row: scope/scope_id/text_key/locale/text_value/updated_at + "Auf Standard zuruecksetzen"-Button + History-Link. Filter via Search-Params. RLS-konform (partner_admin sieht nur eigene + global + template).
- Verification: Manueller Smoke als strategaize_admin (sieht alle) + partner_admin (sieht nur eigene + global/template). Reset-Button entfernt Row.
- Dependencies: MT-3.

### MT-5: RLS-Pen-Test-Erweiterung text_override
- Goal: Neue Pen-Test-Cases verifizieren RLS: partner_admin Partner A darf NICHT Override fuer Partner B anlegen/editieren/loeschen. tenant_admin + tenant_member duerfen NICHT schreiben. tenant_member darf nur global + template + own-partner lesen.
- Files: `__tests__/pen-test/text-override-pen-test.test.ts`.
- Expected behavior: 8+ Pen-Test-Cases gegen Coolify-DB im node:20-Container (SAVEPOINT-Pattern fuer expected-Rejections, siehe `coolify-test-setup.md`-Rule).
- Verification: Vitest 8+ Cases alle PASS. Insbesondere: partner_admin Partner A INSERT scope='partner', scope_id=Partner-B-UUID -> RLS-Reject.
- Dependencies: MT-3, MT-4.

### MT-6: Records-Update + Slice-Schluss-Doku
- Goal: Alle Cockpit-Records auf SLC-136-Status `done` + MIG-044 auf `live`.
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-118 -> done), `features/INDEX.md` (FEAT-055 -> in_progress oder done), `docs/STATE.md`, `docs/MIGRATIONS.md` (MIG-044 Status), `docs/KNOWN_ISSUES.md` (falls Findings).
- Expected behavior: Records sind konsistent + RPT-XXX als Completion-Report angelegt.
- Verification: Cockpit-Refresh zeigt SLC-136 done + BL-118 done + FEAT-055 in_progress.
- Dependencies: MT-1..5.

## Acceptance Criteria

Siehe FEAT-055 AC-1..10. Plus:
- AC-SLC-136-1: Migration 101 LIVE auf Coolify-DB.
- AC-SLC-136-2: 8+ Pen-Test-Cases PASS.
- AC-SLC-136-3: Admin-Liste-Page rendert mit korrekter RLS-Sicht pro Rolle.

## Risiken

- Pre-Migration-Helper-Function-Check schlaegt fehl -> Migration-Erweiterung noetig (out-of-Scope SLC-136, dann Ad-hoc-Add).
- supabase-js Type-Inference bei generischer text_override-Tabelle -> Branded-Type-Pattern aus V6 nutzen.
- Cache-TTL 60s + revalidatePath-Sync-Issue -> SLC-137-EditableText testet das End-to-End.
