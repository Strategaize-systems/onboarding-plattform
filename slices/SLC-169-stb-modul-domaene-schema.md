# SLC-169 — StB Modul-Domaene-Schema (MIG-124)

- Version: V10
- Feature: FEAT-091 (Schema-Teil)
- Backlog: BL-510
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: A (Foundation) — MIG-124, disjunkt zu SLC-170 (MIG-125) + SLC-171 (keine MIG)
- MIG reserviert: **124** (`sql/migrations/124_v10_stb_modul_domain.sql`)
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc169-modul-schema`, Merge nach /qa-PASS

## Ziel
Die einzige neue Kern-Tabelle der V10-Lieferdomaene live-bereit machen: `modul_output` (Output-Triple + KI-Hebel mit Reifegrad), plus die Enqueue-RPC und das Tier-/CHECK-Mapping fuer den neuen `job_type module_output_synthesis`. Additiv, 0 Aenderung an bestehenden OP-Funktionen (SC-7). Fundament fuer SLC-174 (Worker) + SLC-175 (Reader).

## Architektur-Anker
- DEC-233: dedizierte `modul_output`-Tabelle (nicht `knowledge_unit`-JSON) — Reader braucht queryable Struktur, DATEV-Import-Flaeche, `knowledge_unit`-Semantik bleibt intakt.
- DEC-235: neuer `job_type = module_output_synthesis`, tier-gated, EU-Region, Cost-Cap.
- DEC-239: Job-Typ tier-gated (`fn_min_tier_for_job` → `blueprint`-Tier).
- ARCHITECTURE §4 (modul_output-DDL) + §9 (Migrations-Skizze). Naechste freie SQL-Datei = 124.

## Akzeptanzkriterien
- **AC-169-1:** `CREATE TABLE modul_output` exakt nach §4-DDL (PK, `tenant_id`/`capture_session_id`/`block_checkpoint_id` FKs, `modul_key`, `output_kind` CHECK 4 Werte, `title`, `body`, `reifegrad` smallint CHECK 1-4, `evidence_refs` jsonb, `source`/`status` CHECK, `ai_job_id`, Timestamps, `updated_by`) + Indizes `(tenant_id)`/`(capture_session_id)`/`(modul_key)`. Idempotent (`IF NOT EXISTS`).
- **AC-169-2:** RLS aktiv, Zwei-Teil-USING `tenant_id = auth.user_tenant_id()` + Rollen-Check; `ai_draft`-INSERT/UPDATE nur `service_role`; Edit/Status-UPDATE `tenant_admin` des Tenants. GRANTs `authenticated`/`service_role`. DB-Sidecar-Pen-Test: Fremd-Tenant SELECT/UPDATE denied (SAVEPOINT-Pattern).
- **AC-169-3:** `rpc_enqueue_module_output(p_capture_session_id, p_modul_key)` — tier-gated (`fn_min_tier_for_job('module_output_synthesis')`), INSERT in `ai_jobs(job_type='module_output_synthesis', status='queued', payload)`, Ownership-Pre-Check, idempotenter Re-Enqueue-Schutz. Pattern aus `rpc_create_block_checkpoint`/`rpc_enqueue_*`.
- **AC-169-4:** `module_output_synthesis` in `fn_min_tier_for_job` gemappt (→ `blueprint`) **und** `ai_jobs.job_type`-CHECK + `ai_cost_ledger.role`-CHECK je um die neuen Werte erweitert. **Live-Stand der Constraints vorab via `pg_get_constraintdef` verifizieren** (IMP-1228-Disziplin: Constraint-Name + bestehende Werte exakt lesen vor DROP/ADD).
- **AC-169-5:** `NOTIFY pgrst, 'reload schema'` am Migrations-Ende (PostgREST sieht neue Tabelle/RPC sofort).
- **AC-169-6:** `tsc` 0, `eslint` 0, `next build` PASS; DB-Sidecar-Tests GREEN (Tabelle/Index/RLS/RPC/CHECK).

## Micro-Tasks

### MT-1: MIG-124 modul_output-Tabelle + RLS + Indizes + DB-Test
- Goal: queryable, tenant-isolierte Deliverable-Tabelle live-bereit.
- Files: `sql/migrations/124_v10_stb_modul_domain.sql` (neu, Teil 1), `src/lib/db/__tests__/migration-124-modul-output.test.ts` (neu, node:20-Sidecar gegen Coolify-DB per `coolify-test-setup.md`, SAVEPOINT fuer erwartete RLS-Rejections).
- Expected behavior: Tabelle + 3 Indizes + RLS-Policies (Zwei-Teil-USING, ai_draft=service_role, Edit=tenant_admin) + GRANTs. Idempotent.
- Verification: `\d modul_output` zeigt Spalten/CHECKs/Indizes; Pen-Test Fremd-Tenant SELECT/UPDATE → `row-level security`; 2. Apply 0 Drift.
- Dependencies: none.

### MT-2: MIG-124 RPC + Tier-Mapping + CHECK-Erweiterung + NOTIFY + DB-Test
- Goal: tier-gated Enqueue-Pfad + Job-Typ DB-seitig akzeptiert.
- Files: `sql/migrations/124_v10_stb_modul_domain.sql` (Teil 2, gleiche Datei), `src/lib/db/__tests__/migration-124-enqueue-rpc.test.ts` (neu).
- Expected behavior: `rpc_enqueue_module_output` legt `ai_jobs`-Row an (tier-gated, Ownership-Check); `fn_min_tier_for_job('module_output_synthesis')` → `blueprint`; CHECK-Constraints akzeptieren `module_output_synthesis`. `NOTIFY pgrst`.
- Verification: RPC mit gueltigem Tier → ai_jobs-Row; mit zu niedrigem Tier → tier-Reject; `INSERT ai_jobs(job_type='module_output_synthesis')` akzeptiert; `pg_get_constraintdef`-Vorab-Check dokumentiert.
- Dependencies: MT-1 (Tabelle existiert, falls RPC referenziert).

## Risiken & Dependencies
- **R-169-1 (Constraint-Drift, BLOCKING):** `ai_jobs.job_type`/`ai_cost_ledger.role`-CHECK live exakt lesen (`pg_get_constraintdef`) bevor DROP/ADD — sonst werden Bestandswerte beim Re-Create verloren (IMP-1228). Mitigation: Vorab-Inspektion als MT-2-Pflichtschritt.
- **R-169-2 (Live-Apply-Ordering):** SLC-174-Worker schreibt `modul_output` → Tabelle muss VOR Worker-Code live sein. Mitigation: MIG-124 Live-Apply im /deploy vor Code-Redeploy (`sql-migration-hetzner.md`).
- **Dependency:** keine. Blockt SLC-174 (Tabelle+RPC) + SLC-175 (Tabelle).

## Out of Scope
Template-Seeds (= SLC-170, separate MIG-125); Worker-Logik (SLC-174); Reader (SLC-175); DATEV-Import-Tabelle (V11+, nur `capture_session.metadata.imported_dataset_ref`-Merker, kein DDL).
