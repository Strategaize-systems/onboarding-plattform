# SLC-190 — Berater-Sicht: /admin gescopt + Mein-Tag can_see_tenant-Scope

- Feature: FEAT-107
- Backlog: BL-535
- Version: V10.4 (Rollenmodell V2 Paket P2)
- Status: planned
- Track: frontend + Query-Layer (Loader-Scoping)
- Branch: `v10-4-rollenmodell-p2` (kumulativ, nach SLC-189)
- Migration: keine

## Goal
`strategaize_berater` betritt `/admin/*` über ein gefiltertes Layout (BeraterSidebar: Mein Tag + zugewiesene Tenants; keine Partner-Verwaltung/Funnel-Analytics/Text-Overrides), und „Mein Tag" zeigt NUR den zugewiesenen Ausschnitt (`berater_assigned_tenant_ids`-Filter auf jedem Loader). Admin unverändert (0 Regression).

## Architektur-Bindung
PRD §V10.4 FEAT-107 · Addendum V.3/V.6 · DEC-269 (Query-Layer-Durchsetzung via service_role + Pflicht-Filter, KEIN Berater-Zweig auf tenant-RLS-Policies in P2). Neue Scope-Entscheidung dieses Slices → **DEC-270** (Berater-Report-Set + Loader-Filter-Injektion).

## Verified-Against-Code-Reality (Gate 1+3, geprüft diese Session)
| Referenz | Status | Befund |
|---|---|---|
| `src/app/admin/layout.tsx:27` `["strategaize_admin","tenant_admin"].includes(role)` | MODIFY | Berater rein → BeraterSidebar-Zweig (nicht TenantAdminShell, nicht Full-Admin) |
| `src/components/admin-sidebar.tsx:9-20` NAV_ITEMS | Reuse-Vorlage | Basis für neue `BeraterSidebar` (Teilmenge) |
| `src/app/admin/mein-tag/page.tsx:30-32` Gate + `:37-40` Tenant-Liste (alle) | MODIFY | Berater erlauben; Tenant-Liste auf assigned scopen |
| `src/app/admin/mein-tag/actions.ts:42-56` `loadWorkspaceReportAction` (assertStrategaizeAdmin) | MODIFY | Berater-Pfad: assertStrategaizeBerater + assigned-tenant-Filter |
| `src/app/admin/mein-tag/rag-action.ts:33-69` `bindTenant`+`askRagAction` (assertStrategaizeAdmin) | MODIFY | Berater: tenant muss in assigned sein (fail-closed) |
| `src/lib/workspace/reports/index.ts:71-91` `loadReport(admin, key)` | MODIFY | +`allowedTenantIds?: string[]` durchreichen |
| `…/reports/mandanten-uebersicht.ts:62-78` (→ `loadCrossTenantCockpit`) | MODIFY | Filter durchreichen |
| `…/reports/{review-queue,wo-stockt-es,activity-timeline}.ts` (`tenants.select().limit(500)` + Daten-Queries ohne tenant-Filter) | MODIFY | `.in("tenant_id", allowedTenantIds)` wenn gesetzt |
| `…/reports/system-status.ts:38-55` (ai_jobs+error_log, **system-weit, kein tenant**) | **EXCLUDE für Berater** | nicht tenant-scopebar → nicht im Berater-Report-Set (DEC-270) |
| `src/lib/cockpit/load-cross-tenant.ts:15-45` `loadCrossTenantCockpit(supabase)` | MODIFY | +optional `allowedTenantIds` → `.in("id", …)` auf `tenants` + tenant-Filter auf Sub-Queries |
| `src/lib/workspace/berater-gate.ts` `assertStrategaizeBerater` | Reuse | aus SLC-188 |
| `berater_assigned_tenant_ids(uid)` RPC | Reuse | aus SLC-188 (rpc-Aufruf im Loader) |

## Schema-Grounding (Gate 2)
- Kein neues Schema. `berater_assigned_tenant_ids(auth.uid())` via `admin.rpc("berater_assigned_tenant_ids", {p_uid})` → `string[]`.
- Filter-Semantik: `allowedTenantIds === undefined` ⇒ Admin-Verhalten (alle Tenants, unverändert). `allowedTenantIds = []` ⇒ Berater ohne Zuweisung ⇒ 0 Zeilen (fail-closed).

## Design-Entscheidung (→ DEC-270)
- **Berater-Report-Set = 4 tenant-scopebare Reports** (Mandanten-Übersicht, Review-Queue, Wo-stockt-es, Activity-Timeline). **System-Status ausgeschlossen** (system-weite ai_jobs/error_log ohne tenant-Spalte → würde cross-tenant-Ops leaken; bleibt admin-only, fail-closed).
- **Durchsetzung = Loader-Param `allowedTenantIds`** (kein session-var/RLS-Hack), spiegelt DEC-269 Query-Layer. Admin ruft ohne Param → 0 Regression (SC-V10.4-5).

## Micro-Tasks

### MT-1: Loader-Scoping (Query-Layer) — additiver Filter-Param
- Goal: Alle Berater-relevanten Loader akzeptieren optionalen `allowedTenantIds`.
- Files: `src/lib/workspace/reports/index.ts` (MODIFY: `loadReport(admin, key, allowedTenantIds?)` + Dispatch nur erlaubte Keys für Berater), `…/reports/mandanten-uebersicht.ts`, `…/reports/review-queue.ts`, `…/reports/wo-stockt-es.ts`, `…/reports/activity-timeline.ts` (MODIFY je +Param + `.in("tenant_id", ids)`/Tenant-Liste-Filter wenn gesetzt), `src/lib/cockpit/load-cross-tenant.ts` (MODIFY: optional `allowedTenantIds`).
- Expected behavior: Param gesetzt → nur diese Tenants + deren Daten; ungesetzt → identisches Admin-Verhalten. `system-status.ts` bleibt unverändert (nicht im Berater-Set).
- Verification: Pure-Mock-Vitest: Loader mit ids → Query-Builder erhält `.in(...)`; ohne ids → keine Filter (Bestands-Tests grün). tsc/eslint 0.
- Test-AC-Klasse: **Pure-Mock-Vitest** (Query-Builder-Assert) + bestehende Loader-Tests als Regression.
- Dependencies: SLC-188 (rpc-Function existiert), keine harte auf 189.

### MT-2: Layout-Gate + BeraterSidebar
- Goal: Berater bekommt gefiltertes /admin-Layout.
- Files: `src/app/admin/layout.tsx` (MODIFY: role=strategaize_berater → render `<BeraterSidebar>`-Shell statt Full-Admin/TenantAdminShell), `src/components/berater-sidebar.tsx` (NEU: NAV = Mein Tag + zugewiesene Tenants [Read-Liste], KEINE Partner/Funnel/Text-Overrides/Templates).
- Expected behavior: Berater `/admin/*` erlaubt (role-check SLC-188), sieht nur BeraterSidebar-Items; Nicht-erlaubte /admin-Unterseiten (partners/text-overrides/…) → 403/redirect (Page-Re-Gates greifen, da diese `assertStrategaizeAdmin`). Landing `/admin/mein-tag`.
- Verification: `next build` PASS; Pure-Mock/Component-Logik-Test (welche NAV-Items bei Rolle). Browser-Smoke = /deploy.
- Dependencies: SLC-188 (UserRole + role-check + Gate).

### MT-3: Mein-Tag Berater-Pfad (Page + Actions + RAG scoped)
- Goal: „Mein Tag" für Berater end-to-end gescopt.
- Files: `src/app/admin/mein-tag/page.tsx` (MODIFY: Gate erlaubt admin ODER berater; Tenant-Liste für Berater = assigned via rpc), `src/app/admin/mein-tag/actions.ts` (MODIFY: `loadWorkspaceReportAction` — bei Berater assertStrategaizeBerater + `allowedTenantIds = berater_assigned_tenant_ids(uid)` an loadReport; Report-Key-Whitelist ohne system-status), `src/app/admin/mein-tag/rag-action.ts` (MODIFY: `bindTenant` prüft für Berater zusätzlich Mitgliedschaft in assigned-ids; sonst no_tenant/unauthorized).
- Expected behavior: Berater sieht in TenantSelector nur zugewiesene Tenants; Reports nur deren Daten; RAG nur für zugewiesenen Mandanten; Admin-Pfad unverändert (assertStrategaizeAdmin → kein allowedTenantIds).
- Verification: Pure-Mock-Vitest: Berater-Gate-Zweig setzt Filter; Admin-Zweig nicht; RAG fremder tenant → fail-closed. tsc/eslint 0.
- Dependencies: MT-1, MT-2, SLC-188 (Gate/rpc).

### MT-4: RLS-/Scoping-Regression + Berater-Sidecar-Test
- Goal: SC-V10.4-2/3/5.
- Files: `src/__tests__/rls/berater-visibility.test.ts` (NEU, DB-Sidecar) + Loader-Scoping-Cases (MT-1).
- Expected behavior (withTestDb + Fixture: 1 Berater, 1 zugewiesene Kanzlei + 1 Mandant via mapping, 1 nicht-zugewiesener Tenant):
  - Loader mit `berater_assigned_tenant_ids`-Filter liefert nur zugewiesene+Cascade; nicht-zugewiesener Tenant = 0 (SC-V10.4-2/3).
  - Admin-Loader (ohne Filter) sieht weiterhin alle (SC-V10.4-3 Admin-Teil, SC-V10.4-5).
  - Bestehende Rollen (tenant_admin/employee/partner_admin) Sichtbarkeit unverändert.
- Verification: Coolify-DB-Vitest grün, Full-Suite Baseline-Delta 0 Regression; `next build` PASS.
- Test-AC-Klasse: **Coolify-DB-Vitest** + **Pure-Mock-Vitest** (Loader) + **Live-Smoke** (deferred /deploy: Berater-Login sieht nur zugewiesen, Admin alle, 0 Console-Errors).
- Dependencies: MT-1..3, SLC-188 (Functions), SLC-189 (Assignments real; Test nutzt Fixtures).

## Cross-Slice-Dependencies
- **blockiert von:** SLC-188 (Functions/Gate/Types/Layout-Vorbereitung), SLC-189 (Assignments-Anlagepfad; für DB-Tests via Fixture entkoppelt).
- **blockiert:** — (letzter V10.4-Slice; danach Gesamt-QA V10.4 → /final-check).
- **Consumed:** `berater_assigned_tenant_ids`/`can_see_tenant`, `assertStrategaizeBerater`, UserRole, alle Mein-Tag-Loader + load-cross-tenant.
- **Produced:** BeraterSidebar, gescopte Loader (`allowedTenantIds`), Berater-Mein-Tag.

## Risiken
- R-190-1: Loader-Filter an EINER Stelle vergessen → cross-tenant-Leak. Mitigation: MT-4 Sidecar-Test pro Loader; DEC-269 „Pflicht-Filter auf JEDEM Berater-Loader-Pfad".
- R-190-2: Admin-Regression durch Param-Refactor. Mitigation: `allowedTenantIds === undefined` = exaktes Alt-Verhalten; Bestands-Loader-Tests bleiben grün (SC-V10.4-5).
- R-190-3: system-status versehentlich im Berater-Set → Ops-Leak. Mitigation: Key-Whitelist in actions.ts (MT-3) + Report-Set-Test.

## Verification Summary (Done-Gate SLC-190)
tsc 0 / eslint 0 / Pure-Mock-Vitest + Coolify-DB-Vitest grün, Baseline-Delta 0 Regression / `next build` PASS. Live-Berater-E2E (nur zugewiesen sichtbar) + Admin-Unverändert-Smoke = /deploy-Phase. Danach **Gesamt-QA V10.4** vor /final-check.
