# SLC-188 — strategaize_berater Foundation (MIG-132 + Helper + Gate + Types)

- Feature: FEAT-105
- Backlog: BL-530
- Version: V10.4 (Rollenmodell V2 Paket P2)
- Status: planned
- Track: backend-heavy (+ TS types/gate)
- Branch: `v10-4-rollenmodell-p2` (Worktree `<repo>.worktrees/v10-4`, kumulativ)
- Reserviert: MIG-132 (Migration-File `132_*.sql`, Live-Apply erst im /deploy)

## Goal
Fundament der 5. Rolle `strategaize_berater`: Zuweisungs-Persistenz + zwei SECURITY-DEFINER-Helper (Cascade-Auflösung), role-CHECK-Erweiterung, `handle_new_user`-Neufassung (cross-tenant ohne tenant_id) und die TS-Seite (UserRole + role-check + `assertStrategaizeBerater`). Keine UI, keine Berater-Anlage (SLC-189), keine gescopte Sicht (SLC-190).

## Architektur-Bindung
PRD §V10.4 · ARCHITECTURE Addendum V (V.3/V.4/V.5) · DEC-267 (Tabelle) · DEC-268 (Cascade via `partner_client_mapping`) · DEC-269 (`can_see_tenant` als SQL-Function). BS-Port-Vorlage: `sql/migrations/035_v7_rls_switch.sql:54-72` (`can_see_owner`), `cockpit/src/lib/auth/invite.ts:32-101`.

## Verified-Against-Code-Reality (Grounding-Gate 1+3, geprüft diese Session)
| Referenz | Status | Befund |
|---|---|---|
| `sql/functions.sql:10-28` `auth.user_role()`/`auth.user_tenant_id()` | MODIFY-Basis (reuse) | existiert, 1:1 reusable |
| `sql/functions.sql:39-76` `handle_new_user()` | **STALE — nicht als Quelle nutzen** | Datei-Def valid-Rollen = `('strategaize_admin','tenant_admin','tenant_member','employee')` (Zeile 55) ≠ **Live** (post-MIG-131) = `('strategaize_admin','tenant_admin','employee','partner_admin')`. MIG-132 baut aus **Live-prosrc** (`pg_proc`), NICHT aus dieser Datei. |
| `sql/functions.sql:78-80` `on_auth_user_created` Trigger | verify im Slice | Trigger-Bindung in Datei vorhanden; Live-Existenz = MT-1 (R-ARCH-V-2) |
| `src/types/db.ts:16-20` `UserRole` | MODIFY | Union aktuell 4 Werte (kein tenant_member) — konsistent mit Live |
| `src/lib/auth/role-check.ts:52-86` `isPathAllowedForRole` + `defaultLandingForRole:93` | MODIFY | admin-PathClass Zeile 63-67; Landing Zeile 93-106 |
| `src/lib/workspace/admin-gate.ts:20-36` `assertStrategaizeAdmin` | Reuse-Vorlage | 1:1 Muster für neuen `assertStrategaizeBerater` |
| `berater_tenant_assignments` / `strategaize_berater` / `can_see_tenant` / `assertStrategaizeBerater` | NEU | Repo-weit (src+sql) 0 Treffer → keine Kollision |
| `partner_client_mapping(partner_tenant_id, client_tenant_id, invitation_status)` | Schema-Grounding | live bestätigt (Addendum V.2); Cascade-Basis |
| `sql/migrations/` Tail | Nummer frei | höchste Datei `131_v103_role_cleanup.sql` → `132_*` frei |

## Schema-Grounding (Gate 2)
- **role-CHECK** live = 4 Werte (`pg_get_constraintdef`, Addendum V.2). MIG-132 → 5 (add `strategaize_berater`). ALTER TABLE ... DROP CONSTRAINT + ADD CONSTRAINT aus dem Live-CHECK-Stand abgeleitet (nicht aus schema.sql).
- **`handle_new_user` live prosrc**: valid = 4 Werte; tenant_id-Pflicht-Zweig = `('tenant_admin','employee','partner_admin')` (strategaize_admin ausgenommen). MIG-132: `strategaize_berater` in valid **und** in den nicht-Pflicht-Zweig (wie strategaize_admin).
- Alle CREATE OR REPLACE gegen **Live-Stand** (Pre-Apply-Live-Audit, sql-migration-hetzner Check 4, MIG-131-Muster).

## Micro-Tasks

### MT-1: DB-Sidecar-Spike Cascade-Quelle (R-ARCH-V-1) + Trigger-Check (R-ARCH-V-2) — read-only
- Goal: Empirisch klären, welche Quelle die vollständige Mandanten-Menge einer Kanzlei liefert: `partner_client_mapping(invitation_status='accepted')` allein vs. zusätzlich `tenants.parent_partner_tenant_id`. Ergebnis fixiert die Function-Definition in MT-2.
- Files: `sql/spikes/slc188_cascade_probe.sql` (NEU, read-only Probe-Queries; nicht deployt) — ODER Ergebnis direkt im Report, wenn kein File nötig.
- Expected behavior: Gegen Live-DB (`supabase-db-…-162242937585`) beide Quellen für existierende partner_organization-Tenants zählen/vergleichen; feststellen ob Divergenz. Zusätzlich `SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass` → `on_auth_user_created` live vorhanden.
- Verification: Report notiert gewählte Cascade-Quelle + Begründung; Trigger live bestätigt. **Read-only, keine Mutation, NIE Bestands-User anlegen.**
- Dependencies: none. **Blockiert MT-2** (Function-Def hängt am Spike-Ergebnis).

### MT-2: MIG-132 SQL (Tabelle + RLS + CHECK + handle_new_user + 2 Functions)
- Goal: Additive Migration, ein Rollback-Punkt.
- Files: `sql/migrations/132_v104_berater_foundation.sql` (NEU)
- Expected behavior (Reihenfolge = Build-Stabilität):
  1. `CREATE TABLE berater_tenant_assignments (berater_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, assigned_by uuid REFERENCES profiles(id), assigned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (berater_user_id, tenant_id));` + `CREATE INDEX ON berater_tenant_assignments(tenant_id);`
  2. `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon` + Policies: `admin_all` (`auth.user_role()='strategaize_admin'` ALL), `berater_select_own` (`auth.user_role()='strategaize_berater' AND berater_user_id = auth.uid()` SELECT).
  3. `ALTER TABLE profiles DROP CONSTRAINT <role_check> ; ADD CONSTRAINT ... CHECK (role IN ('strategaize_admin','tenant_admin','employee','partner_admin','strategaize_berater'))` (aus Live-CHECK-Def).
  4. `CREATE OR REPLACE FUNCTION handle_new_user()` — **aus Live-prosrc** kopiert (partner_admin erhalten!), `strategaize_berater` in valid-Liste + in den tenant_id-NICHT-Pflicht-Zweig.
  5. `CREATE FUNCTION berater_assigned_tenant_ids(p_uid uuid) RETURNS uuid[] SECURITY DEFINER SET search_path=public` — zugewiesene tenant_ids ∪ Cascade-Mandanten (Quelle laut MT-1; Default `partner_client_mapping` accepted).
  6. `CREATE FUNCTION can_see_tenant(p_tenant uuid) RETURNS boolean SECURITY DEFINER SET search_path=public` = `auth.user_role()='strategaize_admin' OR p_tenant = ANY(berater_assigned_tenant_ids(auth.uid()))`.
- Files-Klassifikation: NEU (SQL). **Live-Apply NICHT hier** (= /deploy, Pre-Apply-Live-Audit + Rollback-Dump `/root/mig132_rollback/`).
- Verification: Datei gegen Test-DB appliziert (coolify-test-setup) für MT-3; idempotenz-freundlich (CREATE OR REPLACE / IF NOT EXISTS wo sinnvoll). `pg_get_constraintdef` = 5 Werte.
- Dependencies: MT-1.

### MT-3: DB-Sidecar-Tests (Coolify-DB, RLS + Functions + handle_new_user)
- Goal: SC-V10.4-1/2/5 auf DB-Ebene absichern (TDD, SaaS-Pflicht).
- Files: `src/__tests__/rls/berater-foundation-rls.test.ts` (NEU)
- Expected behavior (withTestDb + withJwtContext + expectRlsReject, Muster `src/__tests__/rls/v4-perimeter-matrix.test.ts` + `block-review-rls.test.ts`):
  - `berater_tenant_assignments`: admin INSERT/DELETE ok; berater SELECT nur eigene Zeilen; berater INSERT/UPDATE → RLS-reject; fremder Berater sieht 0.
  - `berater_assigned_tenant_ids(uid)`: zugewiesene Kanzlei + deren Mandanten (Cascade) enthalten; nicht-zugewiesener Tenant NICHT.
  - `can_see_tenant`: admin→true für alle; berater→true nur assigned∪cascade, sonst false.
  - `handle_new_user`: Insert auth.users mit role=strategaize_berater OHNE tenant_id → Profile angelegt (kein P0422); mit tenant_admin OHNE tenant_id → weiterhin P0422 (Regression); partner_admin-Pfad unverändert.
  - Regression: tenant_admin/employee/partner_admin Sichtbarkeit unverändert (Baseline-Delta 0).
- Verification: `npm run test` (Coolify-DB-Suite, node:22-Sidecar) — neue Cases grün, Full-Suite env-Baseline-Delta 0 Regression.
- Test-AC-Klasse: **Coolify-DB-Vitest** (Server, TEST_DATABASE_URL; NICHT lokal ohne DB).
- Dependencies: MT-2 (Schema in Test-DB).

### MT-4: TS-Types + Gate + role-check
- Goal: Rolle client-/server-seitig bekannt machen; Server-Gate für Berater-Entry-Points.
- Files: `src/types/db.ts` (MODIFY: `UserRole` += `"strategaize_berater"`), `src/lib/auth/role-check.ts` (MODIFY: admin-PathClass erlaubt zusätzlich `strategaize_berater`; `defaultLandingForRole` += `case "strategaize_berater": return "/admin/mein-tag"`), `src/lib/workspace/berater-gate.ts` (NEU: `assertStrategaizeBerater(): Promise<User|null>` analog admin-gate.ts, prüft `role === "strategaize_berater"`), `src/lib/auth/role-check.test.ts` (MODIFY/NEU: berater-Cases).
- **Hinweis (Wiring):** `role-check.ts` ist der GETESTETE SPIEGEL — die reale Laufzeit-Enforcement liegt in `src/lib/supabase/middleware.ts` (nicht importiert role-check.ts). Die Middleware-Änderung (Login-Redirect Berater) ist SLC-190 MT-2. Docstring-Regel: beide Schichten konsistent halten.
- Expected behavior: `assertStrategaizeBerater` liefert User nur bei exakter Rolle, sonst null; role-check-Mirror kennt Berater (PathClass admin + Landing `/admin/mein-tag`) für Test-Parität.
- Verification: `npx tsc --noEmit` 0, `npm run lint` 0, Pure-Mock-Vitest role-check + Gate grün.
- Test-AC-Klasse: **Pure-Mock-Vitest** (lokal, gemockter supabase-Client).
- Dependencies: keine harte (kann parallel zu MT-2/3 laufen, aber selber Branch → nach MT-3 committen).

## Cross-Slice-Dependencies
- **blockiert von:** — (erster V10.4-Slice).
- **blockiert:** SLC-189 (braucht role-CHECK, handle_new_user-berater-Zweig, `berater_tenant_assignments`), SLC-190 (braucht `berater_assigned_tenant_ids`/`can_see_tenant`, `assertStrategaizeBerater`, UserRole, Layout-Gate-Vorbereitung).
- **Produced (für spätere Slices):** Tabelle + 2 Functions + Gate + Types.
- **MIG-Reservation:** MIG-132 (nur dieser Slice führt eine Migration).
- **Schema-Pre-Cond für SLC-190-Tests:** Assignments-Daten kommen real erst über SLC-189-Admin-Pfad; SLC-190-DB-Tests seeden Assignments direkt (Fixture).

## Risiken
- R-188-1: `handle_new_user` versehentlich aus stale `functions.sql` gebaut → partner_admin bricht. Mitigation: MT-2 zwingt Live-prosrc-Kopie; MT-3 partner_admin-Regressionstest.
- R-188-2: Cascade-Quelle falsch (nur mapping, aber `parent_partner_tenant_id` hätte zusätzliche Mandanten) → Berater sieht zu wenig/zu viel. Mitigation: MT-1-Spike gegen Live vor Function-Lock.

## Verification Summary (Done-Gate SLC-188)
tsc 0 / eslint 0 / Pure-Mock-Vitest (MT-4) grün / Coolify-DB-Vitest (MT-3) grün, Baseline-Delta 0 Regression / `next build` PASS (Dummy-.env.local, ISSUE-114-Workaround, worktree-setup P3). MIG-132 NICHT prod-appliziert (= /deploy).
