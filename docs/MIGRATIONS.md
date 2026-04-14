# Migrations

Die aktuelle DB-Struktur entspricht dem Stand von Blueprint V3.4 (Migration 020). Fuer die Onboarding-Plattform beginnt die eigene Migrations-Historie ab Migration 021.

Der uebernommene Blueprint-Stand ist noch nicht auf einer Onboarding-Plattform-Instanz ausgefuehrt worden — die erste Hetzner-Migration geschieht mit SLC-001 (Schema-Fundament).

### MIG-001 — Geplante Baseline-Migrationen fuer V1
- Date: 2026-04-14
- Scope:
  - `021_role_rename_tenant_admin.sql` — Umbenennung `tenant_owner` → `tenant_admin` in Auth-User-Metadata + `auth.user_role()` + bestehenden RLS-Policies des Blueprint-Kerns
  - `022_knowledge_schema.sql` — neue Tabellen `template`, `capture_session`, `block_checkpoint`, `knowledge_unit`, `validation_layer` inkl. RLS-Policies und Tenant-Helper-Bindung
  - `023_ai_jobs_condensation.sql` — neuer `job_type = 'knowledge_unit_condensation'` in der bestehenden `ai_jobs`-Tabelle, zusaetzlicher Index, keine Tabellen-Neuanlage
  - `024_rpc_bulk_import_knowledge_units.sql` — portierter Bulk-Import-RPC aus OS-Migration 050, umgebaut auf `knowledge_unit` + `validation_layer`-Audit-Write
  - `025_seed_exit_readiness_template.sql` — Content-Seed fuer das erste Template (Exit-Readiness), portiert aus Blueprint V3.4
- Reason: V1 braucht ein generisches, template-ready Knowledge-Schema (DEC-003) und portiert OS-Ebene-1 (DEC-005). Rollen-Namen werden gleichzeitig auf den kanonischen Stand gebracht (DEC-010).
- Affected Areas: Auth, Core-DB-Schema, RLS-Policies, AI-Queue, Seed-Daten
- Risk: Die Role-Rename-Migration (021) beruehrt bestehende Auth-User und koennte Login-Sessions invalidieren, falls existierende Blueprint-User auf die Plattform uebertragen werden. Da V1 frisch aufgesetzt wird (keine Echt-User aus Blueprint uebernommen), ist das Risiko de-facto klein.
- Rollback Notes: Alle 5 Migrations sind idempotent oder reversibel (DROP TABLE IF EXISTS fuer 022–025, umgekehrter UPDATE fuer 021). Rollback-Skripte werden zusammen mit den Forward-Migrationen in SLC-001 / SLC-002 committet.
- Note: Die tatsaechliche Migrations-Reihenfolge weicht von der geplanten Baseline ab. Siehe MIG-002 fuer den umgesetzten Stand aus SLC-001.

### MIG-002 — SLC-001 Schema-Fundament (umgesetzt)
- Date: 2026-04-14
- Scope:
  - `021_core_capture_schema.sql` — 5 neue Tabellen `template`, `capture_session`, `block_checkpoint`, `knowledge_unit`, `validation_layer` inkl. FKs auf `tenants`/`auth.users`, CHECK-Constraints fuer Enum-Felder (status, checkpoint_type, unit_type, source, confidence, action), `updated_at`-Trigger, RLS enable, Table-GRANTs fuer `authenticated` + `service_role`.
  - `022_core_capture_rls.sql` — RLS-Policies nach Muster `{table}_admin_full` (strategaize_admin Cross-Tenant) + `{table}_tenant_read` + `{table}_tenant_admin_write`. `tenant_admin` UND `tenant_owner` werden beide zugelassen bis SLC-002 die Rolle bereinigt.
  - `023_core_capture_indexes.sql` — Tenant-Filter-Indizes auf allen 4 tenant-scoped Tabellen, FK-Join-Indizes (capture_session_id, block_checkpoint_id, knowledge_unit_id) und Composite-Index `(capture_session_id, block_key, created_at DESC)` fuer Status-Ableitung pro Block.
- Reason: Ausfuehrung von SLC-001 MT-1..MT-3. Fundament fuer alle folgenden Slices.
- Affected Areas: Core-DB-Schema (5 neue Tabellen), RLS-Policies, Indizes, Table-Grants, updated_at-Trigger (neue Helper-Funktion `_set_updated_at()`).
- Risk: Gering — reine Additions, keine DROP/ALTER auf bestehende Blueprint-Tabellen. `_set_updated_at()` ist `CREATE OR REPLACE` und beruehrt keine bestehenden Trigger.
- Rollback Notes: `DROP TABLE IF EXISTS validation_layer, knowledge_unit, block_checkpoint, capture_session, template CASCADE;` entfernt saemtliche Artefakte. RLS-Policies und Indizes droppen automatisch mit den Tabellen. `DROP FUNCTION IF EXISTS _set_updated_at() CASCADE;` entfernt die Hilfsfunktion.
