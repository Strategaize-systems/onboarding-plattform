# Migrations

Die aktuelle DB-Struktur entspricht dem Stand von Blueprint V3.4 (Migration 020). Fuer die Onboarding-Plattform beginnt die eigene Migrations-Historie ab Migration 021.

Der uebernommene Blueprint-Stand ist noch nicht auf einer Onboarding-Plattform-Instanz ausgefuehrt worden — die erste Hetzner-Migration geschieht mit SLC-001 (Schema-Fundament).

### MIG-123 — V9.8 FEAT-089 knowledge_unit.themes Tag-Export-Spalte (Migration 123, LIVE-applied 2026-06-20)
- Date: 2026-06-19 (Datei geschrieben /backend SLC-V9.8-A) / **LIVE-applied 2026-06-20 im /deploy V9.8** (base64+psql -U postgres auf `supabase-db-bwkg80w04wgccos48gcws8cs-083208599632`, BEGIN/ALTER/CREATE INDEX/NOTIFY/COMMIT; verifiziert: themes ARRAY NOT NULL DEFAULT '{}', GIN idx_knowledge_unit_themes, Containment-Query laeuft; VOR Code-Redeploy per R-A-1)
- Scope: `sql/migrations/123_v98_knowledge_unit_themes.sql` (geschrieben). `ALTER TABLE knowledge_unit ADD COLUMN IF NOT EXISTS themes text[] NOT NULL DEFAULT '{}'` + `CREATE INDEX IF NOT EXISTS idx_knowledge_unit_themes ON knowledge_unit USING gin (themes)` + `NOTIFY pgrst, 'reload schema'`. Additiv, verlustfrei, kein Backfill (Bestand = `{}`), forward-only, idempotent. DB-Test `src/lib/db/__tests__/migration-123-knowledge-unit-themes.test.ts` (Self-Apply in gerollbackter Tx → Spalte/Index/Containment/Idempotenz) — laeuft im /qa-Sidecar.
- Reason: V9.8 FEAT-089 / BL-505 — Tag-Export-Propagation: `email_synthesized_unit.themes` (Mig 119) sollen beim Promote in `knowledge_unit` queryable landen (Handbuch-Findbarkeit). DEC-228 (dedizierte Spalte statt metadata JSONB).
- Affected Areas: `knowledge_unit` (+1 Spalte, +1 GIN-Index). `handbook-import.ts::mapSynthesizedUnitToKnowledgeUnit` schreibt themes mit (FEAT-089). Vokabular-Loader (FEAT-088) liest daraus (DEC-229).
- Risk: Niedrig — additive Spalte mit Default, kein Backfill, kein FK. GIN-Index auf text[] Standard.
- Rollback Notes: `DROP INDEX IF EXISTS idx_knowledge_unit_themes; ALTER TABLE knowledge_unit DROP COLUMN IF EXISTS themes;`.

### MIG-122 — V9.75 SLC-V9.75-C Mitarbeiter-Register (Migration 122, LIVE 2026-06-18)
- Date: 2026-06-18 (LIVE-Apply auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs` @ 159.69.207.29 als postgres-User via SSH-stdin-Stream; `NOTIFY pgrst, 'reload schema'` gefeuert; verifiziert live: Tabelle + RLS enabled + 2 Policies + Dedup-Index)
- Scope: `sql/migrations/122_v975_employee_roster_draft.sql`. CREATE TABLE `employee_roster_draft` (id, tenant_id FK tenants ON DELETE CASCADE, capture_session_id FK capture_session ON DELETE CASCADE, name, role_hint, block_key, promoted_invitation_id FK employee_invitation ON DELETE SET NULL, created_by FK auth.users, timestamps) — **KEINE E-Mail**. RLS tenant-scoped (employee_invitation-Perimeter: strategaize_admin full + tenant_admin rw). Weiche Dedup UNIQUE-Index (capture_session_id, lower(name), lower(coalesce(role_hint,''))). 121-unabhaengig (keine tier-Referenz). GRANT authenticated + service_role.
- Reason: V9.75 FEAT-087 / BL-508 — leichtes Name+Funktion-Register im Stufe-1-Meeting + Bruecke `promoteRosterEntryToInvitation` → unveraenderte `rpc_create_employee_invitation`.
- Affected Areas: neue Tabelle `employee_roster_draft` (+RLS +3 Indizes). Keine Aenderung an `employee_invitation`/RPC (DEC-224).
- Risk: Niedrig — reine additive Tabelle, keine Daten-Migration. Verifiziert: 6 DB-Sidecar-Tests (Schema/FK-SET-NULL/weiche-Dedup/Tenant-RLS-Pen-Test) GREEN + Live-Smoke (Tabelle selektierbar, RLS enabled).
- Rollback Notes: `DROP TABLE IF EXISTS public.employee_roster_draft;` (im Migration-Header dokumentiert).

### MIG-121 — V9.75 SLC-V9.75-A Tier-Gating Foundation (Migration 121, LIVE 2026-06-18)
- Date: 2026-06-18 (LIVE-Apply auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs` @ 159.69.207.29 als postgres-User via SSH-stdin-Stream; verifiziert live: capture_session.tier DEFAULT 'handbook' + 6 Bestands-Sessions backfillt, ai_jobs.session_tier, 4 Matrix-Fns, 2 Guard-Trigger, fn_tier_allows-Gating-Smoke + change-guard-Rejection-Smoke PASS. Code-Side war 2026-06-17.)
- Scope: `sql/migrations/121_v975_tier_gating_foundation.sql`. (§1) `capture_session.tier text NOT NULL DEFAULT 'handbook' CHECK (free/blueprint/handbook)` (backfillt Bestand in einem ALTER) + `ai_jobs.session_tier text NULL` (denormalisierter Worker-Defense-Stempel). (§2) Matrix-Single-Source: `fn_tier_rank`/`fn_min_tier_for_job`[20 job_types]/`fn_tier_allows`/`fn_session_tier_allows` (alle IMMUTABLE bzw. SECURITY DEFINER). (§3) `capture_session_tier_change_guard` BEFORE-UPDATE-Trigger (service_role-aware, Column-Level-Schutz). (§3b) `ai_jobs_session_tier_insert_guard` BEFORE-INSERT-Trigger (Anti-Forge, DEC-226). (§4) CREATE OR REPLACE der 4 Dispatch-RPCs mit inline Tier-Gate + session_tier-Stempel: `rpc_create_block_checkpoint` (032), `rpc_enqueue_recondense_job` (047), `rpc_trigger_handbook_snapshot` (074), `rpc_trigger_bridge_run` (073, Fix ISSUE-105). (§5) `rpc_claim_next_ai_job_for_type` (035) liefert session_tier im Return (Worker-Defense). `NOTIFY pgrst, 'reload schema'`.
- Reason: V9.75 FEAT-085 / BL-506 — server-side erzwungenes Stufen-Gate (free<blueprint<handbook) an allen gated Dispatch-Pfaden + Worker-Defense; schliesst ISSUE-097 (Entitlement-Loch) + ISSUE-105 (Worker fail-closed Regression).
- Affected Areas: `capture_session` (+1 Spalte, +1 Trigger), `ai_jobs` (+1 Spalte, +1 Trigger), 4 Dispatch-RPCs + 1 Claim-RPC (CREATE OR REPLACE), 4 neue Matrix-Funktionen. Keine Daten-Migration ausser tier-Backfill auf 'handbook'.
- Risk: Niedrig — additive Spalten (NOT-NULL-DEFAULT backfillt verlustfrei), RPC-Bodies sind Supersets der Quell-Bodies (Claim-Semantik byte-identisch). Verifiziert: 34 DB-Sidecar-Tests gegen Live-Coolify-DB (Schema/Matrix-20/Trigger/Dispatch-Gates/Claim-Return) GREEN.
- Rollback Notes: Im Migration-Header dokumentiert — Trigger+Funktionen droppen, Spalten droppen, Original-RPC-Bodies via Re-Apply von 032/047/073/074/035 wiederherstellen (CREATE OR REPLACE hat kein Auto-Drop).

### MIG-063 — V9.1 SLC-V9.1-D DSGVO-Consent + Setup-Lifecycle auf email_inbound_endpoint (Migration 118, live 2026-06-11)
- Date: 2026-06-11 (LIVE-Apply auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423` @ 159.69.207.29 als postgres-User; `NOTIFY pgrst, 'reload schema'` gefeuert)
- Scope: `118_v91_inbound_endpoint_dsgvo_consent_setup_lifecycle.sql` — Atomare BEGIN/DO/COMMIT-Transaction: (1) `ALTER TABLE email_inbound_endpoint ADD COLUMN IF NOT EXISTS` von `setup_token_created_at timestamptz`, `dsgvo_consent_text_version text`, `dsgvo_consent_accepted_at timestamptz`, `dsgvo_consent_user_id uuid REFERENCES auth.users ON DELETE SET NULL`; (2) `DROP CONSTRAINT IF EXISTS email_inbound_endpoint_status_check` + `ADD CONSTRAINT ... CHECK (status IN ('pending_setup','active','paused','revoked'))`.
- Reason: V9.1 FEAT-079 / SLC-V9.1-D MT-0 (DEC-209). Schema-Drift-Closure: Setup-UI braucht queryable 7-Jahre-DSGVO-Consent auf der Endpoint-Row + `pending_setup`-Lifecycle (Endpoint vor erstem Test-Send + Consent). IMP-1189 Schema-Validation vor /backend deckte die Luecke gegen as-built MIG-057 auf.
- Affected Areas: `email_inbound_endpoint` (+4 Spalten, status-CHECK 3 -> 4 Werte). Keine neue Tabelle, keine RLS-Aenderung (Spalten erben Table-RLS aus MIG-057), keine neuen Indexes, `GRANT ALL` deckt neue Spalten ab. Kein Daten-Backfill (Bestand alles `status='active'`, Consent-Spalten NULL = "noch nicht bestaetigt").
- Risk: Sehr gering. ADD COLUMN ohne DEFAULT ist metadata-only (kein Table-Rewrite). CHECK-Erweiterung ist additiv (akzeptiert alle bestehenden Werte weiter). FK `dsgvo_consent_user_id -> auth.users ON DELETE SET NULL` bewahrt Consent-Audit-Row bei User-Loeschung. Idempotent: zweiter Apply laesst IF-NOT-EXISTS no-op + DROP/ADD-CONSTRAINT recreatet identisch.
- Rollback Notes: App-only-Rollback (Coolify-Image-Tag auf Pre-V9.1-D) reicht — neuer Code ist die einzige Quelle die Spalten/`pending_setup` nutzt; alte Spalten/Constraint-Werte stoeren Bestandscode nicht. DB-Rollback optional: `ALTER TABLE email_inbound_endpoint DROP COLUMN IF EXISTS dsgvo_consent_user_id, DROP COLUMN IF EXISTS dsgvo_consent_accepted_at, DROP COLUMN IF EXISTS dsgvo_consent_text_version, DROP COLUMN IF EXISTS setup_token_created_at; ALTER TABLE email_inbound_endpoint DROP CONSTRAINT email_inbound_endpoint_status_check; ALTER TABLE email_inbound_endpoint ADD CONSTRAINT email_inbound_endpoint_status_check CHECK (status IN ('active','paused','revoked'));` (nur wenn keine `pending_setup`-Rows mehr existieren).
- Live-Deploy: **LIVE 2026-06-11**. Apply-Result: `BEGIN` + 2x `NOTICE` (4 columns ensured / status-CHECK 3->4 +pending_setup) + `DO` + `COMMIT`. Post-Apply-Verifikation: `information_schema.columns` zeigt 4 neue Spalten (3x dsgvo_consent_* + setup_token_created_at), `pg_get_constraintdef` zeigt `CHECK (status = ANY (ARRAY['pending_setup','active','paused','revoked']))`. PostgREST-Schema-Reload gefeuert.

### MIG-062 — V9.1 SLC-V9.1-B Continuous-Cost-Cap Schema-Support (Migration 117, live 2026-06-10)
- Date: 2026-06-10 (LIVE-Apply auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423` @ 159.69.207.29 als postgres-User; `NOTIFY pgrst, 'reload schema'` gefeuert)
- Scope: (1) `email_bulk_run.status` CHECK-Constraint von 14 auf 16 Werte erweitert (+`paused` Daily/Monthly-Cap-Hit, +`awaiting_approval` Per-Email-Approval-Pause). (2) `CREATE VIEW vw_bulk_email_cost_daily` (security_invoker=true, 1:1-Mirror der Monthly-View MIG-054/109 mit `date_trunc('day', created_at)`, Filter `status <> 'failed'`, GRANT authenticated + service_role).
- Affected Areas: `email_bulk_run` (CHECK-Constraint), neue View `vw_bulk_email_cost_daily` (gelesen vom Continuous-Cost-Cap-Service `src/lib/bulk-email/continuous-cost-cap.ts`). Keine Daten-Migration, keine bestehende View beruehrt.
- Reason: Slice-Spec SLC-V9.1-B listete keine Migration, aber MT-2/MT-3/MT-4 schreiben `status IN ('paused','awaiting_approval')` (vom LIVE-CHECK abgelehnt) und der Daily-Cap (DEC-197) liest aus einer Tages-View, die in V9.0 nie angelegt wurde. Beide Luecken vom /backend-Pattern-Reuse-Inspect gefunden.
- Risk: Niedrig — additive CHECK-Erweiterung + additive View. Idempotent (DROP CONSTRAINT IF EXISTS + ADD; DROP VIEW IF EXISTS + CREATE). Verifiziert: `pg_get_constraintdef` zeigt beide neuen Werte + `information_schema.views` zeigt die Daily-View.
- Rollback Notes: CHECK auf die 14 V9.1-Werte zuruecksetzen + `DROP VIEW vw_bulk_email_cost_daily`. Kein Daten-Verlust (View ist abgeleitet, CHECK-Rollback nur falls 'paused'/'awaiting_approval'-Rows existieren — dann erst diese Rows umsetzen).

### MIG-061 — V9.1 SLC-V9.1-A MT-R2 email_inbound_sync_state (Migration 116, IMAP-Reuse DEC-205, live 2026-06-10)
- Date: 2026-06-10 (LIVE-Apply auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423` @ 159.69.207.29; NOTIFY pgrst reload schema gefeuert)
- Scope: `CREATE TABLE email_inbound_sync_state` (Migration 116) fuer inkrementellen IMAP-UID-Sync (Port aus BS `email_sync_state`, aber per-Endpoint): `endpoint_id uuid PRIMARY KEY REFERENCES email_inbound_endpoint(id) ON DELETE CASCADE`, `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` (FK denormalisiert wie email_forward_allowlist, ergaenzt ggue. Draft-Scope), `folder text NOT NULL DEFAULT 'INBOX'`, `last_uid bigint NOT NULL DEFAULT 0`, `status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','syncing','error'))`, `last_sync_at timestamptz`, `emails_synced_total int NOT NULL DEFAULT 0`, `error_message text`, `updated_at timestamptz NOT NULL DEFAULT now()`. + Index auf tenant_id + RLS (admin_all + tenant-scoped SELECT + service_role write) + GRANTs + updated_at-Trigger.
- Affected Areas: NEU — konsumiert vom IMAP-Sync-Cron (`src/lib/inbound-email/imap-sync.ts`, MT-R5/R6). Keine bestehende Tabelle beruehrt.
- Reason: ImapFlow-inkrementeller Sync braucht persistente `last_uid`-State pro Mailbox/Endpoint (BS-Pattern). Ersetzt den zustandslosen SES-Push.
- Risk: Niedrig — additive Tabelle. Verifiziert: `\d` (Tabelle+CHECK+2 FK+RLS+3 Policies+Trigger) + Schema-Vitest 6/6 GREEN (node:20, strategaize-net).
- Rollback Notes: `DROP TABLE IF EXISTS email_inbound_sync_state;`

### MIG-060 — V9.1 SLC-V9.1-A MT-4 rpc_inbound_record_message Postgres-Function (Migration 115, LIVE)
- Date: 2026-06-10 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423`, BEGIN/CREATE-FUNCTION/REVOKE×3/GRANT/COMMIT durch. Verify: pg_proc count=1, has_function_privilege('anon',...)=false, ('service_role',...)=true, NOTIFY pgrst gefeuert.)
- Scope: `CREATE OR REPLACE FUNCTION public.rpc_inbound_record_message(p_tenant_id uuid, p_endpoint_id uuid, p_anchor_date date, p_source_file_name text, p_file_hash text, p_storage_path text, p_message jsonb) RETURNS uuid` — atomarer Daily-Roll-Over (INSERT email_bulk_run forward_bucket/continuous ON CONFLICT (tenant_id,endpoint_id,daily_anchor_date) DO UPDATE email_count+1 RETURNING id) + INSERT email_message. SECURITY DEFINER, SET search_path=public. Berechtigung: REVOKE EXECUTE FROM PUBLIC+anon+authenticated, GRANT EXECUTE TO service_role.
- Affected Areas: email_bulk_run, email_message (INSERT-Pfad Inbound-Webhook). Konsumiert von `src/app/api/inbound/email/route.ts`.
- Reason: supabase-js kann email_count=email_count+1 nicht race-sicher; atomare Multi-Entity-Tx via Postgres-Function ist Strategaize-Standard (DEC-203, backend.md Decision-Tree).
- Risk: Niedrig — additive Function, keine bestehende Logik beruehrt. Re-Run idempotent (CREATE OR REPLACE).
- Rollback Notes: `DROP FUNCTION IF EXISTS public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb);`

### MIG-059 — V9.1 SLC-V9.1-A MT-4 email_bulk_run.uploader_user_id nullable (Migration 114, LIVE)
- Date: 2026-06-10 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423`, BEGIN/ALTER/COMMIT durch. Verify: information_schema.columns is_nullable='YES', NOTIFY pgrst gefeuert.)
- Scope: `ALTER TABLE public.email_bulk_run ALTER COLUMN uploader_user_id DROP NOT NULL`. forward_bucket-Continuous-Runs (System-Pfad, kein menschlicher Uploader) setzen NULL; mbox_upload-Runs setzen den Wert weiter.
- Affected Areas: email_bulk_run (uploader_user_id Constraint). FK auf auth.users bleibt unveraendert.
- Reason: DEC-202 — uploader_user_id ist mbox-Upload-spezifisch, forward_bucket-Runs haben keinen Uploader.
- Risk: Niedrig — DROP NOT NULL ist additive Relaxation, idempotent. Bestehende Rows + V9-Pfad unveraendert.
- Rollback Notes: `ALTER TABLE email_bulk_run ALTER COLUMN uploader_user_id SET NOT NULL` (nur moeglich wenn keine forward_bucket-NULL-Rows existieren).

### MIG-058 — V9.1 SLC-V9.1-A MT-2 ALTER email_bulk_run + email_message: inbound_source + retention + raw_storage_path (Migration 113, LIVE)
- Date: 2026-06-09 (LIVE — applied 14:32 CEST via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423`, BEGIN/ALTER×7/UPDATE×2/CREATE-INDEX×3/COMMIT atomar durch. Final-Schema (Implementation-Drift vs Spec): `soft_delete_at` statt `deleted_at` + neue Spalte `daily_anchor_date` fuer DEC-197 Daily-Roll-Over UNIQUE-Constraint. Backfill nur `retention_until` + `received_at` — `soft_delete_at` startet NULL. Indexe: `idx_email_bulk_run_retention_pending` (partial WHERE soft_delete_at IS NULL), `idx_email_bulk_run_forward_daily_roll` UNIQUE partial (WHERE inbound_source='forward_bucket' AND endpoint_id IS NOT NULL), `idx_email_message_raw_storage_path` partial WHERE NOT NULL.)
- Scope:
  - `113_v91_email_bulk_run_message_inbound_retention.sql` — Atomare BEGIN/ALTER/CREATE-INDEX/COMMIT-Transaction:
    - `ALTER TABLE email_bulk_run ADD COLUMN IF NOT EXISTS inbound_source text NOT NULL DEFAULT 'mbox_upload' CHECK (inbound_source IN ('mbox_upload', 'forward_bucket'))`
    - `ALTER TABLE email_bulk_run ADD COLUMN IF NOT EXISTS endpoint_id uuid REFERENCES email_inbound_endpoint ON DELETE SET NULL`
    - `ALTER TABLE email_bulk_run ADD COLUMN IF NOT EXISTS retention_until timestamptz`
    - `ALTER TABLE email_bulk_run ADD COLUMN IF NOT EXISTS soft_delete_at timestamptz` (as-applied; Spec-Draft sagte `deleted_at`) — **konsumiert RUN-LEVEL von SLC-V9.1-C / DEC-208 (Retention-Sweep), KEIN neues Migration noetig**
    - `ALTER TABLE email_bulk_run DROP CONSTRAINT IF EXISTS email_bulk_run_status_check; ALTER TABLE email_bulk_run ADD CONSTRAINT email_bulk_run_status_check CHECK (status IN (... 13 V9-Werte ..., 'continuous'))` — neuer Wert fuer V9.1 Daily-Roll-Over-Run
    - `CREATE INDEX IF NOT EXISTS idx_email_bulk_run_retention_pending ON email_bulk_run(retention_until) WHERE soft_delete_at IS NULL` (as-applied Name/Spalte; Fast-Path fuer SLC-V9.1-C Retention-Cron)
    - `CREATE INDEX IF NOT EXISTS idx_email_bulk_run_inbound ON email_bulk_run(inbound_source, created_at DESC)`
    - `ALTER TABLE email_message ADD COLUMN IF NOT EXISTS raw_storage_path text`
    - `ALTER TABLE email_message ADD COLUMN IF NOT EXISTS retention_until timestamptz`
    - `ALTER TABLE email_message ADD COLUMN IF NOT EXISTS deleted_at timestamptz`
    - `CREATE INDEX IF NOT EXISTS idx_email_message_retention ON email_message(retention_until) WHERE deleted_at IS NULL`
    - Backfill: `UPDATE email_bulk_run SET retention_until = created_at + INTERVAL '90 days' WHERE retention_until IS NULL` + entsprechend email_message. Bestehende V9-mbox-Upload-Rows bekommen damit Retention-Cleanup-Eligibility ab 60d/90d nach urspruenglicher Upload-Zeit.
- Reason: V9.1 SLC-V9.1-A MT-2 Storage-Schema-Erweiterung fuer Continuous-Stream + Retention-Cron. `inbound_source` differenziert V9-mbox-Upload-Runs ('mbox_upload') von V9.1-Forward-Bucket-Runs ('forward_bucket'). `endpoint_id` referenziert email_inbound_endpoint fuer Tenant-Lookup-Audit. `retention_until` + `deleted_at` ermoeglichen DEC-198 Soft-/Hard-Delete-Lifecycle. `raw_storage_path` differenziert V9.1-Continuous-Stream-Pfade (`bulk-email/<tenant>/forward-bucket/<endpoint>/<YYYY-MM-DD>/<message-id>.eml`) von V9-Single-File-Path (`email_bulk_run.storage_path`). Status-Wert 'continuous' markiert V9.1-Forward-Bucket-Runs die noch akkumulieren (kein Pipeline-Trigger erfolgt), Pipeline-Trigger setzt sie auf 'parsing'.
- Affected Areas: 2 bestehende Tabellen (`email_bulk_run` + `email_message`) bekommen je 3-4 zusaetzliche Spalten. CHECK-Constraint `email_bulk_run_status_check` erweitert um 1 Wert. 3 neue Indizes. Backfill UPDATE auf ggf. existierende V9-Rows (Internal-Test-Volumen, ~10-50 Rows pro Tenant). Bestehende V9-Worker-Code laeuft unveraendert weil: (a) inbound_source bekommt DEFAULT, (b) endpoint_id bleibt NULL bei V9-Rows, (c) deleted_at-NULL-Filter ist in V9-Code nicht vorhanden → V9-Code sieht alle Rows bis Retention-Cron sie soft-deleted. Worker fuer Retention-Cron (MT-V9.1-Cron) muss email_message-Reads mit `WHERE deleted_at IS NULL` filtern wenn Soft-Delete als invisible behandelt werden soll.
- Risk: Niedrig. ALTER ADD COLUMN mit DEFAULT auf bestehende Tabellen ist O(n) — bei Internal-Test-Volumen unter 1 Sek. CHECK-Constraint-Replace via DROP/ADD ist atomar im selben TX. Partial-Index `WHERE deleted_at IS NULL` ist initial leer (alle Rows haben deleted_at=NULL). Backfill-UPDATE ist idempotent (`WHERE retention_until IS NULL`).
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-051/052/056: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m113.sql`. Verify: `\d email_bulk_run` + `\d email_message` + `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='email_bulk_run_status_check';` + Index-Count via pg_indexes.
- Rollback Notes: `BEGIN; ALTER TABLE email_message DROP COLUMN IF EXISTS deleted_at; DROP COLUMN IF EXISTS retention_until; DROP COLUMN IF EXISTS raw_storage_path; ALTER TABLE email_bulk_run DROP COLUMN IF EXISTS deleted_at; DROP COLUMN IF EXISTS retention_until; DROP COLUMN IF EXISTS endpoint_id; DROP COLUMN IF EXISTS inbound_source; ALTER TABLE email_bulk_run DROP CONSTRAINT email_bulk_run_status_check; ALTER TABLE email_bulk_run ADD CONSTRAINT email_bulk_run_status_check CHECK (status IN (... V9-Werte ohne 'continuous')); DROP INDEX IF EXISTS idx_email_message_retention; DROP INDEX IF EXISTS idx_email_bulk_run_inbound; DROP INDEX IF EXISTS idx_email_bulk_run_retention; COMMIT;`. V9.1-Forward-Bucket-Rows wuerden ggf. Status-Constraint-Violation werfen wenn status='continuous' existiert → vor Rollback: `UPDATE email_bulk_run SET status='failed' WHERE status='continuous'`. Soft-deleted Rows wuerden wieder sichtbar (Application-Code muss damit umgehen).

### MIG-057 — V9.1 SLC-V9.1-A MT-2 Inbound-Foundation: 3 neue Tabellen + RLS + CHECK-Erweiterungen (Migration 112, LIVE)
- Date: 2026-06-09 (LIVE — applied 14:31 CEST via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423`, BEGIN/CREATE/ALTER/GRANT/COMMIT atomar durch. Final-Schema (Implementation-Drift vs Spec): `email_inbound_endpoint` Status-Enum reduziert auf 3 Werte ('active','paused','revoked') ohne 'pending_setup' (Provisioning ist Out-of-Scope V9.1-A, geht via SLC-V9.1-D Setup-UI), `setup_token` text statt UNIQUE constraint (slug ist UNIQUE), kein vendor/local_part/domain-Split (slug ist globaler Catchall-Key per DEC-200), kein dsgvo_consent_*-Trail (kommt in SLC-V9.1-D). `email_validation_reject_log` ohne spam_score/raw_headers/message_id (reduzierter Audit-Scope V9.1-A — Erweiterung in V9.2+). Verify post-LIVE: 3 Tabellen via pg_class, 10 RLS-Policies via pg_policy, ai_jobs_job_type_check enthaelt beide V9.1-Werte, email_bulk_run_status_check enthaelt 'continuous', 0 NULL retention_until nach Backfill, 3 neue Indexes. NOTIFY pgrst 'reload schema' gefeuert.)
- Scope:
  - `112_v91_inbound_foundation.sql` — Atomare BEGIN/CREATE/ALTER/GRANT/COMMIT-Transaction:
    - `CREATE TABLE IF NOT EXISTS email_inbound_endpoint (...)` (siehe ARCHITECTURE.md Section V9.1 Data Model): tenant_id-FK, vendor-CHECK ('ses-ireland', 'mailgun-eu'), local_part, domain, setup_token, setup_token_created_at, status-CHECK ('pending_setup', 'active', 'paused', 'revoked'), dsgvo_consent_text_version, dsgvo_consent_accepted_at, dsgvo_consent_user_id, created_at, updated_at, UNIQUE(vendor, local_part, domain).
    - `CREATE TABLE IF NOT EXISTS email_forward_allowlist (...)` mit tenant_id, endpoint_id-FK, allowed_pattern, pattern_type-CHECK ('domain', 'email'), enabled, notes, created_at, created_by, UNIQUE(endpoint_id, allowed_pattern).
    - `CREATE TABLE IF NOT EXISTS email_validation_reject_log (...)` mit nullable tenant_id, nullable endpoint_id-FK SET NULL, vendor, recipient_local_part, recipient_domain, sender_address, message_id, spam_score, reject_layer-CHECK (7 Werte), reject_reason, raw_headers JSONB, created_at.
    - 4 neue Indizes (idx_email_inbound_endpoint_tenant + _lookup, idx_email_forward_allowlist_endpoint, idx_email_validation_reject_log_tenant + _reject_layer).
    - `ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check; ADD CONSTRAINT ai_jobs_job_type_check CHECK (job_type IN (... 17 bestehende V9-Werte ..., 'email_bulk_pipeline_trigger', 'email_bulk_retention_sweep'))` — 2 neue Werte fuer V9.1-Worker.
    - RLS-Policies auf alle 3 neuen Tabellen:
      - `email_inbound_endpoint`: strategaize_admin ALL, tenant_admin OWN-TENANT INS/SEL/UPD, tenant_member/employee DENY.
      - `email_forward_allowlist`: strategaize_admin ALL, tenant_admin OWN-TENANT INS/SEL/UPD/DEL, tenant_member/employee DENY.
      - `email_validation_reject_log`: strategaize_admin ALL (Cross-Tenant inkl. tenant_id IS NULL Rows), tenant_admin OWN-TENANT SEL (read-only — INSERT erfolgt via service_role-Webhook).
    - GRANTs: service_role hat ALL auf alle 3 Tabellen + ai_jobs. authenticated hat SELECT/INSERT/UPDATE auf email_inbound_endpoint + email_forward_allowlist (RLS-getrieben). authenticated hat SELECT auf email_validation_reject_log (RLS-getrieben).
- Reason: V9.1 SLC-V9.1-A MT-1 Schema-Fundament fuer Inbound-Webhook-Endpoint + Validation-Layer + Audit. 3 neue Tabellen + 2 neue ai_jobs.job_type-Werte. Pattern-konsistent zu MIG-051 (V9 SLC-165 Schema): 4 Tabellen + capture_mode CHECK + Bucket + RLS. RLS-Policies folgen V9-Pattern strategaize_admin Cross-Tenant + tenant_admin OWN-TENANT.
- Affected Areas: 3 neue Tabellen (`email_inbound_endpoint`, `email_forward_allowlist`, `email_validation_reject_log`). 1 CHECK-Constraint-Erweiterung auf `ai_jobs.job_type` (von 17 auf 19 Werte). 4 neue Indizes. ~10 RLS-Policies + GRANTs (3 Policies pro Tabelle + Cross-Cutting fuer service_role).
- Risk: Niedrig. CREATE TABLE IF NOT EXISTS sind nicht-destruktiv. CHECK-Constraint-Replace ist atomar in TX. RLS-Policies nutzen Standard-Helper (`auth_tenant_id() = tenant_id`, `auth.is_strategaize_admin()`) die bereits in MIG-044 (V7.1 SLC-136) gesetzt sind. Verfuegbarkeit dieser Helper VOR Apply pruefen (SELECT proname FROM pg_proc WHERE proname IN ('auth_tenant_id', 'is_strategaize_admin')). Bei Fehlen: Helper-Migration first.
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-051/052/056: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m112.sql`. Verify: `\dt email_inbound_endpoint email_forward_allowlist email_validation_reject_log` + RLS-Policy-Count via `SELECT count(*) FROM pg_policies WHERE tablename IN (...)` + CHECK-Constraint-Definition via pg_get_constraintdef + Index-Count via pg_indexes. Post-Apply NOTIFY pgrst, 'reload schema' fuer PostgREST-Reload (analog MIG-044).
- Rollback Notes: `BEGIN; DROP TABLE IF EXISTS email_validation_reject_log CASCADE; DROP TABLE IF EXISTS email_forward_allowlist CASCADE; DROP TABLE IF EXISTS email_inbound_endpoint CASCADE; ALTER TABLE ai_jobs DROP CONSTRAINT ai_jobs_job_type_check; ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_job_type_check CHECK (job_type IN (... 17 V9-Werte)); COMMIT;`. CASCADE-DROP loescht Sub-Tabellen-FKs (email_forward_allowlist.endpoint_id, email_validation_reject_log.endpoint_id). FKs auf email_bulk_run.endpoint_id (kommt MIG-058) bleiben unbeeintraechtigt bei reiner MIG-057-Rollback (Spalte ist nullable + SET NULL on DELETE).

### MIG-056 — V9 SLC-167 Pattern-Extraktion Migration-Luecke Hotfix (Migration 111, applied — POST-LAUNCH HOTFIX)
- Date: 2026-06-05 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423` in /post-launch V9 RPT-422 ~16:55 UTC, atomare BEGIN/ALTER×4/COMMIT durch. Post-Apply Verify: `ai_cost_ledger_role_check` jetzt 19 Werte incl. 'email_bulk_pattern_extraction', `ai_jobs_job_type_check` jetzt 19 Werte incl. 'email_bulk_pattern_extract'.)
- Scope:
  - `111_v9_pattern_extraction_role_and_job_type.sql` — Atomare BEGIN/ALTER×4/COMMIT-Transaction:
    - `ALTER TABLE ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check` — alte 18-Werte-Variante aus Migration 108 wird entfernt
    - `ALTER TABLE ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check CHECK (...19 Werte)` — kanonische Liste inkl. SLC-167 'email_bulk_pattern_extraction' (mit -tion-Suffix, per IMP-1055 Naming-Konvention)
    - `ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check` — alte 18-Werte-Variante aus Migration 108 wird entfernt
    - `ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_job_type_check CHECK (...19 Werte)` — kanonische Liste inkl. SLC-167 'email_bulk_pattern_extract' (ohne -tion-Suffix, per Job-Type-Naming-Konvention)
- Affected Areas: `public.ai_cost_ledger.role` CHECK Constraint (1 DROP + 1 ADD, 19 Werte) und `public.ai_jobs.job_type` CHECK Constraint (1 DROP + 1 ADD, 19 Werte). Keine Tabellen-Schema-Aenderung. Keine Row-Aenderung. Idempotent via DROP IF EXISTS.
- Reason: SLC-167 hat zwei neue CHECK-Werte eingefuehrt (per L-V9-7 / IMP-1055 Asymmetrie), aber niemand hat sie zur jeweiligen CHECK-Constraint hinzugefuegt. Migrations 107 (email_bulk_pre_filter) + 108 (email_bulk_pii_redact + 3 job_types) deckten SLC-166 ab. Migrations 109 (View-Only) + 110 (knowledge_unit.source + checkpoint_type) waren scope-anders. RPT-417 Gesamt-/qa-Verdict PASS-WITH-LOW-DEFERRED-LIVE hatte keine DB-vs-Code Cross-Verifikation aller neuen CHECK-Werte. Discovery durch /post-launch V9 T+immediate ai_cost_ledger Live-Schema-Check vs Code-Constant `AI_COST_LEDGER_ROLE` in `handle-pattern-extraction-job.ts:77`.
- Risk: S — additive CHECK-Erweiterungen ohne Datenmigration. Idempotent. Pre-Apply-Check: 0 Pattern-Extraction-Runs in Production (kein Daten-Verlust). Cross-Repo IMP-Pflicht fuer Dev-System (separates IMP-Update geplant).
- Rollback Notes: `ALTER TABLE ai_cost_ledger DROP CONSTRAINT ai_cost_ledger_role_check; ADD CONSTRAINT ... CHECK (...18 Werte ohne 'email_bulk_pattern_extraction')` — wuerde Pattern-Extraction-ai_cost_ledger-INSERT wieder mit CHECK-Violation fehlschlagen lassen (Cost-Audit-Trail-Bypass). Analog ai_jobs. Nicht empfohlen — V9-Pattern-Extraction-Pipeline waere broken.
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-052/053/054/055: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m111.sql`. Verify: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('ai_cost_ledger_role_check','ai_jobs_job_type_check')` muss beide 19-Werte-Listen zeigen.
- ISSUE-Trail: ISSUE-092 (HIGH discovered + resolved in derselben /post-launch Session — see KNOWN_ISSUES.md).


### MIG-055 — V9 SLC-168 knowledge_unit.source + block_checkpoint.checkpoint_type CHECK extensions (Migration 110, applied)
- Date: 2026-06-05 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447`, atomare DO/ALTER×2 + 2x DROP IF EXISTS + 2x ADD CONSTRAINT durch. Post-Apply Verify: `knowledge_unit_source_check` 11 Werte incl. `email_bulk`, `block_checkpoint_checkpoint_type_check` 5 Werte incl. `email_bulk_import`. Beide NOTICEs gefeuert. Discovery-Korrektur: `knowledge_unit.metadata jsonb NOT NULL DEFAULT '{}'::jsonb` LIVE bestaetigt (existiert seit V4-Foundation, war im Slice-Spec-Discovery zu Migrations-Files-orientiert verschollen) — defensive Try-Set-Pattern in MT-2 nicht noetig, metadata wird direkt befuellt. `block_checkpoint_id` IS NULLABLE (Migration 063) — Pseudo-Checkpoint fuer Audit-Konsistenz beibehalten.)
- Scope:
  - `110_v9_knowledge_unit_email_bulk_check.sql` — Atomare DO-Block-Transaction:
    - `ALTER TABLE knowledge_unit DROP CONSTRAINT IF EXISTS knowledge_unit_source_check` — alte 10-Werte-Variante aus MIG-087/Migration 087 wird entfernt
    - `ALTER TABLE knowledge_unit ADD CONSTRAINT knowledge_unit_source_check CHECK (source IN (...11 Werte))` — kanonische Liste inkl. Bestand (questionnaire, exception, ai_draft, meeting_final, manual, evidence, dialogue, employee_questionnaire, walkthrough_transcript, walkthrough_transcript_redacted) + neuer V9-Wert 'email_bulk'
    - `ALTER TABLE block_checkpoint DROP CONSTRAINT IF EXISTS block_checkpoint_checkpoint_type_check` — alte 4-Werte-Variante aus MIG-034/Migration 091 wird entfernt
    - `ALTER TABLE block_checkpoint ADD CONSTRAINT block_checkpoint_checkpoint_type_check CHECK (checkpoint_type IN (...5 Werte))` — kanonische Liste inkl. Bestand (questionnaire_submit, meeting_final, backspelling_recondense, auto_final) + neuer V9-Wert 'email_bulk_import'
    - `RAISE NOTICE` (1/2 + 2/2) zur Live-Apply-Verifikation
- Affected Areas: `public.knowledge_unit.source` CHECK Constraint (1 DROP + 1 ADD, 11 Werte) und `public.block_checkpoint.checkpoint_type` CHECK Constraint (1 DROP + 1 ADD, 5 Werte). Keine Tabellen-Schema-Aenderung. Keine Row-Aenderung. Idempotent via DROP IF EXISTS — wiederholte Apply-Versuche schlagen nicht fehl.
- Reason: SLC-168 importToHandbook Server-Action persistiert akzeptierte Patterns als knowledge_unit-Rows mit `source='email_bulk'` und legt pro Bulk-Run einen Pseudo-block_checkpoint mit `checkpoint_type='email_bulk_import'` an, um die NOT NULL FK-Pflicht (knowledge_unit.block_checkpoint_id) ohne Schema-Bruch zu erfuellen. DEC-193 dokumentiert den Path-A-Lite-Tradeoff (Source-Attribution im body als Markdown statt SourceAttributionBlock-Reader-Component).
- Risk: S — additive CHECK-Erweiterungen ohne Datenmigration. Idempotent. Kein Code-Konsument vor MT-2 (importToHandbook erste schreibende Funktion fuer source='email_bulk' und checkpoint_type='email_bulk_import').
- Rollback Notes: `ALTER TABLE knowledge_unit DROP CONSTRAINT knowledge_unit_source_check; ALTER TABLE knowledge_unit ADD CONSTRAINT ... CHECK (source IN (10 Werte ohne 'email_bulk'))`. Analog block_checkpoint. Pre-Apply-Backup-CSV per sql-migration-hetzner.md bewahrt exakte alte Definition.
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-052/053/054: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m110.sql`. Verify: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('knowledge_unit_source_check','block_checkpoint_checkpoint_type_check')` muss beide 11/5-Werte-Listen zeigen.

### MIG-054 — V9 SLC-167 MT-1 vw_bulk_email_cost_monthly View Security-Hotfix (Migration 109, applied)
- Date: 2026-06-04 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447`, atomare BEGIN/DROP/CREATE/COMMENT/GRANT×2/COMMIT durch. Post-Apply Verify: `\d+ public.vw_bulk_email_cost_monthly` zeigt `Options: security_invoker=true`, `month date`, `total_cost_eur numeric(12,4)`, `run_count integer`. Vitest gegen Coolify-DB: 7/7 PASS in 247ms auf node:22-Sidecar im `bwkg80w04wgccos48gcws8cs_strategaize-net`-Network.)
- Scope:
  - `109_v9_bulk_email_cost_view.sql` — Atomare BEGIN/COMMIT-Transaction:
    - `DROP VIEW IF EXISTS public.vw_bulk_email_cost_monthly` — alte MIG-051/106-Variante ohne security_invoker (RLS-Bypass) wird entfernt
    - `CREATE VIEW public.vw_bulk_email_cost_monthly WITH (security_invoker = true) AS SELECT tenant_id, date_trunc('month', created_at)::date AS month, SUM(total_cost_eur)::numeric(12,4) AS total_cost_eur, COUNT(*)::integer AS run_count FROM email_bulk_run WHERE status <> 'failed' GROUP BY tenant_id, ...`
    - `COMMENT ON VIEW` — Dokumentation des MT-1-Zwecks
    - `GRANT SELECT TO authenticated` — Tenant-Admins lesen via RLS-Filter
    - `GRANT SELECT TO service_role` — Cron/Audit-Jobs lesen Cross-Tenant via BYPASSRLS
- Affected Areas: `public.vw_bulk_email_cost_monthly` View (1 DROP + 1 CREATE replaced). Underlying-Table `email_bulk_run` unbetroffen. RLS-Policies auf email_bulk_run werden ab MIG-054 vom View-Caller geerbt (vorher: View lief mit Owner-Privilegien = postgres = BYPASSRLS = Cross-Tenant-Leak-Risiko).
- Reason: Security-Hotfix + Typed-Output fuer Cost-Cap-Service in SLC-167 MT-3. Die alte MIG-051/106-View hatte `security_invoker = false` (Default) → ein authenticated-tenant-Admin haette via SELECT auf der View Cross-Tenant-Cost-Daten gesehen (RLS-Bypass via Owner-Privileg-Inheritance). Realer Impact gering, weil bis SLC-167 noch keine UI/API auf der View liest — aber pre-launch-Hotfix vor MT-3 Pflicht. Zusaetzlich: getypte Output-Spalten (::date statt timestamptz, ::numeric(12,4) statt numeric, ::integer statt bigint) fuer stabile Type-Inference im TypeScript-Cost-Cap-Service.
- Risk: S — additive Schema-Korrektur. Idempotent via DROP IF EXISTS. Kein Datenmigrations-Bedarf, View ist abgeleitet aus email_bulk_run. Code-Konsumenten existieren noch nicht (SLC-167 MT-3 ist der erste).
- Rollback Notes: Original-View aus MIG-051/106 wiederherstellen (`CREATE OR REPLACE VIEW ... AS SELECT tenant_id, date_trunc('month', created_at) AS month, SUM(total_cost_eur) AS total_cost_eur, COUNT(*) AS run_count FROM email_bulk_run WHERE status != 'failed' GROUP BY tenant_id, date_trunc('month', created_at)` ohne security_invoker) — wuerde RLS-Bypass wiederherstellen aber View-Funktionalitaet erhalten. Nicht empfohlen.
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-052/053: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m109.sql`. Verify: `\d+ public.vw_bulk_email_cost_monthly` muss `Options: security_invoker=true` zeigen.
### MIG-110 — V8.0.2 OP authenticated+anon search_path Storage-Defense (APPLIED 2026-06-03)
- Date: 2026-06-03
- Slice: V8.0.2 SLC-169 (Deviation-Rule-2-Erweiterung post-Live-Smoke MT-4)
- Scope: `ALTER ROLE authenticated SET search_path = storage, public;` + `ALTER ROLE anon SET search_path = storage, public;`
- Affected Areas: `pg_roles` rolconfig fuer authenticated + anon
- Reason: Live-Smoke MT-4 hat aufgedeckt dass authenticated-Role nach `SET LOCAL ROLE` keinen storage-Schema im search_path hat. ALTER-ROLE-Default soll Cross-Repo-Symmetrie zu BS-search_path-Pattern herstellen.
- Risk: LOW. Additive, idempotent (ueberschreibt bestehende Config). **In der Praxis ohne Effekt fuer Storage-Service-Knex-Pool** — Postgres `SET LOCAL ROLE` lade ALTER-ROLE-Default nur beim LOGIN, nicht beim mid-session-Role-Switch. Migration bleibt als Defense-in-Depth fuer kuenftige Pfade (PostgREST, direkte DB-Connections, etc.). search_path-Drift bei Storage-Service-Knex-Pool ist in [[ISSUE-088]] OP separat dokumentiert.
- Verify: `SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated','anon');` → beide haben rolconfig mit `search_path=storage, public`.
- Rollback Notes: `ALTER ROLE authenticated RESET search_path; ALTER ROLE anon RESET search_path;` — wuerde OP auf Pre-MIG-110-State zurueckfuehren (war auch broken vorher).

### MIG-109 — V8.0.2 OP Storage-Schema GRANTs Hotfix (Cross-Repo-Mirror BS MIG-043) (APPLIED 2026-06-03)
- Date: 2026-06-03
- Slice: V8.0.2 SLC-169
- Scope: Idempotente Default-Supabase-GRANT-Setzung auf `storage.*`-Tabellen fuer `authenticated`+`anon`:
  - `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA storage TO authenticated, anon;` (5 Tables × 4 Privileges)
  - `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA storage TO authenticated, anon;` (defensive No-Op)
  - 4 `ALTER DEFAULT PRIVILEGES` fuer postgres + supabase_storage_admin × TABLES+SEQUENCES (Future-Proofness)
  - `NOTIFY pgrst, 'reload schema'` (PostgREST cache-flush)
- Affected Areas: `information_schema.role_table_grants` fuer storage-Schema, `pg_default_acl` fuer storage-Schema.
- Reason: Cross-Repo-Symmetrie zu BS V8.13 SLC-894 MIG-043. OP war schlimmer betroffen als BS — `authenticated`+`anon` hatten nur SELECT auf 2 unwichtige s3_-Tables, 0 GRANTs auf buckets/migrations/objects. Storage v1.11.13 + GoTrue v2.160 setzen Default-GRANTs nicht im Init-Script (v1.44+ tut das). [[ISSUE-087]] geschlossen.
- Risk: LOW. Additive idempotent, kein REVOKE. RLS-Defense (18 bestehende storage.objects-Policies) bleibt aktiv. service_role unangetastet (20 CRUD-Rows persistent).
- Verify: `SELECT grantee, COUNT(*) FROM information_schema.role_table_grants WHERE table_schema='storage' AND grantee IN ('authenticated','anon') AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE') GROUP BY grantee;` → 20 Rows je Rolle (5 Tables × 4 Privileges).
- Rollback Notes: `REVOKE INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA storage FROM authenticated, anon;` — wuerde ISSUE-087-Bug reaktivieren. Nicht empfohlen.
- Cross-Repo-Quelle: BS V8.13 SLC-894 / MIG-043 / RPT-574 / `docs/CROSS_REPO_V813_STORAGE_GRANTS.md`.

### MIG-053 — V9 SLC-166 MT-6 ai_cost_ledger role + ai_jobs.job_type CHECK extensions (Migration 108, applied)
- Date: 2026-06-04 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447`, atomare BEGIN/ALTER×4/COMMIT durch. Post-Apply Verify: `ai_cost_ledger_role_check` 18 Werte incl. `email_bulk_pre_filter` + `email_bulk_pii_redact`, `ai_jobs_job_type_check` 18 Werte incl. `email_bulk_parse` + `email_bulk_pre_filter` + `email_bulk_thread_redact`. Pre-existing-Bug-Fix Live-erfolgreich. Live-Verifikations-Stack Step 1 PASS — siehe RPT-405.)
- Scope:
  - `108_v9_thread_redact_role_and_job_types.sql` — Atomare BEGIN/COMMIT-Transaction:
    - `DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check` + `ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY[...17 alte + 'email_bulk_pii_redact']))` — neuer 18. Wert fuer Thread-Redact-Worker Cost-Audit (Pattern wie MIG-050 v8_1_augmentation + MIG-107 email_bulk_pre_filter)
    - `DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check` + `ADD CONSTRAINT ai_jobs_job_type_check CHECK (job_type IN (...15 alte + 'email_bulk_parse' + 'email_bulk_pre_filter' + 'email_bulk_thread_redact'))` — Pre-existing-Bug-Fix aus SLC-165 MT-2 + SLC-166 MT-2 + SLC-166 MT-3. Migration 092 (MIG-034) hat ai_jobs.job_type CHECK mit 15 Werten eingefuehrt, Migration 106 (MIG-051) + Migration 107 (kein MIG-XXX-Eintrag) haben die CHECK NICHT mit-erweitert. D.h. die in SLC-165 MT-2 `email_bulk_parse`-INSERT (actions.ts) + SLC-166 MT-2 `email_bulk_pre_filter`-Auto-enqueue (handle-parse-job.ts) + SLC-166 MT-3 `email_bulk_thread_redact`-Approval-INSERT (filter-review/actions.ts) waren live mit Constraint-Violation-Risk. Code-Side-Tests umgehen das via vi.mock — Live-DB wuerde die INSERTs failen lassen. MT-6 fixt alle drei job_types in einer Migration zusammen mit dem MT-6-Hauptzweck (role-Erweiterung).
- Affected Areas: `public.ai_cost_ledger` CHECK + `public.ai_jobs` CHECK (2 Constraints replaced). Bestehende Rows bleiben valide (additive Erweiterung). RLS-Policies unbetroffen. Keine Schema-Aenderung an Tabellen.
- Reason: SLC-166 MT-6 Thread-Redact-Worker schreibt pro V5-PII-Bedrock-Call einen ai_cost_ledger-Eintrag mit role='email_bulk_pii_redact'. Ohne MIG-053 wuerde der INSERT mit `ai_cost_ledger_role_check`-Violation fehlschlagen (non-fatal-pattern faengt es zwar, aber Audit waere weg). Zusaetzlich: ohne ai_jobs.job_type CHECK-Erweiterung wuerde sowohl der Thread-Redact-Worker-Trigger (MT-3 filter-review Approval-Button) als auch die SLC-165/166 MT-1/MT-2 enqueue-Pfade live mit `ai_jobs_job_type_check`-Violation fehlschlagen. MT-6-Trigger wuerde nie ankommen.
- Risk: S — additive Constraint-Erweiterung 2x. Kein Datenmigrations-Bedarf, keine Policy-Aenderung. 0 Auswirkung auf existing roles/job_types.
- Rollback Notes: Original-Constraints aus MIG-107 (ai_cost_ledger 17 Werte) + MIG-092 (ai_jobs 15 Werte) wiederherstellen — wuerde V9-Pipeline blockieren aber nicht zerstoeren (bestehende Rows in beiden Tabellen bleiben).
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-050/107: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m108.sql`. Verify: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('ai_cost_ledger_role_check', 'ai_jobs_job_type_check');`

### MIG-052 — V9 SLC-166 MT-2 ai_cost_ledger.role + 'email_bulk_pre_filter' (Migration 107, applied)
- Date: 2026-06-04 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447`, atomare BEGIN/ALTER×2/COMMIT durch. Post-Apply Verify: `ai_cost_ledger_role_check` 17 Werte incl. neu `email_bulk_pre_filter`. Anschliessend MIG-053 LIVE-Apply hat den Constraint auf 18 Werte erweitert. Live-Verifikations-Stack Step 1 PASS — siehe RPT-405.)
- Scope:
  - `107_v9_cost_ledger_email_bulk_pre_filter_role.sql` — Atomare BEGIN/COMMIT-Transaction:
    - `DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check` + `ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY[...16 alte aus MIG-050 + 'email_bulk_pre_filter']))` — neuer 17. Wert fuer Haiku-Pre-Filter-Worker Cost-Audit (Pattern-parallel zu DEC-167 + MIG-050 v8_1_augmentation)
- Affected Areas: `public.ai_cost_ledger` CHECK-Constraint (1 Constraint replaced). Bestehende V8.1-/V6.3-/V7-Rows bleiben valide (alle 16 alten Werte sind in der neuen Liste enthalten). RLS-Policies unbetroffen. Keine Schema-Aenderung an Tabelle.
- Reason: SLC-166 MT-2 Pre-Filter-Worker (`handle-pre-filter-job.ts`) schreibt pro Haiku-Bedrock-Call einen ai_cost_ledger-Eintrag mit role='email_bulk_pre_filter'. Ohne MIG-052 wuerde der INSERT mit `ai_cost_ledger_role_check`-Violation fehlschlagen — non-fatal-Pattern faengt es zwar via captureException, aber Cost-Audit waere silent verloren (analog ISSUE-076 V6.3-Bug). PII-Redact-Role `email_bulk_pii_redact` bewusst nicht in dieser Migration → kommt in MIG-053 mit SLC-166 MT-6.
- Risk: S — additive Constraint-Erweiterung, kein Datenmigrations-Bedarf, keine Policy-Aenderung. 0 Auswirkung auf existing roles.
- Rollback Notes: Original-Constraint aus MIG-050 wiederherstellen (`DROP + ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY[...16 alte])))`) — wuerde V9-Pre-Filter-Audit blockieren aber nicht zerstoeren (bestehende V9-Rows bleiben in Tabelle, neue INSERTs schlagen fehl).
- Apply-Procedure: Per `.claude/rules/sql-migration-hetzner.md` Pattern, identisch zu MIG-050/MIG-053: base64 + ssh + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m107.sql`. Verify: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check';`. Empfehlung: gemeinsam mit Migration 108 (MIG-053) in einem Founder-Pause-Window applizieren.

> Hinweis (MT-8 records-cleanup 2026-06-03): die fruehere MIG-052 OBSOLET-Stub-Beschreibung fuer ein `vw_bulk_email_cost_monthly`-View-File `107_v9_bulk_email_cost_view.sql` war eine PLANNED-Spekulation und nie umgesetzt. Der View `vw_bulk_email_cost_monthly` wurde tatsaechlich Teil von Migration 106 (MIG-051, SLC-165 MT-2b). Das tatsaechliche File `107_v9_cost_ledger_email_bulk_pre_filter_role.sql` enthaelt die hier beschriebene role-Extension fuer SLC-166 MT-2. MIG-052-Body wurde in SLC-166 MT-8 records-cleanup auf die reale Migration 107 ausgerichtet.

### MIG-051 — V9 SLC-165 MT-2b 4 neue Tabellen + capture_mode CHECK-Erweiterung + bulk-email Storage-Bucket + RLS (Migration 106, live)
- Date: 2026-06-02 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-084548596447`, BEGIN/atomare-Transaction/COMMIT durch. Pre-Apply-Checks PASS: capture_mode-Bestand nur `walkthrough`+`questionnaire` (beide in neuer 7-Werte-Liste enthalten), knowledge_unit.source CHECK existiert mit 10 Bestandswerten — Migration 106 erweitert ihn NICHT (per Comment Lines 37-41: `knowledge_unit.metadata->>'source_type'='email_bulk'` als JSONB-Wert, kein CHECK-Bedarf). Post-Apply: 4 V9-Tabellen + 16 RLS-Policies + Storage-Bucket `bulk-email` + 3 Storage-Policies + View `vw_bulk_email_cost_monthly` + Late-Binding-FK `fk_email_message_thread` + capture_mode CHECK mit 7 Werten inkl. `email_bulk` alle live verifiziert. Vitest gegen Coolify-DB: 16/16 PASS auf node:22-Sidecar im `bwkg80w04wgccos48gcws8cs_strategaize-net`-Network nach 2 atomaren Test-Bug-Fixes (`eae5f5a` + `23bafee` — 6 Test-Fixture-Bugs: REFERENCES `public.`-Prefix-Drift, `template_id`+`template_version`+`owner_user_id`-NOT-NULL-Erweiterung, bigint-String-Type-Coercion, `raw_USER_meta_data` statt `raw_app_meta_data` fuer handle_new_user-Trigger).
- Scope:
  - `106_v9_bulk_email_schema.sql` — Atomare Transaction enthaelt:
    - `CREATE TABLE email_bulk_run` (Audit-Header mit UNIQUE(tenant_id, file_hash) + GENERATED total_cost_eur + status CHECK 13 Werte)
    - `CREATE TABLE email_message` (Pflicht-Headers message_id + in_reply_to + references_array + pre_filter_label CHECK 6 Werte + Indexes auf bulk_run_id, thread_id, message_id)
    - `CREATE TABLE email_thread` (root_message_id + participant_pseudonyms JSONB + redacted_body + thread_status CHECK 4 Werte)
    - `CREATE TABLE email_pattern` (title + description + evidence_snippets JSONB + themes text[] + confidence + curation_status CHECK 4 Werte + imported_to_handbook_at + Indexes auf bulk_run_id + (bulk_run_id, curation_status))
    - `ALTER TABLE email_message ADD CONSTRAINT fk_email_message_thread FOREIGN KEY (thread_id) REFERENCES email_thread ON DELETE SET NULL` (Late-Binding)
    - `ALTER TABLE capture_session DROP CONSTRAINT capture_session_capture_mode_check; ALTER TABLE capture_session ADD CONSTRAINT capture_session_capture_mode_check CHECK (capture_mode IS NULL OR capture_mode IN (...alle aktuellen Werte..., 'email_bulk'))`
    - `ALTER TABLE knowledge_unit.source` CHECK-Erweiterung um `'email_bulk'`-Wert (nur wenn knowledge_unit.source CHECK aktiv ist — pruefen in MT-2)
    - `INSERT INTO storage.buckets (id, name, public) VALUES ('bulk-email', 'bulk-email', false)`
    - 4x RLS-Policies (SELECT + INSERT + UPDATE) pro email_*-Tabelle, Standard-Helper `auth_tenant_id() = tenant_id`, mit Rollen-Matrix V9.0 (strategaize_admin Cross-Tenant + tenant_admin own-Tenant + tenant_member/employee KEIN ACCESS)
    - 5x RLS-Policies fuer `bulk-email`-Bucket (SELECT + INSERT + DELETE-Admin-only) analog evidence-Bucket-Pattern (V2 SLC-018 Migration 044)
    - `GRANT SELECT, INSERT, UPDATE ON email_bulk_run, email_message, email_thread, email_pattern TO authenticated`
- Affected Areas: 4 neue Tabellen, capture_session CHECK-Constraint, knowledge_unit-Source CHECK ggf., Supabase Storage Buckets, RLS-Policy-Layer
- Reason: V9.0 Bulk-Email-Import-Foundation. Schema-Foundation muss vor jedem Pipeline-Schritt stehen. Atomare Transaction-Migration vermeidet halben State bei Failure.
- Risk: Mittel. capture_mode CHECK-Constraint DROP+ADD ist atomic — minimaler Lock-Time (ms). 4 neue Tabellen + RLS sind additive. Storage-Bucket-Insert ist idempotent via `ON CONFLICT (id) DO NOTHING`. Bedrock-Adapter-Code + Worker-Job-Code muss VOR Migration deployed sein (Worker-handle-job.ts kennt neue Job-Types) — sonst NULL-Job-Handler-Crash. Deploy-Reihenfolge: Code-Deploy first, dann Migration.
- Rollback Notes: 
  - `DROP TABLE email_pattern, email_thread, email_message, email_bulk_run CASCADE` (CASCADE wegen knowledge_unit-FK auf email_pattern.imported_knowledge_unit_id, der ON DELETE SET NULL ist — kein knowledge_unit-Verlust).
  - `DELETE FROM storage.objects WHERE bucket_id = 'bulk-email'; DELETE FROM storage.buckets WHERE id = 'bulk-email'`.
  - capture_session CHECK-Constraint zurueck auf vorherige Werte-Liste (analog MIG-067 + spaetere Erweiterungen).
  - knowledge_unit-Daten mit `metadata->>'source_type' = 'email_bulk'` bleiben unveraendert, sind aber ohne Audit-Trail nutzlos. Aufraeumen optional via separate Cleanup-Migration.

### MIG-050 — V8.1 SLC-161 MT-5 `ai_cost_ledger_role_check` erweitert um 'v8_1_augmentation' (Migration 105, live)
- Date: 2026-05-30 (LIVE — applied via ssh+base64+psql -U postgres auf 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-083510365632, BEGIN/ALTER/ALTER/COMMIT durch, `pg_get_constraintdef` verifiziert 16 Werte: 15 alte + 1 V8.1.)
- Scope:
  - `105_v81_cost_ledger_v8_1_augmentation_role.sql` — `DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check` + `ADD CONSTRAINT ... CHECK (role IS NULL OR role = ANY (ARRAY[...15 alte + 'v8_1_augmentation']))`
  - 1 neuer Role-Wert: `v8_1_augmentation`
- Reason: ARCHITECTURE.md V8.1 Line 7521 vorhergesehen: "ai_cost_ledger Tabelle (V6+, Constraint-Erweiterung V6.3 Migration 095 vorhanden — V8.1-Eintraege passen rein)". Migration analog V6.3 Migration 095 (light_pipeline_block) noetig: ohne diese Erweiterung schlaegt `INSERT INTO ai_cost_ledger (role) VALUES ('v8_1_augmentation')` mit CHECK-Constraint-Violation fehl. SLC-161 audit.ts (recordLlmCall) wuerde silent broken sein (analog dem V6.3-Bug ISSUE-076 wo Cost-Logging silent-fail via captureException geschluckt wurde). audit.test.ts (9/9 GREEN gegen Coolify-DB) verifiziert beide Faelle: accept 'v8_1_augmentation' + reject unknown role 'totally_unknown_role'.
- Affected Areas: `public.ai_cost_ledger` CHECK-Constraint (1 Constraint replaced). Bestehende V6+/V6.3/V7 Rows bleiben valide (alle 15 alten Werte sind in der neuen Liste enthalten). RLS-Policies unbetroffen.
- Risk: S — additive Constraint-Erweiterung, kein Datenmigrations-Bedarf, keine Policy-Aenderung. 0 Auswirkung auf existing roles.
- Rollback Notes: Original-Constraint aus Migration 095 wiederherstellen (`DROP + ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY[...15 alte])))`) — wuerde V8.1-Augmentation-Audit blockieren aber nicht zerstoeren (bestehende V8.1-Rows bleiben in Tabelle).

### MIG-049 — V8 SLC-152 MT-2 `diagnose_event_event_type_check` erweitert um 3 V8-Event-Types (Migration 104, live)
- Date: 2026-05-30 (LIVE — applied via ssh+psql -U postgres auf 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-150827246647, BEGIN/ALTER/ALTER/COMMIT durch, `pg_get_constraintdef` verifiziert 12 Werte: 9 V7.2 + 3 V8.)
- Scope:
  - `104_v8_diagnose_event_v8_types.sql` — `DROP CONSTRAINT IF EXISTS diagnose_event_event_type_check` + `ADD CONSTRAINT ... CHECK (event_type IN (...9 V7.2-Werte + 3 V8-Werte))`
  - 3 neue Event-Types: `v8_report_generated`, `v8_email_sent`, `v8_pdf_render_failed`
- Reason: Migration 100 (MIG-046) hat diagnose_event mit hardcoded 9-Werte-CHECK-Constraint angelegt. SLC-152 MT-2 (`trackV8ReportGenerated` + `trackV8EmailSent` + `trackV8PdfRenderFailed`) wuerde ohne diese Erweiterung mit Constraint-Violation fehlschlagen. Spec-Erweiterung: Slice-Spec MT-2 hat den Schema-Drift nicht erwaehnt, dieser Migration-Step wurde als Pflicht erkannt.
- Affected Areas: `public.diagnose_event` CHECK-Constraint (1 Constraint replaced). Bestehende V7.2-Rows bleiben valide (alle 9 V7.2-Werte sind in der neuen Liste enthalten). RLS-Policies unbetroffen.
- Risk: S — additive Constraint-Erweiterung, kein Datenmigrations-Bedarf, keine Policy-Aenderung. 0 Auswirkung auf V7.2-Telemetrie.
- Rollback Notes: Original-Constraint aus Migration 100 wiederherstellen (`DROP + ADD CONSTRAINT diagnose_event_event_type_check CHECK (event_type IN (9 V7.2-Werte))`) — wuerde V8-Events blockieren aber nicht zerstoeren (bestehende V8-Rows bleiben in Tabelle, neue INSERTs schlagen fehl).

### MIG-048 — V8 SLC-148 MT-6 `capture_session.metadata` JSONB-Spalte (Migration 103, live)
- Date: 2026-05-29 (live, applied via ssh+base64+psql -U postgres auf 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-150827246647)
- Scope:
  - `103_v8_capture_session_metadata.sql` — `ALTER TABLE public.capture_session ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;`
  - `COMMENT ON COLUMN ...metadata IS '...'` Dokumentation fuer Use-Intent (V8 generic JSONB slot fuer system-computed Snapshots, separate von answers)
- Reason: Spec-Implementation-Gap detected — Spec SLC-148 MT-6 schreibt nach `capture_session.metadata.v8_report_snapshot`, aber Spalte fehlt nach MT-1/MT-2. Decision per [[feedback-slice-spec-db-schema-drift]] / AskUserQuestion (Option B): neue generische metadata-Spalte JSONB statt v8-spezifischer Spalte oder Snapshot-in-answers. Generic → wiederverwendbar fuer kuenftige Snapshot-Types (V9+). Separate von `answers` (mandant-provided responses) → keine Vermischung Mandant-Input + System-Output.
- Affected Areas: `public.capture_session` (1 neue Spalte). Existing RESTRICTIVE-Policy `capture_session_strategaize_admin_snapshot_gated` (MIG-047 / MT-2) gated WHOLE row by `released_for_strategaize_review` — neue Spalte erbt RLS-Gate ohne weitere Policy-Aenderung. **Idempotenz** via `ADD COLUMN IF NOT EXISTS` — 2nd-Apply safe. KEINE Backfill-Notwendigkeit (DEFAULT '{}' deckt alle pre-existing Rows).
- Risk: S — additive Spalte mit DEFAULT, KEINE Datenmigration, KEIN Policy-Change. 0 Auswirkung auf V6.3 + V7.x + andere Templates die metadata nicht nutzen.
- Rollback Notes: `ALTER TABLE public.capture_session DROP COLUMN IF EXISTS metadata;` ist additivum-rueckwaerts. Wuerde alle V8-Report-Snapshots zerstoeren — Rollback nur sinnvoll wenn V8 vollstaendig zurueckgenommen wird.

### MIG-047 — V8 SLC-148 Template-Seed `exit-readiness-teaser-v1` + Privacy-Flag + RESTRICTIVE-RLS-Policy (Migration 102, live)
- Date: 2026-05-29 (live, applied 2x via ssh+base64+psql -U postgres auf 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-150827246647; 2nd Apply idempotent verified)
- Scope:
  - `102_v8_exit_readiness_teaser_template.sql` — additiver Template-Seed + ALTER + Backfill + RESTRICTIVE Policy via `INSERT ... ON CONFLICT DO UPDATE` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `UPDATE WHERE` + `DROP POLICY IF EXISTS ... CREATE POLICY`:
    - Row in `public.template`: `slug='exit-readiness-teaser-v1'`, `version=1`, `name='Exit Readiness Teaser (Mandanten-Report)'`
    - `metadata.usage_kind='mandanten_report_teaser_v1'` (Worker-Branch-Trigger, analog DEC-126)
    - `metadata.scoring_kind='sui_weighted'` (Score-Engine-Trigger, FEAT-065)
    - `metadata.report_renderer='mandanten_report_v2'` (Renderer-Branch-Trigger, FEAT-066)
    - `metadata.gewichtung` JSONB: m1-m8 je 10%, m9 doppelt mit 20%, m0+m10 ungewichtet
    - `blocks` JSONB mit 11 Modulen (Modul 0..10) + **53 Fragen total** (5 Hygiene + 43 Skala inkl. 6 KI-Erweiterungen F4.4/F6.5/F6.6/F8.7/F9.4/F9.5 + 5 Reflexion) — User-Direktive 2026-05-29 MT-2 per PRINZIPIEN.md-Sections als Source-of-Truth
    - `metadata.stufen_lookup` JSONB: 9 Module x 5 Stufen mit `was_es_bedeutet` + `unsere_empfehlung` Markdown-Texte (~46KB inline, vom MT-1 Build-Skript erzeugt)
    - `metadata.hausaufgaben_lookup` JSONB: 5 Hygiene-Frage-IDs x 2 Status (nein/teilweise) mit fix-formulierten Texten
    - `metadata.worum_es_geht` JSONB: 9 Modul-Level-Texte
    - **ALTER capture_session** ADD COLUMN IF NOT EXISTS `released_for_strategaize_review` BOOLEAN NOT NULL DEFAULT false + `released_for_strategaize_review_at` TIMESTAMPTZ NULLABLE (Privacy-Flow Option A per DEC-163 Erweiterung 2026-05-29)
    - **Backfill UPDATE**: alle existierenden non-V8 capture_sessions (template_id <> exit-readiness-teaser-v1) auf `released=true` setzen — 6/6 pre-existing Sessions backfilled (V6.3 partner_diagnostic + V1 exit_readiness + V4 mitarbeiter_wissenserhebung), Regression-Schutz fuer strategaize_admin-Sichtbarkeit
    - **RESTRICTIVE Policy** `capture_session_strategaize_admin_snapshot_gated` FOR SELECT TO authenticated USING `auth.user_role() <> 'strategaize_admin' OR released_for_strategaize_review = true` — AND-kombiniert mit existing PERMISSIVE-Policies, gated strategaize_admin SELECT auf released-Flag. Idempotent via DROP POLICY IF EXISTS
- Reason: V8 Mandanten-Report-Teaser braucht neues Template parallel zur V6.3-Variante. Pattern-Reuse aus V6.3 MIG-037 (`093_partner_diagnostic_template.sql`) — additiv + idempotent. KEIN Replace bestehender Templates. Stufen-Lookup + Hausaufgaben-Lookup im selben Template-Row gehalten per DEC-164 (Versionierung gratis, Single-Query-Read). Privacy-Flag-Erweiterung schuetzt Mandanten-Snapshot-Privacy vor Strategaize-Admin bis explizite Freigabe.
- Affected Areas: `public.template` (1 neue Row mit JSONB-Substanz), `public.capture_session` (2 neue Spalten + 1 RESTRICTIVE-Policy), Worker-Branch (`runLightPipeline` erweitert via `usage_kind`-Switch in SLC-148 MT-6 — KEIN Migration-Schritt, Code-Pfad), Renderer-Branch (`sendDiagnoseReportByEmail` erweitert via `report_renderer`-Switch in SLC-152 — KEIN Migration-Schritt). KEINE neue Tabelle. **Idempotenz**: `ON CONFLICT (slug, version) DO UPDATE` + `ADD COLUMN IF NOT EXISTS` + `WHERE released=false AND template_id NOT V8` + `DROP POLICY IF EXISTS` — 2nd Apply verified clean (UPDATE 0, NOTICE: column already exists, skipping).
- Risk: L-M — additivum + 1 RESTRICTIVE Policy. 0 Auswirkung auf V1 + V6.3 + V7.x Templates. **Privacy-Flag-Risk eliminiert** durch Backfill-UPDATE: 6 pre-existing Sessions automatic auf released=true gesetzt, strategaize_admin-Zugriff unverändert. JSONB-Size ~46KB Stufen-Lookup, knapp unter TOAST-Schwelle, kein Performance-Bedenken. Tonalitaets-Migration ist Substanz aus MT-1 (Founder-Pflicht durch in LEVELS_MANDANT.md), per DEC-159 KEIN LLM-Pass.
- Rollback Notes: `DELETE FROM public.template WHERE slug='exit-readiness-teaser-v1' AND version=1; DROP POLICY capture_session_strategaize_admin_snapshot_gated ON public.capture_session; ALTER TABLE public.capture_session DROP COLUMN released_for_strategaize_review, DROP COLUMN released_for_strategaize_review_at;` ist additivum-rueckwaerts. Bestehende V6.3 + V1 Templates bleiben unberuehrt. capture_session-Rows die das V8-Template referenzieren mussten vorher invalidiert werden (foreign-key, aber Pre-Live keine V8-Real-Sessions existent).

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

### MIG-003 — Baseline-Init-Scripts auf Onboarding-Scope reduziert
- Date: 2026-04-15
- Scope:
  - `sql/schema.sql` neu geschrieben: nur noch Extensions (uuid-ossp, pgcrypto) + `tenants` + `profiles` + 3 profile-Indexes (ersetzt den uebernommenen Blueprint-Stand mit 10 Tabellen).
  - `sql/functions.sql` neu geschrieben: `auth.user_tenant_id()`, `auth.user_role()`, `handle_new_user()` + Trigger `on_auth_user_created` auf `auth.users`.
  - `sql/rls.sql` neu geschrieben: RLS enable + 4 Policies (admin_full_tenants, tenant_select_own_tenant, admin_full_profiles, user_select_own_profile) + Grants fuer `authenticated` und `service_role`.
  - `sql/Dockerfile.db`: Reihenfolge umgestellt auf `01_schema.sql` → `02_functions.sql` → `03_rls.sql`, damit Policies bei CREATE-Zeitpunkt die auth-Helper-Funktionen sehen.
  - `sql/migrations/020b_onboarding_baseline.sql` geloescht — Inhalt vollstaendig in die Init-Scripts ueberfuehrt, Doppelung vermieden.
- Reason: Die Blueprint-Baseline (10 Tabellen: runs, questions, evidence_*, mirror_*, etc.) gehoert nicht ins Onboarding-Datenmodell. Der Architektur-Scope (DEC-007..010) sieht tenants + profiles als Auth-Fundament vor, alle weiteren Tabellen kommen ueber Migrations 021-023 bzw. spaetere V2-Slices.
- Affected Areas: DB-Init (docker-entrypoint-initdb.d), Dockerfile.db, Migrations-Reihenfolge.
- Risk: Gering — Init-Scripts laufen nur beim ersten DB-Start. Die erste Onboarding-Hetzner-Instanz wurde frisch aufgesetzt; Blueprint-Stack laeuft separat, ist nicht betroffen.
- Rollback Notes: Nicht vorgesehen. Falls spaeter Blueprint-Tabellen im Onboarding-Datenmodell benoetigt werden, erfolgt das ueber explizite Migrations im `/sql/migrations/`-Ordner.

### MIG-005 — Rolle tenant_owner -> tenant_admin bereinigt (SLC-002)
- Date: 2026-04-15
- Scope:
  - `sql/migrations/026_rename_tenant_owner_to_admin.sql` — fix-forward-Migration: (1) `UPDATE profiles SET role='tenant_admin' WHERE role='tenant_owner'` idempotent (auf Hetzner UPDATE 0, weil DB leer), (2) CHECK-Constraint `profiles_role_check` ohne `tenant_owner` neu gesetzt, (3) 6 RLS-Policies der Capture-Tabellen aus Migration 022 (capture_session_tenant_read, capture_session_tenant_admin_write, block_checkpoint_tenant_read, block_checkpoint_tenant_admin_write, knowledge_unit_tenant_read, validation_layer_tenant_read) gedroppt und ohne `tenant_owner` neu angelegt. Zusaetzlich in den 2 tenant_admin_write-Policies das IN-Set auf reinen Gleich-Vergleich `= 'tenant_admin'` reduziert (DEC-010-konform: nur tenant_admin, nicht tenant_member, darf schreiben).
  - `sql/schema.sql` — CHECK-Constraint auf `profiles.role` auf kanonische 3 Werte reduziert (`strategaize_admin`, `tenant_admin`, `tenant_member`). Init-Script-Parity.
  - `src/app/api/tenant/runs/[runId]/feedback/route.ts` — Kommentar bereinigt, der `tenant_owner` erwaehnte. Die Route selbst ist Blueprint-Legacy (ISSUE-008) und bleibt bis zum Cleanup-Slice bestehen.
- Reason: Umsetzung von DEC-010 (kanonisches Rollen-Naming) + SLC-002-Acceptance. Entfernt den Blueprint-Erbe-Wert `tenant_owner` aus der aktiven DB und aus dem Init-Script.
- Affected Areas: Auth-Rollen-Enum, Profiles-CHECK, RLS-Policies der 4 tenant-scoped Capture-Tabellen, Init-Scripts.
- Risk: Gering. UPDATE ist idempotent (0 Zeilen, weil noch keine `tenant_owner`-User existieren). DROP+CREATE der Policies im BEGIN/COMMIT — atomar. JWT-Refresh-Randbedingung als ISSUE-007 dokumentiert.
- Rollback Notes: Manuell: CHECK wieder auf Blueprint-Enum erweitern, Policies aus Migration 022 neu laufen lassen. Nicht als automatisches Reverse-Script bereitgestellt, da V1 keinen Rollback-Pfad fuer diese Bereinigung vorsieht.

### MIG-006 — SLC-002b Demo-Tenant-Seed (Migration 027)
- Date: 2026-04-16
- Scope:
  - `sql/migrations/027_seed_demo_tenant.sql` — 1-Zeilen-INSERT in `public.tenants` mit fester UUID `00000000-0000-0000-0000-0000000000de`, Name "Demo Onboarding GmbH", Sprache `de`. `ON CONFLICT (id) DO NOTHING` -> idempotent.
  - Migration via SSH + base64 auf Hetzner-Onboarding-DB-Container ausgefuehrt (User `postgres`, nicht `supabase_admin`).
  - Auth-User-Seed (strategaize_admin + demo tenant_admin) NICHT als Migration, sondern via `scripts/seed-admin.mjs` (native fetch, Supabase Admin-API, idempotent). Das Script wurde per `docker cp` in den laufenden app-Container injiziert und erfolgreich ausgefuehrt, nachdem ein Redeploy (Commit `0ad79f2`) `scripts/` und spaeter `aee25f4` die finale fetch-Variante bereitgestellt hat.
- Reason: Umsetzung von SLC-002b. DEC-011 trennt Tenant-Row (public-Schema, versionierte Migration) von Auth-User-Seed (operativer Zustand ueber RUNBOOK).
- Affected Areas: `public.tenants` (+1 Zeile), `auth.users` (+2 Zeilen ueber Admin-API), `public.profiles` (+2 Zeilen ueber handle_new_user-Trigger + Profile-Reconcile).
- Risk: Gering. INSERT idempotent, UUID-Konvention verhindert Konflikte mit echten Tenants (`gen_random_uuid` liefert nie Zero-Prefix). Script bricht bei fehlenden ENV-Variablen mit Exit-Code 1 ab.
- Rollback Notes:
  - Tenant-Row: `DELETE FROM public.tenants WHERE id = '00000000-0000-0000-0000-0000000000de';` (Cascade loescht Profile + Capture-Children).
  - Auth-User: `DELETE FROM auth.users WHERE email IN ('admin@...', 'demo-admin@...');` oder ueber `supabase.auth.admin.deleteUser(id)` via Node-Repl. Cascade loescht Profile-Rows.

### MIG-007 — SLC-002d Drop owner_profiles (Migration 028)
- Date: 2026-04-16
- Scope:
  - `sql/migrations/028_drop_owner_profiles.sql` — `DROP TABLE IF EXISTS owner_profiles CASCADE` (idempotent). BEGIN/COMMIT-Wrapper.
  - `sql/migrations/012_owner_profiles.sql` — Header-Kommentar "DEPRECATED by 028" hinzugefuegt, Content unveraendert (Historie).
  - `sql/migrations/014_owner_profiles_grant_authenticated.sql` — Header-Kommentar "DEPRECATED by 028". owner_profiles-GRANT obsolet, run_memory-GRANT-Teil dieser Migration bleibt implizit relevant durch andere Wege.
- Reason: SLC-002d Blueprint-Legacy-UI-Cleanup. Zusammen mit UI- und API-Deletions wird die Blueprint-`owner_profiles`-Tabelle aus dem DB-Pfad entfernt, damit Fresh-Deploys konsistent bleiben.
- Affected Areas: DB-Schema (owner_profiles-Tabelle + RLS-Policies + GRANTs durch CASCADE entfernt). Null Zeilen impactiert — Tabelle existierte auf Hetzner nicht (Migrations 012 + 014 nie im Onboarding-Runner aufgenommen).
- Risk: Gering. DROP IF EXISTS CASCADE ist idempotent. Auf Hetzner 2026-04-16 via `docker exec -i supabase-db-... psql -U postgres -d postgres` ausgefuehrt — Ergebnis: `NOTICE: table "owner_profiles" does not exist, skipping`. No-Op aber jetzt dokumentiert als Teil des Migrations-Pfades.
- Rollback Notes: Keine Rollback-Migration vorgesehen. Falls owner_profiles-Tabelle in V2+ template-spezifisch wieder eingefuehrt wird, erfolgt das ueber neue Migration mit angepasstem Schema — nicht durch Re-Enable von Migration 012.

### MIG-008 — SLC-003 Seed Exit-Readiness Template (Migration 029)
- Date: 2026-04-17
- Scope:
  - `sql/migrations/029_seed_exit_readiness_template.sql` — INSERT template `exit_readiness` v1.0.0 mit vollstaendigem `blocks`-JSONB (9 Bloecke A-I, 73 Fragen). `ON CONFLICT (slug) DO NOTHING` -> idempotent.
  - Content portiert aus Blueprint V3.4 `scripts/catalog-v1.0.json` via Extraction-Script `scripts/port-exit-readiness-from-blueprint.ts`.
  - Seed-Daten als JSON unter `data/seed/exit-readiness-v1.0.0.json` committed.
  - Block-Struktur: id, key, title (de/en/nl), description, order, required, weight, questions[]. Question-Struktur: id, frage_id, text, ebene, unterbereich, position, owner_dependency, deal_blocker, sop_trigger, ko_hart, ko_soft.
  - Migration via SSH + base64 auf Hetzner-Onboarding-DB-Container ausgefuehrt (User `postgres`). Ergebnis: INSERT 0 1.
  - Verifikation: `SELECT slug, version, jsonb_array_length(blocks) FROM template WHERE slug = 'exit_readiness'` -> `exit_readiness | 1.0.0 | 9`. Fragen-Count pro Block geprueft und korrekt (A:10, B:11, C:13, D:10, E:7, F:5, G:5, H:6, I:6 = 73).
- Reason: Umsetzung von SLC-003. Erstes Template fuer die Onboarding-Plattform. Content-Freeze aus Blueprint V3.4, keine weiteren Blueprint-Updates erwartet.
- Affected Areas: `public.template` (+1 Zeile mit ~26KB JSONB).
- Risk: Gering. INSERT idempotent. Keine Schema-Aenderung, nur Daten-Seed.
- Rollback Notes: `DELETE FROM public.template WHERE slug = 'exit_readiness';`

### MIG-004 — Onboarding-Hetzner-Deploy SLC-001 (erfolgreich)
- Date: 2026-04-15
- Scope:
  - Coolify-Resource `bwkg80w04wgccos48gcws8cs` (Projekt "strategaize onboarding plattform") erstmalig deployed auf Server 159.69.207.29 (CPX62).
  - Resultierender Stack (10 Container, UUID-Prefix `bwkg80w04wgccos48gcws8cs`): app (Next.js), supabase-db/auth/rest/storage/realtime/kong/meta/studio, whisper.
  - Init-Scripts (`01_schema`, `02_functions`, `03_rls`) + Migrations (021, 022, 023) ausgefuehrt via `docker exec psql -f`. Resultat: 7 Tabellen in public-Schema, 16 RLS-Policies, 4 Helper-Funktionen, 1 Trigger auf auth.users, 3 updated_at-Trigger auf Capture-Tabellen.
  - App unter `https://onboarding.strategaizetransition.com/login` erreichbar (HTTP 200, 30 KB Render, Title "StrategAIze Kundenplattform").
- Reason: SLC-001 MT-6 — Deploy-Schritt der SLC-001-Implementierung (MT-1..MT-4 waren 2026-04-14 fertig, MT-6 wurde an Hostname-Kollision abgebrochen).
- Affected Areas: Hetzner-Server 159.69.207.29, Coolify, DNS-Entry `onboarding.strategaizetransition.com`, Let's-Encrypt-Cert.
- Risk: Gering — erstdeploy, keine Bestandskunden. Key-Konsistenz (JWT_SECRET vs ANON/SERVICE_ROLE) via Login-Rendering verifiziert (kein 401/403).
- Rollback Notes: `docker compose down -v` fuer Resource-Prefix `bwkg80w04wgccos48gcws8cs` entfernt Container + Volumes. DNS-Entry + Coolify-Resource-Konfiguration bleiben fuer Re-Deploy bestehen.

### MIG-010 — SLC-008 Teil B: Queue-RPCs + Cost-Ledger + Iterations-Log (Migration 035)
- Date: 2026-04-18
- Scope:
  - `035_ai_queue_rpcs_and_logging.sql` — 2 neue Tabellen (`ai_cost_ledger`, `ai_iterations_log`), 4 neue RPCs (`rpc_claim_next_ai_job_for_type`, `rpc_complete_ai_job`, `rpc_fail_ai_job`, `rpc_bulk_import_knowledge_units`). RLS-Policies fuer beide Tabellen (admin full + tenant read). GRANTs fuer service_role.
- Reason: SLC-008 Teil B Worker braucht SKIP LOCKED Claim-Loop, Kosten-Tracking und Iterations-Logging fuer den Multi-Agent Analyst+Challenger Loop.
- Affected Areas: AI-Queue-System, Worker-Pipeline, Kosten-Reporting
- Risk: Gering — neue Tabellen und Funktionen, keine Aenderung an bestehenden.
- Rollback Notes: `DROP FUNCTION rpc_claim_next_ai_job_for_type; DROP FUNCTION rpc_complete_ai_job; DROP FUNCTION rpc_fail_ai_job; DROP FUNCTION rpc_bulk_import_knowledge_units; DROP TABLE ai_iterations_log; DROP TABLE ai_cost_ledger;`

### MIG-009 — SLC-008 Teil A: session_memory + capture_events (Migrations 033+034)
- Date: 2026-04-18
- Scope:
  - `033_session_memory.sql` — neue Tabelle `session_memory` (session_id, memory_text, version, updated_at), RLS SELECT fuer Tenant, GRANT fuer service_role
  - `034_capture_events.sql` — neue Tabelle `capture_events` (session_id, tenant_id, block_key, question_id, client_event_id, event_type, payload, created_by, created_at), Indexes, RLS SELECT+INSERT fuer Tenant
- Reason: SLC-008 Teil A (Blueprint Chat-Flow) braucht Session-Memory fuer KI-Kontext-Kontinuitaet und Event-basierte Antwort-Speicherung (wie Blueprint question_events).
- Affected Areas: Capture-Session-Workflow, KI-Chat-API, Questionnaire-UI
- Risk: Gering — neue Tabellen, keine Aenderung an bestehenden.
- Rollback Notes: `DROP TABLE session_memory; DROP TABLE capture_events;`

### MIG-012 — SLC-012 error_log-Tabelle (Migration 039)
- Date: 2026-04-18
- Scope: Neue Tabelle `error_log` (id, level, source, message, stack, metadata, user_id, created_at). RLS aktiv — nur strategaize_admin kann lesen. service_role schreibt (bypasses RLS). Index auf created_at DESC. GRANT ALL TO service_role.
- Reason: logger.ts schrieb seit V1-Deploy in error_log, aber die Tabelle existierte nie in der Onboarding-DB (Legacy-Migration 005 wurde nie ausgefuehrt). ISSUE-013.
- Affected Areas: Observability, Error-Logging, /api/admin/errors
- Risk: Gering — neue Tabelle, keine Aenderung an bestehenden Objekten.
- Rollback Notes: `DROP TABLE IF EXISTS error_log CASCADE;`

### MIG-013 — V2 Geplante Migrationen
- Date: 2026-04-19
- Scope:
  - `040_orchestrator_extensions.sql` — quality_report JSONB-Spalte auf block_checkpoint, feature-Spalte auf ai_cost_ledger, neue CHECK-Values fuer block_checkpoint.checkpoint_type (backspelling_recondense)
  - `041_gap_question.sql` — Neue Tabelle gap_question mit RLS + Indexes + GRANTs
  - `042_sop.sql` — Neue Tabelle sop mit RLS + Indexes + GRANTs
  - `043_evidence_tables.sql` — Neue Tabellen evidence_file + evidence_chunk mit RLS + Indexes + GRANTs
  - `044_evidence_storage_bucket.sql` — Supabase Storage Bucket 'evidence' mit Policies
  - `045_template_v2_fields.sql` — ALTER template ADD sop_prompt + owner_fields JSONB-Spalten
  - `046_seed_demo_template.sql` — INSERT Demo-Template "Mitarbeiter-Wissenserhebung" (4-5 Bloecke)
  - `047_rpc_orchestrator_and_gaps.sql` — RPCs fuer Orchestrator-Report speichern, Gap-Questions schreiben, Gap-Answers verarbeiten
  - `048_rpc_sop_generation.sql` — RPCs fuer SOP erstellen/aktualisieren
  - `049_rpc_evidence_processing.sql` — RPCs fuer Evidence-Chunk-Schreibung und Mapping-Bestaetigung
- Reason: V2 braucht 4 neue Tabellen, 1 Storage-Bucket, 2 Spalten-Erweiterungen, 1 Demo-Template-Seed und mehrere neue RPCs fuer die 6 neuen Features.
- Affected Areas: Core-DB-Schema, AI-Queue-System, Storage-Layer, Template-System
- Risk: Mittel — neue Tabellen + Spalten sind additiv (kein DROP/ALTER bestehender Tabellen). Storage-Bucket-Erstellung via SQL auf Supabase-internal Schema (storage.buckets) muss getestet werden.
- Rollback Notes: Alle Migrationen sind idempotent konzipiert (IF NOT EXISTS). Rollback: DROP der neuen Tabellen, ALTER TABLE DROP COLUMN fuer Template-Erweiterungen, DELETE Storage-Bucket.

### MIG-011 — SLC-009 Debrief-RPCs (Migration 037)
- Date: 2026-04-18
- Scope:
  - `037_rpc_debrief_knowledge_unit.sql` — 2 neue RPCs:
    - `rpc_update_knowledge_unit_with_audit(uuid, jsonb, text, text)` — Atomic KU-Update (title/body/status) + validation_layer-Audit-Row. SECURITY DEFINER, prueft strategaize_admin-Rolle.
    - `rpc_add_knowledge_unit(uuid, text, text, text, text, text)` — Manuelles Hinzufuegen einer KU mit source='manual' (DEC-016). Sucht neuesten Checkpoint fuer Block. SECURITY DEFINER, prueft strategaize_admin-Rolle.
  - Beide RPCs GRANT EXECUTE TO authenticated (Rollencheck intern).
- Reason: SLC-009 Debrief-UI braucht atomare KU-Mutation mit Audit-Trail. Direkte INSERTs/UPDATEs ueber RLS waeren unsicher — alle Schreiboperationen laufen ueber RPCs mit expliziter Rollenvalidierung.
- Affected Areas: Debrief-Workflow, Knowledge-Unit-Editor, Validation-Layer-Audit
- Risk: Gering — neue Funktionen, keine Aenderung an bestehenden Tabellen oder RPCs.
- Rollback Notes: `DROP FUNCTION rpc_update_knowledge_unit_with_audit; DROP FUNCTION rpc_add_knowledge_unit;`

### MIG-014 — SOP-Tabelle + Template V2 Fields + SOP RPCs
- Date: 2026-04-19
- Scope: 3 Migrationen: (1) `042_sop.sql` — sop-Tabelle mit RLS (strategaize_admin Full, tenant_admin Read), Indexes, GRANTs. (2) `045_template_v2_fields.sql` — template.sop_prompt JSONB + template.owner_fields JSONB. (3) `048_rpc_sop.sql` — rpc_create_sop + rpc_update_sop RPCs + Exit-Readiness sop_prompt Content.
- Affected Areas: sop-Tabelle (neu), template-Tabelle (2 neue Spalten), 2 neue RPCs
- Reason: SLC-016 SOP Generation Backend (FEAT-012)
- Risk: Gering — neue Tabelle + neue Spalten, keine Aenderung an bestehenden Strukturen.
- Rollback Notes: `DROP TABLE sop; ALTER TABLE template DROP COLUMN sop_prompt, DROP COLUMN owner_fields; DROP FUNCTION rpc_create_sop; DROP FUNCTION rpc_update_sop;`

### MIG-015 — FEAT-016 Diagnose-Layer Geplante Migrationen
- Date: 2026-04-19
- Scope:
  - `050_block_diagnosis.sql` — Neue Tabelle `block_diagnosis` (id, tenant_id, capture_session_id, block_key, block_checkpoint_id, content JSONB, status CHECK draft/reviewed/confirmed, generated_by_model, cost_usd, created_by, timestamps). RLS: strategaize_admin Full, tenant_admin Read eigener Tenant. Indexes auf (session_id, block_key) und (checkpoint_id). GRANTs fuer authenticated + service_role. updated_at-Trigger.
  - `051_template_diagnosis_fields.sql` — ALTER TABLE template ADD COLUMN diagnosis_schema JSONB, ADD COLUMN diagnosis_prompt JSONB. UPDATE exit_readiness Template mit initialem diagnosis_schema (Subtopics pro Block + 13 Bewertungsfelder) und diagnosis_prompt (System-Prompt + Feld-Instruktionen).
  - `052_rpc_diagnosis.sql` — 3 neue RPCs: rpc_create_diagnosis (Worker schreibt Diagnose), rpc_update_diagnosis (Admin editiert Felder), rpc_confirm_diagnosis (Admin bestaetigt → status=confirmed). Alle SECURITY DEFINER mit internem Rollencheck.
- Affected Areas: block_diagnosis-Tabelle (neu), template-Tabelle (2 neue Spalten), 3 neue RPCs, Exit-Readiness-Template (diagnosis_schema + diagnosis_prompt Seed)
- Reason: FEAT-016 Diagnose-Layer Backend (DEC-022, DEC-023, DEC-024)
- Risk: Gering — neue Tabelle + neue Spalten, keine Aenderung an bestehenden Strukturen. Template-UPDATE ist idempotent (SET diagnosis_schema = ...). Exit-Readiness-Seed wird beim ersten Lauf geschrieben.
- Rollback Notes: `DROP TABLE block_diagnosis; ALTER TABLE template DROP COLUMN diagnosis_schema, DROP COLUMN diagnosis_prompt; DROP FUNCTION rpc_create_diagnosis; DROP FUNCTION rpc_update_diagnosis; DROP FUNCTION rpc_confirm_diagnosis;`

### MIG-016 — SLC-018 Evidence-Schema + Storage Bucket (Migrationen 043 + 044)
- Date: 2026-04-20
- Scope:
  - `043_evidence_tables.sql` — 2 neue Tabellen: `evidence_file` (12 Spalten, extraction_status CHECK, 3 Indexes, 3 RLS-Policies: admin_full + tenant_read + tenant_insert, GRANTs SELECT+INSERT fuer authenticated) und `evidence_chunk` (10 Spalten, mapping_status CHECK, 3 Indexes inkl. UNIQUE auf file+chunk_index, 3 RLS-Policies: admin_full + tenant_read + tenant_update, GRANTs SELECT+UPDATE fuer authenticated).
  - `044_evidence_storage_bucket.sql` — Supabase Storage Bucket 'evidence' (nicht public, 20 MB Limit, erlaubte MIME-Types: PDF, DOCX, TXT, CSV, ZIP). 3 Storage-Policies: evidence_insert (tenant-path-basiert), evidence_select (tenant + strategaize_admin), evidence_delete (nur strategaize_admin).
- Affected Areas: evidence_file-Tabelle (neu), evidence_chunk-Tabelle (neu), Supabase Storage (neuer Bucket)
- Reason: SLC-018 Evidence-Mode Infrastruktur (FEAT-013). Schema + Storage fuer Datei-Upload, Text-Extraktion und KI-Mapping.
- Risk: Gering — neue Tabellen und neuer Storage-Bucket, keine Aenderung an bestehenden Strukturen.
- Rollback Notes: `DROP TABLE evidence_chunk; DROP TABLE evidence_file; DELETE FROM storage.buckets WHERE id = 'evidence'; DELETE FROM storage.objects WHERE bucket_id = 'evidence';`

### MIG-018 — SLC-021 Demo-Template Mitarbeiter-Wissenserhebung (Migration 046)
- Date: 2026-04-20
- Scope: `046_seed_demo_template.sql` — INSERT template slug='mitarbeiter_wissenserhebung' v1.0.0 mit 5 Bloecken (30 Fragen), owner_fields (Abteilung, Position, Jahre im Unternehmen), HR-spezifischem sop_prompt. ON CONFLICT DO NOTHING (idempotent).
- Affected Areas: template-Tabelle (neuer Eintrag), Session-Erstellungs-UI (zeigt jetzt 2 Templates)
- Reason: SLC-021 Template-Switcher Proof-of-Concept — zweites Template fuer Multi-Template-Faehigkeit
- Risk: Gering — reiner INSERT, keine Schema-Aenderung
- Rollback Notes: `DELETE FROM template WHERE slug = 'mitarbeiter_wissenserhebung';`

### MIG-019 — SLC-026 Meeting Guide Schema (Migration 058)
- Date: 2026-04-22
- Scope: `058_meeting_guide.sql` — Neue Tabelle `public.meeting_guide` (10 Spalten: id, tenant_id, capture_session_id, goal, context_notes, topics JSONB, ai_suggestions_used, created_by, timestamps). UNIQUE(capture_session_id). 2 RLS-Policies (strategaize_admin Full, tenant_admin R+W eigener Tenant). 2 Indexes (session, tenant). GRANTs fuer authenticated + service_role. updated_at-Trigger.
- Affected Areas: meeting_guide-Tabelle (neu), V3 Dialogue-Mode Infrastruktur
- Reason: SLC-026 Meeting Guide Backend (FEAT-018, DEC-030). Basis fuer Meeting-Vorbereitung mit Themen, Leitfragen und Template-Block-Zuordnung.
- Risk: Gering — neue Tabelle, keine Aenderung an bestehenden Strukturen. NOTE: Expliziter `public.` Schema-Prefix erforderlich — search_path hat `storage` vor `public`.
- Rollback Notes: `DROP TABLE IF EXISTS public.meeting_guide CASCADE;`

### MIG-020 — SLC-028 Dialogue Session Backend (Migrationen 059-062)
- Date: 2026-04-22
- Scope:
  - `059_dialogue_session.sql` — Neue Tabelle `public.dialogue_session` (22 Spalten: id, tenant_id, capture_session_id, meeting_guide_id FK, jitsi_room_name UNIQUE, status CHECK 8 Werte, participant_a/b_user_id, recording_storage_path, recording_duration_s, transcript, transcript_model, summary JSONB, gaps JSONB, extraction_model, extraction_cost_usd, consent_a/b, started_at, ended_at, created_by, timestamps). 4 RLS-Policies (admin_full, tenant_read fuer admin+member, tenant_write fuer admin, tenant_update fuer admin). 3 Indexes (capture, tenant, status partial). GRANTs authenticated + service_role. updated_at-Trigger.
  - `060_capture_mode_dialogue.sql` — ALTER capture_session ADD capture_mode TEXT CHECK (NULL oder questionnaire/evidence/dialogue). ALTER knowledge_unit DROP+ADD source CHECK (7 Werte inkl. evidence + dialogue).
  - `061_recordings_bucket.sql` — Supabase Storage Bucket 'recordings' (private, 500 MB, video/audio MIME). 3 Storage-Policies (tenant-isolated insert+select, admin-only delete).
  - `062_rpc_dialogue.sql` — 5 RPCs: rpc_create_dialogue_session (Room-Name-Gen + Insert), rpc_update_dialogue_status (Transition-Validierung + Timestamps), rpc_save_dialogue_transcript, rpc_save_dialogue_extraction, rpc_update_dialogue_consent (Teilnehmer-spezifisch). Alle SECURITY DEFINER. GRANTs differenziert (transcript/extraction nur service_role).
- Affected Areas: dialogue_session-Tabelle (neu), capture_session (neue Spalte), knowledge_unit (CHECK erweitert), Storage (neuer Bucket), 5 neue RPCs
- Reason: SLC-028 Dialogue Session Backend (FEAT-019, DEC-025..030). Kompletttes Backend fuer Meeting-Session-Verwaltung, DSGVO-Consent, Recording-Storage und Pipeline-Vorbereitung.
- Risk: Gering — neue Tabelle + neue Spalte + neue RPCs. Keine Aenderung an bestehenden Daten. capture_mode ist nullable, bestehende Sessions bleiben unberuehrt. NOTE: public. Prefix auf allen Migrationen wegen search_path (IMP-103).
- Rollback Notes: `DROP TABLE IF EXISTS public.dialogue_session CASCADE; ALTER TABLE public.capture_session DROP COLUMN IF EXISTS capture_mode; ALTER TABLE public.knowledge_unit DROP CONSTRAINT knowledge_unit_source_check, ADD CONSTRAINT knowledge_unit_source_check CHECK (source IN ('questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual')); DELETE FROM storage.buckets WHERE id = 'recordings'; DROP FUNCTION IF EXISTS rpc_create_dialogue_session; DROP FUNCTION IF EXISTS rpc_update_dialogue_status; DROP FUNCTION IF EXISTS rpc_save_dialogue_transcript; DROP FUNCTION IF EXISTS rpc_save_dialogue_extraction; DROP FUNCTION IF EXISTS rpc_update_dialogue_consent;`

### MIG-017 — SLC-019 Evidence RPCs + Cost Ledger Update (Migration 054)
- Date: 2026-04-20
- Scope:
  - `054_rpc_evidence.sql` — 4 neue RPCs: rpc_create_evidence_chunks (Bulk-INSERT evidence_chunk mit ON CONFLICT UPSERT), rpc_confirm_evidence_mapping (SET confirmed_question_id + block_key), rpc_reject_evidence_mapping (SET rejected + NULL confirmed), rpc_update_evidence_file_status (SET extraction_status + error). Alle SECURITY DEFINER. GRANTs: service_role auf alle, authenticated auf confirm/reject.
  - ALTER ai_cost_ledger CHECK constraint: 'evidence_mapper' als neuer erlaubter Wert fuer role-Spalte.
- Affected Areas: evidence_chunk-Tabelle (RPCs), evidence_file-Tabelle (Status-RPC), ai_cost_ledger (CHECK constraint)
- Reason: SLC-019 Evidence-Extraction + Mapping braucht RPCs fuer Worker-seitige Chunk-Persistierung und User-seitige Mapping-Bestaetigung.
- Risk: Gering — neue Funktionen + CHECK-Erweiterung, keine Aenderung an bestehenden Tabellen/Daten.
- Rollback Notes: `DROP FUNCTION rpc_create_evidence_chunks; DROP FUNCTION rpc_confirm_evidence_mapping; DROP FUNCTION rpc_reject_evidence_mapping; DROP FUNCTION rpc_update_evidence_file_status;`

### MIG-021 — SLC-031 Nullable Checkpoint fuer Dialogue KUs (Migration 063)
- Date: 2026-04-22
- Scope: `063_nullable_checkpoint_for_dialogue.sql` — ALTER TABLE public.knowledge_unit ALTER COLUMN block_checkpoint_id DROP NOT NULL. Dialogue-KUs haben keinen Checkpoint (source='dialogue'). FK + CASCADE bleibt fuer bestehende Questionnaire-KUs.
- Affected Areas: knowledge_unit-Tabelle (Spalten-Constraint geaendert)
- Reason: SLC-031 Dialogue Extraction braucht KU-Import ohne block_checkpoint_id (Dialogue hat keine Block-Checkpoints, nur block_keys).
- Risk: Gering — nur NOT NULL wird entfernt, FK-Constraint bleibt. Bestehende KUs haben alle einen Checkpoint-Wert.
- Rollback Notes: `ALTER TABLE public.knowledge_unit ALTER COLUMN block_checkpoint_id SET NOT NULL;` (nur moeglich wenn keine NULL-Werte existieren)

### MIG-022 — SLC-031 QA Fix: Cost Ledger Dialogue Roles (Migration 064)
- Date: 2026-04-22
- Scope: `064_cost_ledger_dialogue_roles.sql` — ALTER ai_cost_ledger DROP+ADD CHECK constraint: 'dialogue_extractor' als neuer erlaubter Wert fuer role-Spalte.
- Affected Areas: ai_cost_ledger (CHECK constraint erweitert)
- Reason: SLC-031 QA deckte auf, dass der dialogue_extraction Worker mit role='dialogue_extractor' in ai_cost_ledger schreibt, aber der CHECK-Constraint diesen Wert nicht erlaubte. Ohne Fix wuerde jeder Extraction-Job nach KU-Import fehlschlagen.
- Risk: Gering — nur CHECK-Erweiterung, keine Schema-Aenderung.
- Rollback Notes: CHECK-Constraint auf vorherigen Stand zuruecksetzen (ohne 'dialogue_extractor').

### MIG-023 — V4 Geplante Migrationen (Zwei-Ebenen-Verschmelzung)
- Date: 2026-04-23
- Scope:
  - `065_employee_role.sql` — ALTER profiles.role CHECK additiv erweitert um `'employee'`. Init-Script-Parity in `sql/schema.sql`.
  - `066_employee_invitation.sql` — Neue Tabelle `employee_invitation` (12 Spalten: id, tenant_id, email, display_name, role_hint, invitation_token UNIQUE, invited_by_user_id, status CHECK pending/accepted/revoked/expired, accepted_user_id, expires_at, accepted_at, created_at). UNIQUE-Index auf (tenant_id, lower(email)) WHERE status='pending'. RLS: strategaize_admin Full + tenant_admin R+W eigener Tenant. GRANTs authenticated + service_role.
  - `067_capture_mode_v4.sql` — ALTER capture_session.capture_mode CHECK additiv um `'employee_questionnaire'` und `'walkthrough_stub'` erweitert. ALTER knowledge_unit.source CHECK additiv um `'employee_questionnaire'` erweitert. Bestehende Sessions/KUs unveraendert.
  - `068_bridge_tables.sql` — 2 neue Tabellen: `bridge_run` (14 Spalten: id, tenant_id, capture_session_id, template_id, template_version, status CHECK running/completed/failed/stale, triggered_by_user_id, source_checkpoint_ids uuid[], proposal_count, cost_usd, generated_by_model, error_message, created_at, completed_at) und `bridge_proposal` (15 Spalten: id, tenant_id, bridge_run_id, proposal_mode CHECK template/free_form, source_subtopic_key, proposed_block_title, proposed_block_description, proposed_questions JSONB, proposed_employee_user_id, proposed_employee_role_hint, status CHECK proposed/edited/approved/rejected/spawned, approved_capture_session_id, reviewed_by_user_id, reviewed_at, reject_reason, timestamps). RLS: strategaize_admin Full + tenant_admin R+W. Indexes auf bridge_run_id + tenant_status. updated_at-Trigger. Trigger-Funktion `bridge_run_set_stale` (AFTER INSERT auf block_checkpoint setzt juengsten completed bridge_run derselben capture_session_id auf stale).
  - `069_template_v4_fields.sql` — ALTER template ADD COLUMN `employee_capture_schema` JSONB + `handbook_schema` JSONB. UPDATE exit_readiness Template mit initialem `employee_capture_schema` (3-5 subtopic_bridges fuer Bloecke A-I, free_form_slot mit max_proposals=3) + `handbook_schema` (8-10 sections inkl. `operatives_tagesgeschaeft` fuer employee-KUs, cross_links auf subtopic-Ebene).
  - `070_handbook_snapshot.sql` — Neue Tabelle `handbook_snapshot` (14 Spalten: id, tenant_id, capture_session_id, template_id, template_version, status CHECK generating/ready/failed, storage_path, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, generated_by_user_id, error_message, timestamps). RLS: strategaize_admin Full + tenant_admin R+W. updated_at-Trigger.
  - `071_handbook_storage_bucket.sql` — Supabase Storage Bucket `handbook` (private, 50 MB Limit, MIME `application/zip`). 3 Storage-Policies (insert nur via service_role, select tenant_admin via foldername-Prefix + strategaize_admin Cross-Tenant, delete nur strategaize_admin).
  - `072_rpc_employee_invite.sql` — 3 RPCs: `rpc_create_employee_invitation` (tenant_admin, generiert 32-Byte Token, INSERT mit expiry+14d), `rpc_accept_employee_invitation(token, password)` (anon, validiert Token, ruft supabase.auth.admin.createUser via SECURITY DEFINER ueber Auth-Hook-Pattern, INSERT profile mit role='employee', UPDATE invitation status='accepted'), `rpc_revoke_employee_invitation` (tenant_admin, UPDATE status='revoked').
  - `073_rpc_bridge.sql` — 3 RPCs: `rpc_trigger_bridge_run(capture_session_id)` (tenant_admin, INSERT bridge_run mit status='running' + INSERT ai_jobs mit job_type='bridge_generation'), `rpc_approve_bridge_proposal(proposal_id, edited_payload jsonb)` (tenant_admin, UPDATE proposal status='approved' + INSERT capture_session mit capture_mode='employee_questionnaire' + owner_user_id=proposed_employee_user_id, UPDATE proposal status='spawned' mit approved_capture_session_id), `rpc_reject_bridge_proposal(proposal_id, reason)` (tenant_admin, UPDATE status='rejected').
  - `074_rpc_handbook.sql` — 2 RPCs: `rpc_trigger_handbook_snapshot(capture_session_id)` (tenant_admin, INSERT handbook_snapshot mit status='generating' + INSERT ai_jobs mit job_type='handbook_snapshot_generation'), `rpc_get_handbook_download_url(snapshot_id)` (tenant_admin, generiert signed Storage-URL, 5 Min Gueltigkeit).
  - `075_rls_employee_perimeter.sql` — RLS-Policy-Familie fuer `employee`-Rolle. Pro relevanter Tabelle EXPLIZITE Policies, die garantieren: employee sieht ausschliesslich (a) eigene capture_session-Rows (owner_user_id = auth.uid()), (b) eigene block_checkpoint, (c) eigene knowledge_unit, (d) eigene validation_layer-Eintraege. KEIN SELECT auf block_diagnosis, sop, handbook_snapshot, bridge_run, bridge_proposal, employee_invitation, andere capture_sessions, andere knowledge_units, andere tenants. Migration enthaelt explizite Verifikations-Queries als Kommentar (zur RLS-Test-Matrix-Vorbereitung).
- Reason: V4 (Zwei-Ebenen-Verschmelzung). 6 Features (FEAT-022..027): employee-Rolle + Bridge-Engine + Mitarbeiter-Capture + Capture-Mode-Hooks-Spike + Unternehmerhandbuch + Self-Service-Cockpit. Alle 7 Architektur-Entscheidungen (DEC-034..040) sind dokumentiert.
- Affected Areas: profiles (CHECK), capture_session (CHECK + Daten unveraendert), knowledge_unit (CHECK), template (2 neue Spalten), 5 neue Tabellen (employee_invitation, bridge_run, bridge_proposal, handbook_snapshot, neue Storage-Bucket-Policies), 8 neue RPCs, 1 neuer Trigger (bridge_run_set_stale), umfangreiche RLS-Erweiterung fuer employee-Sicht-Perimeter.
- Risk: Mittel. (1) RLS-Komplexitaet steigt (4 statt 3 Rollen, R16 — RLS-Test-Matrix mandatory in /qa). (2) Migration 075 (RLS-Perimeter) muss sehr sorgfaeltig sein — ein vergessener Default-Policy waere ein Datenleck. Mitigation: explizite Failure-Tests in /qa SLC-033 und SLC-037, mind. 32 Test-Calls (4 Rollen × 8 Tabellen) mit erwarteten Permission-Errors fuer employee. (3) Trigger `bridge_run_set_stale` muss idempotent und konfliktfrei sein — Test mit konkurrenten Block-Submits. (4) `rpc_accept_employee_invitation` haengt von Supabase Auth-Admin-Pattern ab — Implementierung in SLC-034 muss DEC-011-Pattern folgen (kein direkter INSERT in auth.users via Migration; RPC orchestriert ueber bestehenden Auth-Endpoint).
- Rollback Notes: Alle Migrationen idempotent konzipiert (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS). Rollback-Reihenfolge umgekehrt: DROP FUNCTION (075→072), DELETE Storage-Bucket (071), DROP TABLE handbook_snapshot/bridge_proposal/bridge_run/employee_invitation, ALTER template DROP COLUMN handbook_schema/employee_capture_schema, ALTER capture_session/knowledge_unit CHECK auf V3-Stand zuruecksetzen, ALTER profiles.role CHECK auf 3 Werte zuruecksetzen. Bestehende V1-V3-Daten bleiben unberuehrt.
- Progress 2026-04-24 (SLC-033 done): 8 Migrationen-Files (`065-071`, `075`) geschrieben, committet, auf Hetzner via `sql-migration-hetzner.md`-Pattern (base64 + `psql -U postgres`) idempotent angewandt. Verifikation durch `/qa SLC-033` (RPT-073): AC-1..AC-7 PASS, volle Test-Suite 130 passed | 34 todo | 0 failed. Migration 065 wurde im `/qa`-Run gefixt (`CREATE OR REPLACE FUNCTION public.handle_new_user()` explizit — ohne Schema-Prefix landete die Funktion in `storage.handle_new_user` wegen search_path, IMP-120). Zusaetzlich: Migration 065 hebt auch die Whitelist in `handle_new_user()` um `'employee'` (Deviation-Rule 2 — der Auth-Trigger wuerde sonst `rpc_accept_employee_invitation` in SLC-034 blockieren). `sql/schema.sql` und `sql/functions.sql` Init-Script-Parity gemacht (DEC-002). RPC-Migrationen `072_rpc_employee_invite.sql`, `073_rpc_bridge.sql`, `074_rpc_handbook.sql` folgen in SLC-034/035/039.
- Progress 2026-04-24 (SLC-034 done): `072_rpc_employee_invite.sql` geschrieben mit 3 RPCs, alle `CREATE OR REPLACE FUNCTION public.rpc_*` mit explizitem Schema-Prefix (IMP-120). Auf Hetzner idempotent appliziert — `pg_proc`-Check bestaetigt alle 3 RPCs in `public`-Schema. Abweichung zum urspruenglichen MIG-023-Scope: Statt `rpc_accept_employee_invitation(token, password)` (Client-facing, anon-callable) ist nun `rpc_accept_employee_invitation_finalize(invitation_id, accepted_user_id)` implementiert — wird nur von Server-Action nach erfolgreichem `supabase.auth.admin.createUser` aufgerufen (DEC-011-Pattern strikt). Server-Action uebernimmt Token-Validierung, Auth-User-Creation und Rollback-on-Fail. GRANT finalize-RPC NUR an service_role, create + revoke an authenticated. Idempotenz: finalize mit selber user_id = NO-OP success; mit anderer user_id = `already_accepted_by_other`. RPC-Test-Suite `src/__tests__/rpc/employee-invitation-rpc.test.ts` mit 13 Testfaellen geschrieben (TDD-Strikt), Test-Run auf Server delegiert an /qa SLC-034.
- Progress 2026-04-24 (SLC-034 RELEASED als REL-007, Deploy-Commit 82c987e): Migration 072 in Produktion seit 2026-04-24. User-Browser-End-to-End-Smoke bestaetigt: Einladung via UI → E-Mail zugestellt → Link oeffnet Passwort-Form → Submit erzeugt auth.users-Row + profile (role='employee') + markiert Invitation accepted → Auto-Login → /employee-Dashboard. Qa-Phase-1 via curl PASS (RPT-077) fuer die 4 Token-Page-Szenarien (valid/expired/revoked/accepted). Naechste Migrationen: 073 (Bridge, SLC-035), 074 (Handbook, SLC-039).
- Progress 2026-04-25 (SLC-035 MT-1..MT-3 done, Backend-Kern committed): `073_rpc_bridge.sql` geschrieben mit 3 RPCs (`rpc_trigger_bridge_run`, `rpc_approve_bridge_proposal`, `rpc_reject_bridge_proposal`), alle `CREATE OR REPLACE FUNCTION public.rpc_*` mit explizitem Schema-Prefix (IMP-120). Zusaetzliche Migration `073b_cost_ledger_bridge_role.sql` (NICHT im urspruenglichen MIG-023-Scope) erweitert `ai_cost_ledger.role` CHECK-Constraint additiv um `'bridge_engine'` — analog zu MIG-022 (dialogue_extractor). Beide Migrationen via `sql-migration-hetzner.md`-Pattern (base64 + `psql -U postgres`) auf Hetzner idempotent appliziert. Verifikation per `pg_proc` + CHECK-Constraint-Inspect. Worker-Code (Prompt-Builder, Output-Parser, BedrockCaller-Adapter, handle-bridge-job) committed mit 53 neuen Tests (19 RPC-Integration + 34 Unit), Suite 197/197 PASS auf Coolify-DB. Commits: 3226068 (Migration 073), 5c3f5ff (Worker-Skelett), 26086b8 (Migration 073b + Cost-Ledger-Fix), bc636a3 (Slice-Revert auf Block-Granularitaet — siehe IMP-126). Offen: MT-4 (Worker-Dispatcher-Registrierung), MT-5 (Stale-E2E-Test), MT-6/7 (Tests + RECORD-Update), `/qa` SLC-035, `074_rpc_handbook.sql` (Handbook, SLC-039). Naechste Migration: 074 in SLC-039.

### MIG-024 — RLS-Gap-Fix: tenant_admin liest Tenant-Profiles (Migration 076)
- Date: 2026-04-25
- Scope: Neue RLS-Policy `tenant_admin_select_tenant_profiles` auf `public.profiles`. FOR SELECT, USING `auth.user_role()='tenant_admin' AND tenant_id=auth.user_tenant_id()`. READ-ONLY auf fremde profiles. Identisch zum Pattern von bridge_run_tenant_admin_rw.
- Reason: Live-Smoke SLC-036 deckte auf, dass tenant_admin die Profile-Rows seiner Mitarbeiter NICHT lesen konnte (nur 2 vorhandene Policies: admin_full_profiles fuer strategaize_admin + user_select_own_profile fuer eigenen Profile-Match). Folge: leere Mitarbeiter-Liste in /admin/team und /admin/bridge Edit-Dialog. Bridge-ProposalCards zeigten "Noch nicht zugeordnet" trotz gesetzter proposed_employee_user_id. Siehe ISSUE-023.
- Affected Areas: `public.profiles` RLS-Layer. Indirect: /admin/team, /admin/bridge.
- Risk: Niedrig. Additive Policy, READ-ONLY, tenant-isoliert. Kein Datenleck-Risiko.
- Rollback Notes: `DROP POLICY IF EXISTS tenant_admin_select_tenant_profiles ON public.profiles;` — danach faellt Mitarbeiter-Listing in tenant_admin-UIs zurueck auf "leer".
- Live-Deploy: 2026-04-25 via base64-pipe + `psql -U postgres` auf Onboarding-Server (159.69.207.29). Verifiziert via pg_policy-Inspect.

### MIG-025 — auth-Schema USAGE-Grant fuer authenticated/anon (Migration 077)
- Date: 2026-04-25
- Scope: `GRANT USAGE ON SCHEMA auth TO authenticated, anon` (idempotent). Standard-Supabase-Setup, das auf der Onboarding-DB nicht gesetzt war.
- Reason: Direkt nach MIG-024 Live-Smoke deutete das Symptom auf einen RLS-Bug hin — der Test als authenticated-Role + JWT-Claims konnte `auth.user_role()` nicht aufrufen ("permission denied for schema auth"). Verifiziert: `SELECT nspacl FROM pg_namespace WHERE nspname='auth'` ergab `{supabase_auth_admin=UC/supabase_auth_admin}` ohne authenticated/anon. Ohne USAGE konnten Cross-Schema-Function-Calls in Policy-Expressions stillschweigend FALSE evaluieren, was die MIG-024-Policy effektiv lahm legte. Nach GRANT USAGE: Test-Pfad als authenticated demo-admin liefert `auth.user_role()='tenant_admin'` und neue Policy greift, employee-Liste sichtbar.
- Affected Areas: Alle RLS-Policies, die `auth.user_role()` oder `auth.user_tenant_id()` aufrufen. Indirect: `/admin/team` Aktive-Mitarbeiter, `/admin/bridge` Edit-Dialog Mitarbeiter-Dropdown, ProposalCard Mitarbeiter-Anzeige.
- Risk: Niedrig. USAGE auf Schema ist read-only-Reference und Standard-Supabase-Konfiguration. EXECUTE-Privileges auf einzelne Funktionen waren bereits gesetzt (`auth.uid`, `auth.user_role`, `auth.user_tenant_id`).
- Rollback Notes: `REVOKE USAGE ON SCHEMA auth FROM anon, authenticated;` — bricht alle Auth-abhaengigen RLS-Policies wieder. NICHT empfohlen.
- Live-Deploy: 2026-04-25 direkt im Diagnose-Pfad applied + danach als idempotente Migration 077 nachgeschrieben (sql/migrations/077_grant_auth_schema_usage.sql). Verifiziert via `SELECT nspacl FROM pg_namespace`.
- Lesson learned: Bei Self-hosted-Supabase Onboarding pruefen, ob `nspacl` auf `auth` `authenticated=U/...` enthaelt. Andernfalls funktionieren RLS-Policies mit Cross-Schema-Function-Calls still nicht. Sollte Teil eines Bootstrap-Health-Checks werden.

### MIG-026 — R16-Vervollstaendigung: block_diagnosis + sop tenant_admin-only (Migration 078)
- Date: 2026-04-26
- Scope: Beide V2-Policies `block_diagnosis_tenant_read` und `sop_tenant_read` (FOR SELECT, USING `tenant_id = auth.user_tenant_id()` ohne Rollen-Check) gedroppt und durch `block_diagnosis_tenant_admin_read` + `sop_tenant_admin_read` ersetzt mit `auth.user_role() = 'tenant_admin' AND tenant_id = auth.user_tenant_id()`.
- Reason: /qa SLC-037 Phase 2 (RLS-Tests gegen Coolify-DB) deckte auf, dass die V2-tenant_read-Policies tenant_member UND employee SELECT in eigenem Tenant erlaubten — Verstoss gegen Q27 ("Employee sieht die resultierende Diagnose NICHT") und SLC-037 RLS-Pflicht-Gate ("liefert 0 rows"). Migration 075 hatte capture_session/block_checkpoint/knowledge_unit/validation_layer auf das tenant_admin-rw-Pattern gehoben, aber block_diagnosis + sop uebersehen — Pattern-Drift.
- Affected Areas: `public.block_diagnosis` + `public.sop` SELECT-Pfad. Indirect: alle tenant_member+employee Reads dieser Tabellen. Workers/Server-Code nutzt createAdminClient (service_role, RLS-Bypass) — kein Schreibpfad betroffen.
- Risk: Niedrig. Restriktive Policy-Aenderung. Keine bestehende UI nutzt tenant_member oder employee SELECT auf diese Tabellen (verifiziert via grep). Strategaize_admin hat weiterhin admin_full Policy.
- Rollback Notes: `DROP POLICY block_diagnosis_tenant_admin_read ON public.block_diagnosis; CREATE POLICY block_diagnosis_tenant_read ON public.block_diagnosis FOR SELECT USING (tenant_id = auth.user_tenant_id());` (analog fuer sop). Restituiert die V2-Permissivitaet — NICHT empfohlen, oeffnet R16-Leak.
- Live-Deploy: 2026-04-26 via base64-pipe + `psql -U postgres` auf Onboarding-Server (159.69.207.29) waehrend /qa SLC-037 angewandt. Verifiziert via `pg_policies`-Inspect: 4 Policies (admin_full + tenant_admin_read pro Tabelle). Test-Score danach: 46/46 RLS-Matrix gruen.
- Lesson learned (IMP-151): Bei Einfuehrung einer neuen Rolle MUSS jede bestehende `*_tenant_read`-Policy auf Rollen-Tightening geprueft werden. R16-Audit-Checkliste fuer V4-aehnliche-Migrationen ist ein /architecture-Pflicht-Schritt.

### MIG-027 — SLC-039 Handbuch-Snapshot RPCs (Migration 074)
- Date: 2026-04-27
- Scope: 2 neue plpgsql-Funktionen `rpc_trigger_handbook_snapshot(p_capture_session_id uuid)` (SECURITY DEFINER, INSERT handbook_snapshot status='generating' + INSERT ai_jobs job_type='handbook_snapshot_generation', returns jsonb {handbook_snapshot_id}) und `rpc_get_handbook_snapshot_path(p_snapshot_id uuid)` (SECURITY DEFINER, returns jsonb {storage_path, status, storage_size_bytes} fuer status='ready', sonst error). GRANT EXECUTE auf authenticated + service_role.
- Reason: SLC-039 MT-1 — V4 FEAT-026 Handbuch-Foundation (DEC-038 deterministisch, kein LLM). Trigger-RPC enqueued den Worker-Job, Path-RPC liefert dem UI-Layer den Storage-Pfad fuer signierte Download-URL-Generierung (Signing erfolgt nicht in plpgsql).
- Affected Areas: `public.handbook_snapshot` (INSERT-Pfad), `public.ai_jobs` (job_type='handbook_snapshot_generation'). Read-Pfad fuer Snapshot-Pfad-Lookup. Tenant-Isolation per `auth.user_tenant_id()`-Check, Cross-Tenant-Block fuer tenant_admin.
- Risk: Niedrig. Reine Function-Additions, keine bestehenden Tabellen veraendert. ai_jobs.job_type ist textuell ohne CHECK — neue String-Konstante darf eingefuegt werden ohne Migration der bestehenden Rows.
- Rollback Notes: `DROP FUNCTION IF EXISTS public.rpc_trigger_handbook_snapshot(uuid); DROP FUNCTION IF EXISTS public.rpc_get_handbook_snapshot_path(uuid);` — entfernt beide RPCs. Bestehende handbook_snapshot-Rows + ai_jobs-Rows bleiben unangetastet. Worker-Code-Pfad wuerde dann ohne RPC-Trigger ins Leere laufen — nur fuer Roll-Back-Szenario.
- Live-Deploy: 2026-04-27 via base64-pipe + `psql -U postgres` auf Onboarding-Server (159.69.207.29). Verifiziert via `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%handbook%';` -> 2 Eintraege.

### MIG-028 — V4.1 SLC-041 `block_review`-Tabelle + RLS + Backfill + Insert-Trigger (Migration 079, live)
- Date: 2026-04-28 (live deployed auf Hetzner Onboarding-DB als Teil von SLC-041 /backend)
- Scope: Neue Tabelle `public.block_review (id uuid PK, tenant_id uuid REFERENCES tenants, capture_session_id uuid REFERENCES capture_session, block_key text, status text DEFAULT 'pending' CHECK IN ('pending','approved','rejected'), reviewed_by uuid REFERENCES auth.users, reviewed_at timestamptz, note text, created_at timestamptz, updated_at timestamptz, UNIQUE (tenant_id, capture_session_id, block_key))`. Zwei Indizes: `idx_block_review_status_created` (partial, WHERE status='pending') fuer Cross-Tenant-Reviews-Sicht, `idx_block_review_tenant_status` fuer Pro-Tenant-Aggregation. RLS-Policies: SELECT fuer strategaize_admin (alle) + tenant_admin (own tenant); INSERT/UPDATE/DELETE nur strategaize_admin (Approval-Hoheit). Backfill-Step: `INSERT INTO block_review (tenant_id, capture_session_id, block_key, status) SELECT DISTINCT tenant_id, capture_session_id, block_key, 'approved' FROM knowledge_unit WHERE source='employee_questionnaire' ON CONFLICT (tenant_id, capture_session_id, block_key) DO NOTHING;` Trigger-Function `tg_block_review_pending_on_employee_submit()` ON INSERT in `capture_event` WHERE `payload->>'capture_mode' = 'employee_questionnaire'`: upsert `block_review` mit `status='pending'` (nur wenn noch kein Eintrag existiert — kein Re-Reset einer schon-approved Block).
- Reason: V4.1 FEAT-029 Berater-Review-Workflow (DEC-044 Block-Approval-Granularitaet, DEC-048 Backfill-Strategie, DEC-050 single-row Audit). Tabelle ist Single-Source-of-Truth fuer Berater-Approval, Worker-Pre-Filter im `handle-snapshot-job.ts` liest sie. Backfill stellt Backwards-Compat sicher (alle pre-V4.1 Bloecke = approved, neue ab V4.1-Deploy = pending). Insert-Trigger automatisiert das Erstellen pendender Reviews bei neuen Mitarbeiter-Submits.
- Affected Areas: Neue Tabelle `block_review`. RLS-Test-Matrix erweitert um diese Tabelle (4 Rollen × 1 Tabelle = mind. 8 zusaetzliche Test-Faelle, Pflicht in /qa SLC-041). Worker `src/workers/handbook/handle-snapshot-job.ts` bekommt Pre-Filter-Schritt via neuem Helper `loadApprovedBlockKeys()`. `capture_event`-Tabelle bekommt neuen INSERT-Trigger (passive, kein bestehender Code beeinflusst).
- Risk: Mittel. Backfill schreibt potenziell viele Rows in einem Migration-Run (geschaetzt <100 Rows pro V4-Tenant). Bei Hetzner-Live-Run via base64-pipe + `psql -U postgres` — Standard-Pattern (siehe MIG-027). Trigger-Function ist NEW, koennte bei Bug capture_event-INSERTs blockieren — Mitigation: Trigger als `ROW LEVEL TRIGGER` mit `EXCEPTION WHEN OTHERS THEN RAISE WARNING` (Soft-Fail), damit ein Bug im Trigger nicht den Mitarbeiter-Submit zerstoert. Worker-Pre-Filter ist additiv, alte Snapshots ohne `block_review`-Eintrag werden weiter funktional re-generiert (`loadApprovedBlockKeys` returns true bei fehlendem Eintrag).
- Rollback Notes: `DROP TRIGGER IF EXISTS tg_block_review_pending_on_employee_submit ON capture_event; DROP FUNCTION IF EXISTS tg_block_review_pending_on_employee_submit(); DROP TABLE IF EXISTS public.block_review CASCADE;` — entfernt Tabelle + Trigger + Function. Worker-Code-Pfad muss VOR DROP zurueckgerollt werden (Pre-Filter-Schritt entfernen) — ohne Tabelle wuerde Worker-Query fehlschlagen. Empfohlene Rollback-Reihenfolge: 1. Worker-Image revert auf pre-V4.1, 2. SQL-Drop, 3. Frontend-Revert.
- Live-Deploy: 2026-04-28 erfolgreich auf Onboarding-Server 159.69.207.29, Container `supabase-db-bwkg80w04wgccos48gcws8cs-173534197991`. Migration via base64-pipe + `psql -U postgres` (analog MIG-027). Backfill `INSERT 0 0` (keine pre-V4.1 employee_questionnaire-KUs auf der Live-DB). **Mid-Run-Fix:** GRANT-Pattern korrigiert von `GRANT SELECT TO authenticated` zu `GRANT ALL TO authenticated` (analog Migration 070), damit RLS-Policies den Schreibzugriff fuer strategaize_admin tatsaechlich freigeben. Verifikation: `\d block_review` zeigt Schema, 4 Policies, 4 Indizes (PK + UNIQUE + 2 Lookup), Trigger `tg_block_review_pending_on_employee_submit` auf capture_events. 12/12 RLS-Matrix-Tests gruen gegen Live-DB. Zusaetzlich: ALTER TABLE handbook_snapshot ADD COLUMN metadata jsonb DEFAULT '{}' fuer Worker-Audit-Counter.

### MIG-029 — V4.2 Self-Service Onboarding (`tenants.onboarding_wizard_*` + `reminder_log` + `user_settings`) (Migration 080, live)
- Date: 2026-04-30 (deployed in SLC-046 MT-1 — Variante A bestaetigt, Single-File `sql/migrations/080_v42_self_service.sql`)
- Scope: Atomar-Migration mit drei logischen Bloecken: **(1) ALTER TABLE public.tenants** ADD COLUMN `onboarding_wizard_state text NOT NULL DEFAULT 'pending' CHECK IN ('pending','started','skipped','completed')`, ADD COLUMN `onboarding_wizard_step integer NOT NULL DEFAULT 1 CHECK BETWEEN 1 AND 4`, ADD COLUMN `onboarding_wizard_completed_at timestamptz`. Plus partial Index `idx_tenants_wizard_state` WHERE state IN ('pending','started'). Backfill: `UPDATE tenants SET onboarding_wizard_state='completed' WHERE onboarding_wizard_state='pending'` (alle pre-V4.2 Tenants haben das Tool schon — Wizard waere unnoetig). **(2) CREATE TABLE public.reminder_log** mit Spalten `id uuid PK, tenant_id REFERENCES tenants ON DELETE CASCADE, employee_user_id REFERENCES auth.users ON DELETE CASCADE, reminder_stage text CHECK IN ('stage1','stage2'), sent_date date DEFAULT current_date, email_to text, status text DEFAULT 'sent' CHECK IN ('sent','failed','skipped_opt_out'), error_message text, created_at timestamptz, UNIQUE (employee_user_id, reminder_stage, sent_date)`. Index `idx_reminder_log_tenant_date` (tenant_id, sent_date DESC). RLS: SELECT fuer strategaize_admin (alle) + tenant_admin (own tenant). INSERT/UPDATE/DELETE nur via service_role (Cron-Endpoint). GRANT SELECT TO authenticated, GRANT ALL TO service_role. **(3) CREATE TABLE public.user_settings** mit Spalten `user_id PK REFERENCES auth.users ON DELETE CASCADE, reminders_opt_out boolean DEFAULT false, unsubscribe_token text DEFAULT encode(gen_random_bytes(32),'hex') UNIQUE, created_at, updated_at`. Trigger-Function `tg_create_user_settings()` (SECURITY DEFINER) ON INSERT IN auth.users: passiv-INSERT in user_settings ON CONFLICT DO NOTHING. Backfill: `INSERT INTO user_settings (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING`. RLS: SELECT/UPDATE OWN row (user_id=auth.uid()), strategaize_admin ALL. GRANT ALL TO authenticated.
- Reason: V4.2 FEAT-031 (Wizard) + FEAT-032 (Reminders) + FEAT-033 (In-App-Hilfe). DEC-053 Multi-Admin-Lock-Pattern via atomarem UPDATE-WHERE state='pending'. DEC-054 Reminder-Empfaenger nur Mitarbeiter — Cron-Filter. DEC-055 Werktage-Schedule via JS-Helper, kein DB-Logic. DEC-061 user_settings als eigene Tabelle (RLS-faehig, erweiterbar). MIG-029 enthaelt drei Bloecke in einem File, weil alle V4.2-Foundation und atomar deployt werden muessen — Worker-Pre-Filter aus V4.1 hatte das gleiche Pattern (4 Bloecke in MIG-028).
- Affected Areas: Bestehende `public.tenants`-Tabelle bekommt 3 neue NOT-NULL-Spalten mit Default (kein Bruch). Neue Tabellen `public.reminder_log` + `public.user_settings`. Neuer Trigger auf `auth.users` (passive, kein bestehender Code beeinflusst). RLS-Test-Matrix erweitert um beide neue Tabellen (4 Rollen × 2 Tabellen = mind. 8 zusaetzliche Test-Faelle, Pflicht in /qa SLC-048). Wizard-Server-Actions in `src/app/dashboard/wizard-actions.ts` arbeiten gegen `tenants.onboarding_wizard_*`.
- Risk: Mittel. Backfill auf `tenants` laeuft auf alle bestehenden Tenants (geschaetzt <50 Rows) — Standard-UPDATE. Backfill auf `user_settings` laeuft auf alle bestehenden auth.users (geschaetzt <100 Rows) — INSERT-with-token-default. Beide Backfills sind idempotent via ON CONFLICT bzw. WHERE-Filter. Trigger `tg_create_user_settings` ist passive (auf auth.users), koennte bei Bug auth.users-INSERT blockieren — Mitigation: SECURITY DEFINER + EXCEPTION-Block fuer Soft-Fail (analog tg_block_review_pending_on_employee_submit aus MIG-028). Migration via base64-pipe + `psql -U postgres` als root auf Hetzner-Container (Standard-Pattern aus rules/sql-migration-hetzner.md, MIG-027/MIG-028).
- Rollback Notes: `DROP TRIGGER IF EXISTS tg_create_user_settings_on_auth_users_insert ON auth.users; DROP FUNCTION IF EXISTS public.tg_create_user_settings(); DROP TABLE IF EXISTS public.user_settings CASCADE; DROP TABLE IF EXISTS public.reminder_log CASCADE; ALTER TABLE public.tenants DROP COLUMN IF EXISTS onboarding_wizard_state, DROP COLUMN IF EXISTS onboarding_wizard_step, DROP COLUMN IF EXISTS onboarding_wizard_completed_at; DROP INDEX IF EXISTS idx_tenants_wizard_state;` Rollback-Reihenfolge: 1. Coolify Cron-Job pausieren (sonst weitere Reminder-Versuche), 2. App-Image revert auf pre-V4.2 (Wizard-Server-Actions/HelpSheet/Cockpit-Card werden ignoriert), 3. SQL-Rollback (DROPs), 4. ENV CRON_SECRET wieder entfernen. Pre-V4.2-Stand bleibt voll funktional, weil V4.2 rein additiv ist.
- Live-Deploy: 2026-04-30 auf Hetzner-Onboarding-Server (159.69.207.29) als Variante A (Single-File 080_v42_self_service.sql) per base64-pipe + `psql -U postgres` (sql-migration-hetzner.md). Verifikation: `\d tenants` 3 neue Spalten + Index, `\d reminder_log` + `\d user_settings` Schemas + Policies aktiv. Backfills idempotent: tenants `UPDATE 1` (1 pre-V4.2 Tenant auf 'completed'), user_settings `INSERT 0 3` (3 bestehende auth.users → 64-char Token). Trigger live (verifiziert: smoke-test count=1, soft-fail-test auth.users-INSERT geht trotz simulated exception durch).

### MIG-030 — V4.4 BL-069 Umlaut-Backfill fuer Demo-Template (Migration 081, live)
- Date: 2026-05-05 (apply in /backend SLC-062 — Hetzner-Coolify, Apply + Idempotenz-Test PASS)
- Scope: Reine DML-Migration auf bestehender Tabelle `template`. Korrigiert ~41 Umlaut-Vorkommnisse (`ae`/`oe`/`ue`/`ss` → `ä`/`ö`/`ü`/`ß`) in den JSONB-Feldern `template.blocks` und `template.sop_prompt` fuer das einzige betroffene Demo-Template (`slug='mitarbeiter_wissenserhebung'`, aus 046_seed_demo_template.sql). Andere Templates werden nicht angefasst. (Pre-Audit erfasste 71 Vorkommnisse als suspect; 30 davon waren FALSE-POSITIVE — korrektes Deutsch wie *Wissen, Prozesse, passieren, Voraussetzung, Verbesserungen, Jahresabschluss, Lernquellen, Datenquellen, Wissensquellen, Wissenserhebung, Wissensmanagement, Wissenstransfer, Messbares, aktuell, aktuelle* + UUIDs/`success_criterion`. SLC-062 MT-1 Wortliste enthaelt nur 30 unique TRUE-POSITIVE-Worte → 25 Replace-Statements via Prefix-Sharing.)
- Reason: SLC-052 (V4.3) hat die Source-Datei `sql/migrations/046_seed_demo_template.sql` umlaut-konsistent gemacht, aber Daten-Edits in der Source-Datei haben keine Wirkung auf bereits in der Live-DB gestandenen Daten. Audit-Tool `scripts/audit-umlauts.mjs` zeigte 328 Vorkommnisse in der Source-Datei + 71 in Live-DB.
- Affected Areas: `template.blocks` (JSONB), `template.sop_prompt` (JSONB), nur Row mit `slug='mitarbeiter_wissenserhebung'`. Keine Schema-DDL-Aenderung. Keine FK-Implikation. Andere Tabellen unangetastet.
- Risk: Niedrig. Single-Row-UPDATE auf einer System-managed-Template-Row. Pre-Apply-Pflicht: Backup oder `\copy template TO 'pre-mig-030.csv'`. Falsche Wort-Klassifikation in der curated word-list wuerde semantisch falschen Replace bewirken (z.B. "neue" → "nü") — Mitigation: Wortliste wird in SLC-062 MT-1 aus echtem Audit-Output extrahiert + per-Wort manuell verifiziert.
- Rollback Notes: `\copy template FROM 'pre-mig-030.csv'` (Pre-Apply-Snapshot). Alternativ: SQL-Rollback-Migration mit reversem Mapping (`'würden' → 'wuerden'`, etc.) — aber unnoetig wenn Backup vorhanden.
- Format-Skizze (final in /backend SLC-062 MT-2):
  ```sql
  -- 081_v44_umlaut_backfill_demo_template.sql
  DO $migrate_umlauts$
  DECLARE
    v_blocks_text text;
    v_sop_text text;
  BEGIN
    SELECT blocks::text, sop_prompt::text 
    INTO v_blocks_text, v_sop_text
    FROM template 
    WHERE slug = 'mitarbeiter_wissenserhebung';
    
    -- Curated word-list aus audit-umlauts.mjs gegen Live-DB extrahiert (SLC-062 MT-1)
    v_blocks_text := replace(v_blocks_text, 'wuerden', 'würden');
    v_blocks_text := replace(v_blocks_text, 'wuerde', 'würde');
    v_blocks_text := replace(v_blocks_text, 'koennte', 'könnte');
    -- ... weitere Mappings
    
    v_sop_text := replace(v_sop_text, 'wuerden', 'würden');
    -- ... gleiche Mappings
    
    UPDATE template 
    SET 
      blocks = v_blocks_text::jsonb,
      sop_prompt = v_sop_text::jsonb 
    WHERE slug = 'mitarbeiter_wissenserhebung';
    
    RAISE NOTICE 'MIG-030: umlaut-backfill done for mitarbeiter_wissenserhebung template.';
  END $migrate_umlauts$;
  ```
  Apply per `sql-migration-hetzner.md`-Pattern: base64-Pipe + `psql -U postgres` ueber Coolify-Container. Verifikation: `node scripts/audit-umlauts-livedb.mjs` (SLC-062 MT-1 Helper, scant Live-DB-Dump-Files) → 0 TRUE-POSITIVE-Worte, 22 verbleibende FALSE-POSITIVE-Worte (Wissen/Prozesse/etc., korrektes Deutsch).
- Live-Deploy: 2026-05-05 auf Hetzner-Onboarding-Server (159.69.207.29) per base64-Pipe + `psql -U postgres` (sql-migration-hetzner.md). Pre-Apply-Backup CSV als `/opt/onboarding-plattform-backups/pre-mig-030_20260505_131019.csv` (14032 bytes, slug+id+blocks+sop_prompt). Apply-Output: `MIG-030 blocks md5 changed=t (6286be... → 0954...), sop_prompt md5 changed=t (5e6b... → 013d...), DO`. Post-Audit auf Live-DB: 22 unique suspect words / 33 occurrences — alle FALSE-POSITIVE (Wissen 9, Prozesse 3, Lernquellen 2, ..., müssen, Passwörter, Verbesserungsvorschläge inkl. Post-Replace-Strings die noch ss enthalten). **TRUE-POSITIVE post-apply: 0.** Idempotenz-Test (2. Apply): blocks+sop md5 stable (changed=f), no DML-Drift. Backup-Datei bleibt im /opt/onboarding-plattform-backups/ als Recovery-Point.

### MIG-031 — V5 Walkthrough-Mode Schema + Storage-Bucket (Migrations 082+083+084, live)
- Date: 2026-05-06 (Apply in /backend SLC-071 MT-1..MT-3 auf Hetzner Onboarding 159.69.207.29)
- Scope: Drei additive Migrations fuer V5-MVP. Keine Schema-Aenderung an bestehenden Tabellen ausser CHECK-Constraint-Erweiterungen, die rein additive Werte zulassen.
  - **Migration 082 — `082_v5_walkthrough_capture_mode.sql`**: erweitert `capture_session_capture_mode_check` um `'walkthrough'` (V4 hatte nur `'walkthrough_stub'` Spike). Erweitert `knowledge_unit_source_check` um `'walkthrough_transcript'`. Beide CHECK-Erweiterungen sind rueckwaerts-kompatibel — bestehende Rows bleiben gueltig.
  - **Migration 083 — `083_v5_walkthrough_session.sql`**: CREATE TABLE `walkthrough_session` mit FKs (tenant_id → tenants ON DELETE CASCADE, capture_session_id → capture_session ON DELETE CASCADE, recorded_by_user_id + reviewer_user_id → auth.users, transcript_knowledge_unit_id → knowledge_unit ON DELETE SET NULL). 4 Indizes (tenant, capture, recorded_by, partial pending_review). 3 RLS-Policies (SELECT/INSERT/UPDATE) entsprechend 4-Rollen-Matrix DEC-074. Hard-Cap 30min via `CHECK (duration_sec IS NULL OR duration_sec <= 1800)` (DEC-076).
  - **Migration 084 — `084_v5_walkthrough_storage_bucket.sql`**: INSERT INTO storage.buckets (`walkthroughs`, public=false, file_size_limit=524288000, allowed_mime_types=ARRAY['video/webm']) mit ON CONFLICT DO NOTHING (DEC-075). 3 Storage-RLS-Policies (insert/select/delete) entsprechend Tenant-Isolation per Pfad-Praefix.
- Reason: V5 erfordert eine eigene Walkthrough-Datenstruktur (DEC-074), produktiven `walkthrough` Capture-Mode (Loesung des V4-`walkthrough_stub`-Spike), und einen tenant-isolierten Storage-Bucket fuer Roh-Aufnahmen (R-V5-3 Privacy). Splitting in 3 Files erlaubt unabhaengiges Rollback (Bucket vs. Tabelle vs. CHECK-Erweiterung) und konsistente per-Migration-Verifikation.
- Affected Areas: 
  - `public.capture_session.capture_mode` CHECK (additive Erweiterung um `'walkthrough'`)
  - `public.knowledge_unit.source` CHECK (additive Erweiterung um `'walkthrough_transcript'`)
  - Neue Tabelle `public.walkthrough_session` mit RLS aktiviert
  - Neuer Storage-Bucket `walkthroughs` mit 3 Policies
  - Worker-Code: neuer Job-Handler `walkthrough_transcribe` (kein DDL, nur App-Code in /backend SLC-072)
  - RLS-Test-Matrix erweitert um `walkthrough_session` (4 Rollen × 4 Operationen = 16 Faelle, Pflicht in /qa SLC-074, SC-V5-4)
- Risk: Niedrig-Mittel. Migration 082 ist reine CHECK-Erweiterung (additive Werte, keine bestehenden Rows betroffen). Migration 083 ist Greenfield-Tabelle (keine Backfill-Notwendigkeit, keine FK-Konflikte mit bestehenden Daten — beim Apply-Zeitpunkt existieren keine `walkthrough`-Sessions). Migration 084 ist Bucket+Storage-Policy — Pre-Existenz-Pruefung durch ON CONFLICT bzw. CREATE POLICY IF NOT EXISTS. Apply-Pattern ist Standard `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres` ueber Coolify-Container). Pre-Apply-Pflicht: keine, da nur additive Strukturen — ein Backup vor jeder Migration ist trotzdem User-Standard.
- Rollback Notes: 
  - **082 Rollback**: `ALTER TABLE capture_session DROP CONSTRAINT capture_session_capture_mode_check; ALTER TABLE capture_session ADD CONSTRAINT capture_session_capture_mode_check CHECK (capture_mode IS NULL OR capture_mode IN ('questionnaire','evidence','dialogue','employee_questionnaire','walkthrough_stub'));` (gleichermassen fuer knowledge_unit_source_check ohne `'walkthrough_transcript'`). Voraussetzung: keine `capture_session` mit `capture_mode='walkthrough'` und keine `knowledge_unit` mit `source='walkthrough_transcript'` existiert (sonst CHECK schlaegt fehl).
  - **083 Rollback**: `DROP TABLE IF EXISTS public.walkthrough_session CASCADE;` (CASCADE entfernt FKs).
  - **084 Rollback**: `DELETE FROM storage.buckets WHERE id='walkthroughs';` (entfernt Bucket; Storage-Files muessen vorab via API geloescht werden, sonst orphan).
  - Rollback-Reihenfolge bei Komplett-Revert: 1. App-Image revert auf pre-V5 (Server Actions/UIs ignorieren walkthrough_session). 2. Coolify-Cleanup-Cron pausieren. 3. Storage-Files manuell entfernen (`supabaseAdmin.storage.from('walkthroughs').remove([...])`). 4. SQL-Rollback in Reihenfolge 084 → 083 → 082.
- Format-Skizze (final in /backend SLC-071 MT-1):
  ```sql
  -- 082_v5_walkthrough_capture_mode.sql (idempotent)
  ALTER TABLE public.capture_session
    DROP CONSTRAINT IF EXISTS capture_session_capture_mode_check;
  ALTER TABLE public.capture_session
    ADD CONSTRAINT capture_session_capture_mode_check
    CHECK (capture_mode IS NULL OR capture_mode IN (
      'questionnaire','evidence','dialogue',
      'employee_questionnaire','walkthrough_stub','walkthrough'
    ));
  ALTER TABLE public.knowledge_unit
    DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;
  ALTER TABLE public.knowledge_unit
    ADD CONSTRAINT knowledge_unit_source_check
    CHECK (source IN (
      'questionnaire','exception','ai_draft','meeting_final','manual',
      'evidence','dialogue','employee_questionnaire','walkthrough_transcript'
    ));
  ```
  ```sql
  -- 083_v5_walkthrough_session.sql (idempotent via IF NOT EXISTS)
  CREATE TABLE IF NOT EXISTS public.walkthrough_session (...full DDL siehe ARCHITECTURE.md V5-Sektion);
  CREATE INDEX IF NOT EXISTS idx_walkthrough_session_tenant ...;
  -- ... weitere Indizes
  ALTER TABLE public.walkthrough_session ENABLE ROW LEVEL SECURITY;
  -- 3 RLS-Policies (DROP IF EXISTS + CREATE)
  ```
  ```sql
  -- 084_v5_walkthrough_storage_bucket.sql (idempotent via ON CONFLICT)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('walkthroughs', 'walkthroughs', false, 524288000, ARRAY['video/webm'])
  ON CONFLICT (id) DO UPDATE SET
    public=EXCLUDED.public,
    file_size_limit=EXCLUDED.file_size_limit,
    allowed_mime_types=EXCLUDED.allowed_mime_types;
  -- 3 Storage-RLS-Policies (DROP IF EXISTS + CREATE)
  ```
  Apply per `sql-migration-hetzner.md`-Pattern in `/backend` SLC-071: base64-Pipe + `psql -U postgres` ueber Coolify-Container. Verifikation: `\dt walkthrough_session` zeigt Tabelle + 3 Policies, `SELECT * FROM storage.buckets WHERE id='walkthroughs'` liefert 1 Row, `\d capture_session` zeigt erweiterten CHECK.
- Live-Deploy: 2026-05-06 auf Hetzner-Onboarding-Server (159.69.207.29) per base64-Pipe + `psql -U postgres` (sql-migration-hetzner.md). Container `supabase-db-bwkg80w04wgccos48gcws8cs-141543149031`. Pre-Apply-Backup `/opt/onboarding-plattform-backups/pre-mig-031_20260506_064103.sql` (236.593 bytes, 7.524 Zeilen, schema-only). Apply-Reihenfolge 082 → 083 → 084, jede Migration einzeln verifiziert + idempotenz-getestet (Re-Apply 0 Drift).
  - **082 Apply-Output:** `NOTICE: MIG-031/082: capture_session.capture_mode CHECK extended with walkthrough; NOTICE: MIG-031/082: knowledge_unit.source CHECK extended with walkthrough_transcript; DO`. Verifikation: `pg_get_constraintdef` zeigt CHECK mit erwarteten 6 capture_modes (inkl. `walkthrough`) und 9 knowledge_unit-sources (inkl. `walkthrough_transcript`).
  - **083 Apply-Output:** Tabelle + 3 RLS-Policies + 4 Indizes + GRANTs + Trigger erstellt. Verifikation: 22 Columns, 3 Policies (`walkthrough_session_select|insert|update_review`), `relrowsecurity=t`, 4 Custom-Indizes + PKEY (5 total).
  - **084 Apply-Output:** Bucket `walkthroughs` (public=false, file_size_limit=524288000, allowed_mime_types={video/webm}) + 3 Storage-Policies (`walkthroughs_bucket_insert|select|delete`).
  - **Idempotenz-Test:** alle 3 Migrations 2x appliziert → keine zusaetzlichen Aenderungen, nur RAISE NOTICE-Wiederholungen + DROP IF EXISTS-skip-Notices.
  - **RLS-Translation:** ARCHITECTURE.md V5-Sketch verwendet `(auth.jwt()->>'role')` + `tenant_user`-Tabelle (Pattern aus generischen Supabase-Tutorials). Onboarding-Plattform nutzt produktiv `auth.user_role()` + `auth.user_tenant_id()` Helper-Funktionen, die aus der `profiles`-Tabelle lesen (sql/functions.sql, etabliert seit V1). Migration uebersetzt Sketches auf das real verwendete Pattern. Architektur-Intent (4-Rollen-Matrix, Tenant-Isolation, Self-only fuer tenant_member/employee) ist identisch — nur die SQL-Syntax differiert. Dokumentiert in DEC-Eintraege bzw. Slice-Report fuer SLC-071.
- Live-Deploy: offen (geplant fuer /backend SLC-071 nach User-Backup-Bestaetigung).

### MIG-032 — V5 Option 2 Methodik-Schicht Schema (Migrations 085+086+087)
- Date: 2026-05-06 (Architektur done) — **Migration 087 live appliziert 2026-05-07 in /backend SLC-076 (RPT-182). Migrations 085+086 weiterhin geplant in SLC-077 + SLC-078.**

#### Live-Status pro Migration
- **Migration 087 — LIVE 2026-05-07** auf Hetzner Onboarding (159.69.207.29). Container `supabase-db-bwkg80w04wgccos48gcws8cs-082801990676` (zum Zeitpunkt des Apply; Suffix wandert nach Coolify-Redeploys). Apply via base64-Pipe + `psql -U postgres` (sql-migration-hetzner.md). Pre-Apply-Backup: pg_get_constraintdef-Snapshot vor Apply (8 status-Werte + 9 source-Werte). Post-Apply: 11 status-Werte + 10 source-Werte verifiziert. Idempotent: Re-Apply mittels DROP IF EXISTS + ADD CONSTRAINT akzeptiert wiederholte Laeufe ohne Drift.
- **Migration 088 — LIVE 2026-05-07** (SLC-076 /qa Hotfix nach RPT-183, /qa entdeckte 0 ai_cost_ledger-Eintraege bei 4 PII-Smokes). `ai_cost_ledger.role` CHECK erweitert um drei V5-Option-2-Pipeline-Roles (`walkthrough_pii_redactor`, `walkthrough_step_extractor`, `walkthrough_subtopic_mapper`). Apply identisch zu 087 (base64-Pipe + `psql -U postgres`). Post-Apply: 14 Roles verifiziert. SLC-077 + SLC-078 koennen Cost-Tracking ohne weitere Migration nutzen.
- **Migration 085 — LIVE 2026-05-07** auf Hetzner Onboarding (159.69.207.29). Container `supabase-db-bwkg80w04wgccos48gcws8cs-101145350115` (zum Zeitpunkt des Apply). Apply via base64-Pipe + `psql -U postgres` (sql-migration-hetzner.md). Pre-Apply-Check: Tabelle existierte nicht (Greenfield). Post-Apply: `walkthrough_step` mit 17 Columns + UNIQUE (walkthrough_session_id, step_number) + 4 Indizes (PK, UNIQUE-Constraint, idx_walkthrough_step_session partial WHERE deleted_at IS NULL, idx_walkthrough_step_tenant) + 2 RLS-Policies (walkthrough_step_select 4-Rollen-Matrix, walkthrough_step_update strategaize_admin+tenant_admin) + BEFORE UPDATE Trigger trg_walkthrough_step_set_updated_at + 3 FKs (tenants ON DELETE CASCADE, walkthrough_session ON DELETE CASCADE, auth.users) + CHECK step_number >= 1. **KEIN INSERT-Policy** fuer authenticated — Worker schreibt via service_role (BYPASSRLS). Idempotent: DROP POLICY IF EXISTS / CREATE POLICY akzeptiert wiederholte Laeufe ohne Drift.
- **Migration 086 — LIVE 2026-05-07** auf Hetzner Onboarding (159.69.207.29). Container `supabase-db-bwkg80w04wgccos48gcws8cs-111957618447` (zum Zeitpunkt des Apply). Apply via base64-Pipe + `psql -U postgres` (sql-migration-hetzner.md). Pre-Apply-Check: Tabelle existierte nicht (Greenfield). Post-Apply: `walkthrough_review_mapping` mit 15 Columns inkl. **GENERATED `confidence_band`-Column** (CASE NULL→red, ≥0.85→green, ≥0.70→yellow, ELSE red — DEC-087) + UNIQUE (walkthrough_step_id) + 4 Indizes (PK, UNIQUE, idx_wkrm_session_subtopic, idx_wkrm_unmapped partial WHERE subtopic_id IS NULL) + 2 RLS-Policies (walkthrough_review_mapping_select 4-Rollen-Matrix via JOIN auf walkthrough_step→walkthrough_session, walkthrough_review_mapping_update strategaize_admin+tenant_admin) + BEFORE UPDATE Trigger trg_walkthrough_review_mapping_set_updated_at + 4 FKs (tenants ON DELETE CASCADE, walkthrough_step ON DELETE CASCADE, template, auth.users) + CHECK confidence_score 0..1. **KEIN INSERT-Policy** fuer authenticated — Worker schreibt via service_role (BYPASSRLS). Idempotent. **GENERATED-Logik live verifiziert** via Test-INSERT mit confidence_score=0.85 + valider subtopic_id → liefert confidence_band='green' (Cleanup direkt nach Verifikation).

- Scope: Drei additive Migrations fuer V5 Option 2 (Methodik-Schicht: PII-Redaction, Schritt-Extraktion, Auto-Mapping). Keine Aenderung an bestehenden Tabellen ausser additiver CHECK-Erweiterungen, die nur neue Werte zulassen.
  - **Migration 085 — `085_v5opt2_walkthrough_step.sql`**: CREATE TABLE `walkthrough_step` (extracted SOP-Schritte aus Stage 2). FKs: tenant_id → tenants ON DELETE CASCADE, walkthrough_session_id → walkthrough_session ON DELETE CASCADE, edited_by_user_id → auth.users. UNIQUE (walkthrough_session_id, step_number). Soft-Delete via deleted_at. 2 Indizes (session+step_number partial WHERE deleted_at IS NULL, tenant). RLS aktivieren. 3 Policies: SELECT (4-Rollen wie walkthrough_session), UPDATE (strategaize_admin + tenant_admin eigener Tenant), kein DELETE (soft-delete). INSERT-Policy bewusst weggelassen — Worker schreibt via service_role (BYPASSRLS).
  - **Migration 086 — `086_v5opt2_walkthrough_review_mapping.sql`**: CREATE TABLE `walkthrough_review_mapping` (Stage 3 Output + Berater-Korrektur). FKs: tenant_id → tenants ON DELETE CASCADE, walkthrough_step_id → walkthrough_step ON DELETE CASCADE (UNIQUE), template_id → template (eingefroren via template_version), reviewer_user_id → auth.users. GENERATED-Column `confidence_band` (gruen/gelb/rot per DEC-087). 2 Partial Indizes (mapped, unmapped). RLS aktivieren. 3 Policies: SELECT, UPDATE (Move) — gleiche 4-Rollen-Matrix wie walkthrough_step. CHECK confidence_score BETWEEN 0 AND 1.
  - **Migration 087 — `087_v5opt2_status_and_source_extension.sql`**: CHECK-Erweiterung `walkthrough_session.status` um `'redacting'`, `'extracting'`, `'mapping'` (Pipeline-Stufen). CHECK-Erweiterung `knowledge_unit.source` um `'walkthrough_transcript_redacted'`. Beide rein additive Werte, rueckwaerts-kompatibel — bestehende Rows bleiben gueltig.
- Reason: V5 Option 2 (DEC-079, DEC-089-anchored auf Strategaize-Dev-System) erfordert eine 3-stufige asynchrone AI-Pipeline (DEC-080..088) zwischen Whisper-Transkription und Berater-Methodik-Review. Drei neue Worker-Job-Handler schreiben in zwei neue Tabellen + erweitern Status-Maschine. Das Schema ist greenfield (keine Backfill-Notwendigkeit, keine Drift-Risiken zu V5-Foundation). Splitting in 3 Files erlaubt unabhaengiges Rollback (Step-Tabelle vs. Mapping-Tabelle vs. CHECK-Erweiterung).
- Affected Areas:
  - Neue Tabelle `public.walkthrough_step` mit RLS aktiviert
  - Neue Tabelle `public.walkthrough_review_mapping` mit RLS aktiviert + GENERATED Column
  - `public.walkthrough_session.status` CHECK erweitert um 3 Pipeline-Stufen
  - `public.knowledge_unit.source` CHECK erweitert um Redacted-Transkript-Quelle
  - Worker-Code: drei neue Job-Handler `walkthrough_redact_pii`, `walkthrough_extract_steps`, `walkthrough_map_subtopics` (kein DDL, App-Code in Option-2-Slices)
  - Routing-Code: neue Server Action `startWalkthroughSession` (DEC-080 Self-Spawn), neue Server Actions fuer Methodik-Review (Edit/Move/Approve)
  - RLS-Test-Matrix erweitert um beide neue Tabellen (4 Rollen × 4 Operationen × 2 Tabellen = 32 zusaetzliche Faelle, plus walkthrough_session 16 = 48 Faelle gesamt fuer V5 Option 2)
- Risk: Niedrig. Migration 085+086 sind Greenfield-Tabellen (keine Backfill, keine FK-Konflikte mit bestehenden Daten). Migration 087 ist additive CHECK-Erweiterung (rueckwaerts-kompatibel). Apply-Pattern ist Standard `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres` ueber Coolify-Container). Pre-Apply-Pflicht: keine — additive Strukturen, aber Pre-Apply-Backup ist User-Standard. Risiko-Faktor minimal: GENERATED Column auf Postgres 15+ supported, kein Funktion-Drift gegenueber V1+ Helper-Funktionen `auth.user_role()` + `auth.user_tenant_id()`.
- Rollback Notes:
  - **085 Rollback**: `DROP TABLE IF EXISTS public.walkthrough_step CASCADE;` (CASCADE entfernt FKs aus walkthrough_review_mapping).
  - **086 Rollback**: `DROP TABLE IF EXISTS public.walkthrough_review_mapping CASCADE;`.
  - **087 Rollback**: `ALTER TABLE walkthrough_session DROP CONSTRAINT walkthrough_session_status_check; ALTER TABLE walkthrough_session ADD CONSTRAINT walkthrough_session_status_check CHECK (status IN ('recording','uploading','uploaded','transcribing','pending_review','approved','rejected','failed'));` (gleichermassen fuer knowledge_unit_source_check ohne `'walkthrough_transcript_redacted'`). Voraussetzung: keine `walkthrough_session` mit status IN ('redacting','extracting','mapping') und keine `knowledge_unit` mit source='walkthrough_transcript_redacted' existiert.
  - Rollback-Reihenfolge bei Komplett-Revert: 1. App-Image revert auf pre-V5-Option-2 (Worker-Job-Handler ignorieren neue Job-Types). 2. Coolify-Worker pausieren. 3. Pending ai_jobs mit den 3 neuen Job-Types canceln. 4. SQL-Rollback in Reihenfolge 086 → 085 → 087.
- Format-Skizze (final in /backend Option-2-Pipeline-Slices, MT-1 jeder Migration):
  ```sql
  -- 085_v5opt2_walkthrough_step.sql (idempotent via IF NOT EXISTS)
  CREATE TABLE IF NOT EXISTS public.walkthrough_step (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
    walkthrough_session_id      uuid        NOT NULL REFERENCES public.walkthrough_session ON DELETE CASCADE,
    step_number                 integer     NOT NULL CHECK (step_number >= 1),
    action                      text        NOT NULL,
    responsible                 text,
    timeframe                   text,
    success_criterion           text,
    dependencies                text,
    transcript_snippet          text,
    transcript_offset_start     integer,
    transcript_offset_end       integer,
    edited_by_user_id           uuid        REFERENCES auth.users,
    edited_at                   timestamptz,
    deleted_at                  timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (walkthrough_session_id, step_number)
  );
  CREATE INDEX IF NOT EXISTS idx_walkthrough_step_session
    ON public.walkthrough_step(walkthrough_session_id, step_number)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_walkthrough_step_tenant
    ON public.walkthrough_step(tenant_id);
  ALTER TABLE public.walkthrough_step ENABLE ROW LEVEL SECURITY;
  -- SELECT-Policy: 4-Rollen-Matrix (RLS-Translation siehe MIG-031, gleiche Helper-Funktionen)
  -- UPDATE-Policy: strategaize_admin + tenant_admin (eigener Tenant)
  -- KEIN INSERT-Policy: Worker schreibt via service_role
  GRANT SELECT, UPDATE ON public.walkthrough_step TO authenticated;
  GRANT ALL ON public.walkthrough_step TO service_role;
  CREATE TRIGGER trg_walkthrough_step_set_updated_at
    BEFORE UPDATE ON public.walkthrough_step
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
  ```
  ```sql
  -- 086_v5opt2_walkthrough_review_mapping.sql (idempotent via IF NOT EXISTS)
  CREATE TABLE IF NOT EXISTS public.walkthrough_review_mapping (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
    walkthrough_step_id         uuid        NOT NULL UNIQUE REFERENCES public.walkthrough_step ON DELETE CASCADE,
    template_id                 uuid        NOT NULL REFERENCES public.template,
    template_version            text        NOT NULL,
    subtopic_id                 text,
    confidence_score            numeric(3,2) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    confidence_band             text        GENERATED ALWAYS AS (
                                  CASE
                                    WHEN subtopic_id IS NULL THEN 'red'
                                    WHEN confidence_score >= 0.85 THEN 'green'
                                    WHEN confidence_score >= 0.70 THEN 'yellow'
                                    ELSE 'red'
                                  END
                                ) STORED,
    mapping_model               text,
    mapping_reasoning           text,
    reviewer_corrected          boolean     NOT NULL DEFAULT false,
    reviewer_user_id            uuid        REFERENCES auth.users,
    reviewed_at                 timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_wkrm_session_subtopic
    ON public.walkthrough_review_mapping(walkthrough_step_id, subtopic_id);
  CREATE INDEX IF NOT EXISTS idx_wkrm_unmapped
    ON public.walkthrough_review_mapping(tenant_id, walkthrough_step_id)
    WHERE subtopic_id IS NULL;
  ALTER TABLE public.walkthrough_review_mapping ENABLE ROW LEVEL SECURITY;
  -- SELECT + UPDATE Policies (gleiche Matrix wie walkthrough_step)
  GRANT SELECT, UPDATE ON public.walkthrough_review_mapping TO authenticated;
  GRANT ALL ON public.walkthrough_review_mapping TO service_role;
  ```
  ```sql
  -- 087_v5opt2_status_and_source_extension.sql (idempotent via DROP CONSTRAINT IF EXISTS)
  ALTER TABLE public.walkthrough_session
    DROP CONSTRAINT IF EXISTS walkthrough_session_status_check;
  ALTER TABLE public.walkthrough_session
    ADD CONSTRAINT walkthrough_session_status_check
    CHECK (status IN (
      'recording','uploading','uploaded','transcribing',
      'redacting','extracting','mapping',
      'pending_review','approved','rejected','failed'
    ));
  ALTER TABLE public.knowledge_unit
    DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;
  ALTER TABLE public.knowledge_unit
    ADD CONSTRAINT knowledge_unit_source_check
    CHECK (source IN (
      'questionnaire','exception','ai_draft','meeting_final','manual',
      'evidence','dialogue','employee_questionnaire',
      'walkthrough_transcript','walkthrough_transcript_redacted'
    ));
  ```
  Apply per `sql-migration-hetzner.md`-Pattern in Option-2-Pipeline-Slices (final in /slice-planning, vermutlich SLC-PII fuer 087, SLC-EXT fuer 085, SLC-MAP fuer 086 — oder gebuendelt in Option-2-Foundation-Slice). Verifikation: `\d walkthrough_step` zeigt 18 Columns + 3 Policies + 2 Indizes + Trigger, `\d walkthrough_review_mapping` zeigt GENERATED-Column + 2 Indizes + 2 Policies, `pg_get_constraintdef` zeigt erweiterte CHECK auf walkthrough_session.status (11 Werte) und knowledge_unit.source (10 Werte).
- Live-Deploy: offen (geplant fuer Option-2-Pipeline-Slices nach Slice-Planning).

### MIG-033 — V5.1 Walkthrough Handbuch-Integration: rpc_get_walkthrough_video_path + handbook_schema-DML (Migration 089)
- Date: 2026-05-08 (Architektur done) — **Migration 089 LIVE 2026-05-10 in /backend SLC-091 MT-7 (RPT-199 + Live-Apply-Followup).**

#### Live-Status

- **Migration 089 — LIVE 2026-05-10** auf Hetzner Onboarding (159.69.207.29). Container `supabase-db-bwkg80w04wgccos48gcws8cs-070147757815` (zum Apply-Zeitpunkt; Suffix wandert nach Coolify-Redeploys). Apply via base64-Pipe + `psql -U postgres -v ON_ERROR_STOP=1 < /tmp/089_v51.sql` (sql-migration-hetzner.md). Pre-Apply-Backup: `/opt/onboarding-plattform-backups/pre-mig-033_20260510_070528.csv` (4708 bytes, COPY der `template`-Tabelle inkl. handbook_schema). App+Worker bereits auf SLC-091-Image-Tag `f396f6f113849c5a89d2de7b819243e9cfda5977` (Coolify-Redeploy 2026-05-10 ~07:01 durch User), kein Schema-Validation-Error nach Migration sichtbar.
- **DDL-Result**: `\df+ rpc_get_walkthrough_video_path` zeigt Function (SECURITY DEFINER, owner postgres, GRANT EXECUTE TO authenticated, Language plpgsql, Volatility volatile, Parallel unsafe).
- **DML-Result**: 1 Template (`Exit-Readiness`, id=`374f572d-9b2b-4e55-af44-fb0a646f1736`) hatte `handbook_schema IS NOT NULL` — Sections-Anzahl 8 → 9. Letzte Section ist exakt Walkthroughs-Section (`{"key":"walkthroughs","order":15,"title":"Walkthroughs","render":{"intro_template":null,"subsections_by":"subtopic"},"sources":[{"type":"walkthrough","filter":{"min_status":"approved"}}]}`). Das zweite produktive Template (`mitarbeiter_wissenserhebung`) hat `handbook_schema IS NULL` und wurde durch die WHERE-Clause korrekt ausgelassen — die V5.1-/architecture- + Slice-Doku sprach von "2 produktiven Templates", was nicht stimmt (1 Template mit Schema). Doku-Drift in /qa SLC-091 zu korrigieren, kein Live-Blocker.
- **RPC-Smoke 2026-05-10**: `SELECT public.rpc_get_walkthrough_video_path('75098a5d-c38b-486c-986e-ba9f52567fd9'::uuid)` als demo-admin (tenant_admin, tenant `0...0de`, eigene Session) liefert `{"storage_path":"00000000-0000-0000-0000-0000000000de/75098a5d-.../recording.webm","created_at":"2026-05-06T14:22:15.917936+00:00","reviewed_at":"2026-05-08T15:04:46.611+00:00"}`. Negativ-Tests (forbidden, not_approved, not_found, cross-tenant) gehoeren in /qa SLC-091 + SLC-092 RLS-Matrix.
- Idempotent: Re-Apply nutzt `CREATE OR REPLACE FUNCTION` (DDL) + WHERE-NOT-Containment-Check (DML), produziert keinen Drift bei wiederholten Laeufen.


- Scope: Eine additive Migration fuer V5.1 (Walkthrough-Handbuch-Embed-Foundation). Kein neues Tabellen-DDL — V5.1 nutzt ausschliesslich existing Tabellen aus MIG-031+MIG-032. Migration enthaelt zwei Komponenten:
  - **DDL** — `CREATE OR REPLACE FUNCTION public.rpc_get_walkthrough_video_path(p_walkthrough_session_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER`. Logik per DEC-099: Lookup walkthrough_session, Tenant-Check via `auth.user_tenant_id()`, Rolle-Check via `auth.user_role()` IN ('tenant_admin','strategaize_admin'), Status-Check `= 'approved'`. Returns `{ storage_path, approved_at }` oder `{ error: 'not_found' | 'forbidden' | 'not_approved' }`.
  - **DML** — Idempotente UPDATE der zwei produktiven Templates (`exit_readiness`, `mitarbeiter_wissenserhebung`) auf `template.handbook_schema` zur Erweiterung um eine Walkthroughs-Section mit Default `order=15`. Idempotent via JSONB-Containment-Check `WHERE NOT (handbook_schema -> 'sections' @> ...)`. Bestehende Templates ohne `handbook_schema` (NULL) werden nicht angefasst — nur Templates mit existing Sections-Array werden erweitert.
- Reason: V5.1 (FEAT-038, RPT-170 Requirements + diese /architecture V5.1) braucht zwei Schema-seitige Foundation-Stuecke fuer den Handbuch-Embed-Pfad: (1) eine RPC, die als RLS-Gateway fuer den Storage-Proxy `/api/walkthrough/[sessionId]/embed` dient (DEC-099, Pattern-Reuse von `rpc_get_handbook_snapshot_path` aus FEAT-028 SLC-040), und (2) ein DML-Update der Default-Templates, damit beim Live-Deploy V5.1 sofort Walkthroughs-Sections in neuen Snapshots erscheinen ohne dass der Berater jedes Template manuell anpassen muss. Die DML ist Daten-Migration, nicht Schema — `handbook_schema` ist JSONB und akzeptiert beliebige Section-Definitionen ohne DDL-Aenderung. Beide Komponenten in einer Migration gebuendelt, weil sie zusammen ein logisches V5.1-Foundation-Stueck sind und einzeln keinen Wert haben.
- Affected Areas:
  - Neue SQL-Function `public.rpc_get_walkthrough_video_path(uuid)` mit SECURITY DEFINER + GRANT EXECUTE TO authenticated
  - Daten-Migration in `public.template.handbook_schema` JSONB-Field fuer 2 produktive Templates (exit_readiness, mitarbeiter_wissenserhebung)
  - Worker-Code: `validate-schema.ts` akzeptiert neuen `SectionSourceType="walkthrough"` (App-Code, kein DDL — in /backend SLC-091 MT-1)
  - App-Code: neuer Endpoint `src/app/api/walkthrough/[sessionId]/embed/route.ts` (kein DDL — in /backend SLC-091 MT-5)
  - RLS-Test-Matrix erweitert um 24 Faelle (4 Rollen × 3 Status × 2 Tenant-Konstellationen) in `walkthrough-embed-rls.test.ts` (in /frontend SLC-092 MT-4)
- Risk: Niedrig. (1) `CREATE OR REPLACE FUNCTION` ist idempotent und betrifft keine bestehenden Daten. (2) DML auf `template.handbook_schema` ist additive JSONB-Erweiterung mit Pre-Apply-Containment-Check — bei Re-Apply wird Section nicht doppelt eingefuegt. SECURITY DEFINER bringt RLS-Bypass-Risiko, aber die Function selbst implementiert die Authorization-Checks (Tenant + Rolle + Status) — gleiches Pattern wie `rpc_get_handbook_snapshot_path` (FEAT-028, seit V4.1 stabil produktiv). Pre-Apply-Pflicht: Backup von `template.handbook_schema` fuer beide produktiven Templates vor DML-Apply. Apply-Pattern Standard `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres`).
- Rollback Notes:
  - **DDL Rollback**: `DROP FUNCTION IF EXISTS public.rpc_get_walkthrough_video_path(uuid);` — Endpoint `/api/walkthrough/[sessionId]/embed` faellt mit 500 (RPC nicht gefunden), aber neue Snapshots wuerden die Walkthroughs-Section weiter rendern (Markdown ist statisch, Video-URLs broken). Pre-Rollback-Pflicht: existing Snapshots mit Walkthrough-Sections sind statisch und reflektieren das Roll-back nicht. Praktisch: Rollback nur sinnvoll wenn V5.1-Code-Deploy auch revertiert.
  - **DML Rollback**: Pre-Apply-Backup-Restore via `UPDATE template SET handbook_schema = '<backup>' WHERE id = '<id>'` — nur sinnvoll wenn die Walkthroughs-Section an mind. einem Template aktiv geworden ist und Snapshots damit erstellt wurden. Bei Pre-Apply-Backup-Vorhaltung trivial.
  - Rollback-Reihenfolge bei Komplett-Revert V5.1: 1. App-Image revert auf V5-Stand (REL-013, `93a9d7a`) — Worker-Renderer-Pfad ignoriert `walkthrough`-Source-Type (validate-schema.ts pre-V5.1 unterstuetzt das nicht). 2. Optional DDL Rollback `DROP FUNCTION` (kann auch live bleiben, wirkungslos ohne Endpoint). 3. Optional DML Rollback (Walkthroughs-Section in `handbook_schema` bleibt cosmetic, Worker pre-V5.1 ignoriert `type='walkthrough'` mit Schema-Validation-Error -> Fail-Fast pro Snapshot-Job; Rollback ist hier praktisch Pflicht).
- Format-Skizze (final in /backend SLC-091 MT-4):
  ```sql
  -- 089_v51_walkthrough_handbook_integration.sql

  -- 1. RPC fuer Storage-Proxy-RLS-Check (DEC-099)
  CREATE OR REPLACE FUNCTION public.rpc_get_walkthrough_video_path(
    p_walkthrough_session_id uuid
  )
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
  AS $$
  DECLARE
    v_session record;
    v_role    text;
    v_tenant  uuid;
  BEGIN
    -- Authorization-Context
    v_role := auth.user_role();
    v_tenant := auth.user_tenant_id();

    IF v_role IS NULL THEN
      RETURN jsonb_build_object('error', 'unauthenticated');
    END IF;

    -- Reader-Zugriff nur fuer tenant_admin + strategaize_admin (V4.1 DEC-V4.1-2)
    IF v_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    -- Session laden (RLS aktiv via SECURITY DEFINER -> bypass; Authorization manuell oben)
    SELECT id, tenant_id, status, created_at
      INTO v_session
      FROM public.walkthrough_session
      WHERE id = p_walkthrough_session_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'not_found');
    END IF;

    -- Tenant-Check: tenant_admin nur eigener Tenant; strategaize_admin cross-tenant
    IF v_role = 'tenant_admin' AND v_session.tenant_id != v_tenant THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    -- Status-Check: nur approved Sessions liefern Video
    IF v_session.status != 'approved' THEN
      RETURN jsonb_build_object('error', 'not_approved', 'status', v_session.status);
    END IF;

    -- Storage-Path-Convention aus V5 (Migration 084): {tenant_id}/{session_id}.webm
    RETURN jsonb_build_object(
      'storage_path', v_session.tenant_id::text || '/' || v_session.id::text || '.webm',
      'created_at',   v_session.created_at
    );
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.rpc_get_walkthrough_video_path(uuid) TO authenticated;

  -- 2. DML: Walkthroughs-Section in produktive Templates idempotent einfuegen
  UPDATE public.template
  SET handbook_schema = jsonb_set(
    handbook_schema,
    '{sections}',
    (handbook_schema -> 'sections') || jsonb_build_array(
      jsonb_build_object(
        'key',   'walkthroughs',
        'title', 'Walkthroughs',
        'order', 15,
        'sources', jsonb_build_array(
          jsonb_build_object(
            'type',   'walkthrough',
            'filter', jsonb_build_object('min_status', 'approved')
          )
        ),
        'render', jsonb_build_object(
          'subsections_by', 'subtopic',
          'intro_template', null
        )
      )
    )
  )
  WHERE handbook_schema IS NOT NULL
    AND handbook_schema ? 'sections'
    AND NOT (handbook_schema -> 'sections' @> '[{"key":"walkthroughs"}]'::jsonb);
  ```
  Apply per `sql-migration-hetzner.md`-Pattern in `/backend SLC-091 MT-7`. Verifikation: `\df rpc_get_walkthrough_video_path` zeigt Function (SECURITY DEFINER, owner postgres), `SELECT id, name, handbook_schema -> 'sections' FROM template` zeigt Walkthroughs-Section in beiden produktiven Templates an Position 15. Smoke-RPC-Call `SELECT rpc_get_walkthrough_video_path('<existing-approved-session-id>')` (manuell als postgres-User mit gesetzter `request.jwt.claim`) liefert `{ storage_path, created_at }`-JSONB.
- Live-Deploy: offen (geplant fuer `/backend SLC-091 MT-7` nach V5-Option-2-STABLE und `/slice-planning V5.1`).

### MIG-034 — V6 Multiplikator-Foundation: Tenant-Hierarchie + Partner-Tabellen + Lead-Push (Migrations 090+091+092, geplant)
- Date: 2026-05-11
- Scope: V6 vollstaendige Schema-Erweiterung fuer Multiplikator-Layer in 3 sequenziellen Migration-Files:
  - **090_v6_partner_tenant_foundation.sql** — `tenants` ALTER (`tenant_kind` + `parent_partner_tenant_id` + CHECK-Constraints), neue Postgres-Rolle `partner_admin`, `partner_organization`-Tabelle + RLS, `partner_client_mapping`-Tabelle + RLS + Trigger fuer Tenant-Kind-Pruefung, RLS-Policy-Updates auf bestehende Tabellen (`tenants`, `capture_session`, `knowledge_unit`, `block_checkpoint`, `validation_layer`) fuer neue `partner_admin`-Rolle.
  - **091_v6_partner_branding_and_template_metadata.sql** — `partner_branding_config`-Tabelle + RLS, RPC `rpc_get_branding_for_tenant` (SECURITY DEFINER), `validation_layer.reviewer_role` CHECK-Erweiterung um `'system_auto'`, `block_checkpoint.checkpoint_type` CHECK-Erweiterung um `'auto_final'`, Storage-Bucket `partner-branding-assets` + RLS (analog walkthroughs-Bucket).
  - **092_v6_lead_push_audit.sql** — `lead_push_consent`-Tabelle + RLS, `lead_push_audit`-Tabelle + RLS, `ai_jobs.job_type` CHECK-Erweiterung um `'lead_push_retry'`.
- Reason: V6 Multiplikator-Foundation (RPT-209) erfordert Tenant-Hierarchie (Partner haelt Mandanten), neue RLS-Rolle `partner_admin` mit Defense-in-Depth-Policies, Co-Branding-Mechanik mit erstmalig CSS-Custom-Properties Setup (DEC-106), Auto-Finalize-Pipeline-Pattern fuer Diagnose-Werkzeug (DEC-100 + DEC-105), DSGVO-Audit fuer Lead-Push opt-in mit synchron+retry-Mechanik (DEC-107 + DEC-112), Pflicht-Pen-Test-Suite mit 5-Rollen-Matrix (DEC-110). Aufgeteilt in 3 sequenzielle Files damit SLC-101 (Foundation + RLS + Pen-Test) isoliert appliziert werden kann bevor SLC-104 (Branding, Migration 091) und SLC-106 (Lead-Push, Migration 092) starten. Reuse-Pattern: V4/V5-RLS-Defense-in-Depth + SAVEPOINT-Test-Pattern + RPC SECURITY DEFINER (DEC-099 analog).
- Affected Areas: 5 neue Kerntabellen (`partner_organization`, `partner_client_mapping`, `partner_branding_config`, `lead_push_consent`, `lead_push_audit`), 1 erweiterte Kerntabelle (`tenants`), 3 CHECK-Constraint-Erweiterungen auf bestehenden Tabellen (`validation_layer.reviewer_role`, `block_checkpoint.checkpoint_type`, `ai_jobs.job_type`) plus 1 indirektes Metadata-Schema (`template.metadata.usage_kind` als optionales JSONB-Feld, kein DDL), 1 neuer Storage-Bucket (`partner-branding-assets`), 1 neue Postgres-Rolle (`partner_admin`), 1 neue SECURITY DEFINER RPC (`rpc_get_branding_for_tenant`), RLS-Policy-Updates auf mindestens 5 bestehenden Tabellen (`tenants`, `capture_session`, `knowledge_unit`, `block_checkpoint`, `validation_layer`).
- Risk: **Mittel-Hoch in der Apply-Phase, Niedrig nach Test-PASS.**
  - **Risiko (mittel)**: Daten-Migration aller Bestands-Tenants auf `tenant_kind='direct_client'` muss idempotent sein und darf keine Bestands-Funktionalitaet brechen — alle bestehenden RLS-Tests (V4-46 + V5.1-48 = 94 Faelle) muessen nach Migration regression-frei laufen.
  - **Risiko (hoch wenn nicht getestet)**: Cross-Partner-Isolation-Bug in den neuen RLS-Policies wuerde einem Partner Sicht auf Mandanten anderer Partner geben -> Reputations-Killer. Mitigation: Pen-Test-Suite mit mindestens 96 V6-spezifischen + 94 Regression-Faellen ist Pflicht-Bestandteil von SLC-101 (DEC-110), PASS ist Pre-Condition fuer alle weiteren V6-Slices.
  - **Risiko (niedrig)**: `partner_client_mapping`-Trigger fuer Tenant-Kind-Pruefung koennte bei Race-Condition (parallele Tenant-Anlage + Mapping-Anlage in unterschiedlichen TXs) inkonsistent sein. Mitigation: Server-Action `inviteMandant` macht beide INSERTs in einer Transaktion (siehe ARCHITECTURE.md V6 Data Flow B).
  - **Risiko (niedrig)**: `parent_partner_tenant_id` ON DELETE RESTRICT verhindert Loeschen eines Partner-Tenants solange Mandanten existieren. Mitigation: explizit gewollt (Mandanten-Daten-Schutz), Strategaize-Admin muss bewusst Mandanten zuerst migrieren/loeschen.
- Rollback Notes:
  - **090 Rollback**: DROP TABLE partner_client_mapping CASCADE -> DROP TABLE partner_organization CASCADE -> DROP ROLE partner_admin -> ALTER TABLE tenants DROP COLUMN parent_partner_tenant_id -> ALTER TABLE tenants DROP COLUMN tenant_kind -> Restore bestehende RLS-Policies aus pre-mig-034-090 Backup. Pre-Apply-Backup Pflicht: `pg_dump --schema-only -d postgres > pre-mig-034-090_<timestamp>.sql`.
  - **091 Rollback**: DROP TABLE partner_branding_config CASCADE -> DROP FUNCTION rpc_get_branding_for_tenant -> ALTER TABLE validation_layer (CHECK revert) -> ALTER TABLE block_checkpoint (CHECK revert) -> DELETE FROM storage.buckets WHERE id='partner-branding-assets'. Pre-Apply-Backup analog.
  - **092 Rollback**: DROP TABLE lead_push_audit CASCADE -> DROP TABLE lead_push_consent CASCADE -> ALTER TABLE ai_jobs (CHECK revert). Pre-Apply-Backup analog.
  - **Voll-Rollback fuer V6** (im Fall eines Pen-Test-Fail oder Pilot-Datenverlust): Voll-Restore aus Coolify-Standard-Daily-Backup. **Voll-Restore-Limit fuer V6 akzeptiert (DEC-103)** — kein selektiver Tenant-Restore moeglich.
- Live-Deploy: **Migration 090 LIVE auf Hetzner 2026-05-11**, **Migration 091 LIVE auf Hetzner 2026-05-12** (per `/backend SLC-104 MT-2`, sql-migration-hetzner-Pattern). Migration 092 offen:
  - Migration 090 -> **LIVE auf Hetzner 2026-05-11**: Pre-Apply pg_dump-Backup `/opt/onboarding-plattform-backups/pre-mig-034-090_20260511-153300.sql` (251K, schema-only), Apply via base64-Pipe + `psql -U postgres -v ON_ERROR_STOP=1` → COMMIT erfolgreich; Schema-Verifikation gruen (2 neue Spalten in tenants + 2 neue Tabellen + 1 neue Rolle partner_admin in pg_roles + 8 V6-Policies + 5 partner_admin-Policies auf bestehenden Tabellen + 1 Bestands-Tenant auf `direct_client` DEFAULT). Live-Pen-Test im node:20-Container gegen Coolify-DB PASS 71/71 V6 + 4 it.todo() + Regression V4/V5.1 69/69 PASS (admin-rls 2 + rls-isolation 3 + walkthrough-embed-rls 16 + v5-walkthrough-rls 48). Pflicht-Gate fuer SLC-102..106 erreicht (DEC-110).
  - Migration 091 -> **LIVE auf Hetzner 2026-05-12**: Pre-Apply pg_dump-Backup `/opt/onboarding-plattform-backups/pre-mig-034-091_20260512_124426.sql` (46 byte, schema-only-Snapshot — partner_branding_config existierte noch nicht, daher leerer Dump). Apply via base64-Pipe + `psql -U postgres -v ON_ERROR_STOP=1` → DO erfolgreich; Schema-Verifikation gruen: `\d+ partner_branding_config` zeigt 8 Spalten (`id`, `partner_tenant_id` UNIQUE+FK, `logo_url`, `primary_color` DEFAULT `#2563eb`, `secondary_color`, `display_name`, `created_at`, `updated_at`) + 2 Hex-CHECKs + 2 Indexe + 4 RLS-Policies (`pbc_select_own_partner_admin` / `pbc_update_own_partner_admin` / `pbc_insert_own_partner_admin` / `pbc_all_strategaize_admin`); `\df rpc_get_branding_for_tenant` zeigt Function (`prosecdef=t`, jsonb-return); CHECK-Erweiterungen live (`validation_layer.reviewer_role` jetzt 6 Werte inkl. tenant_member/employee/partner_admin/system_auto, `block_checkpoint.checkpoint_type` jetzt 4 Werte inkl. auto_final); Storage-Bucket `partner-branding-assets` (privat, 524288 byte = 500KB, image/png+svg+xml+jpeg) + 3 Storage-Policies (insert/update/delete, Pfad-Praefix tenant_id); Backfill 0/0 (Production hat noch keine Partner-Tenants — partner_organization-Tenants werden bei Anlage automatisch via Backfill bedient). RPC-Smoke `rpc_get_branding_for_tenant(NULL)` liefert Strategaize-Default-JSON `{"logo_url": null, "display_name": "Strategaize", "primary_color": "#2563eb", "secondary_color": null}`. **Idempotenz-Test (2. Apply)**: zweiter Apply schlaegt nicht fehl — Tabelle/Bucket/Policies ON CONFLICT idempotent, CHECK-Erweiterungen sind DROP+RECREATE (gleicher Endzustand, NOTICE-Output erwartet). Backup-Datei bleibt im /opt/onboarding-plattform-backups/ als Recovery-Point.
  - Migration 091a -> **LIVE auf Hetzner 2026-05-12** (Follow-up zu 091, ausgeloest in `/backend SLC-104 MT-6`, dokumentiert in DEC-113): Pre-Apply pg_dump-Backup `/opt/onboarding-plattform-backups/pre-mig-091a_<timestamp>.sql` (schema-only fuer partner_branding_config). Apply via base64-Pipe + `psql -U postgres < /tmp/091a.sql` → `NOTICE: MIG-034/091a: partner_branding_config.primary_color DEFAULT angeglichen auf #4454b8` + `DO` + `CREATE FUNCTION` + 3 GRANTs erfolgreich. Pre-Apply-Probe: 0 Rows mit `primary_color = '#2563eb'` (kein Daten-UPDATE noetig in Production). Post-Apply-Verifikation: `column_default` jetzt `'#4454b8'::text`, `rpc_get_branding_for_tenant(NULL)` liefert `{"logo_url": null, "display_name": "Strategaize", "primary_color": "#4454b8", "secondary_color": null}`. Zweck: Strategaize-Default-Brand-Color auf Style-Guide-V2-Konsistenz angleichen — Migration 091 hatte `#2563eb` (arbitrary Tailwind-Blau) gesetzt, Style-Guide-V2 + 20+ existierende `bg-brand-primary`-Komponenten nutzen aber `#4454b8`. 091a aligniert RPC-v_default + Tabellen-DEFAULT, damit Resolver-Default (parallel auf `#4454b8` umgestellt) + DB-Layer + Tailwind-Config-Var-Fallback alle identisch sind. Idempotent (ALTER COLUMN SET DEFAULT + CREATE OR REPLACE FUNCTION). Re-Apply ist No-Op.
  - Migration 092 -> **LIVE auf Hetzner 2026-05-13** (per `/backend SLC-106 MT-1+MT-2`, sql-migration-hetzner-Pattern): Pre-Apply pg_dump-Backup `/opt/onboarding-plattform-backups/pre-mig-034-092_20260513_161704.sql` (111 Zeilen, schema-only fuer `ai_jobs`). Apply via base64-Pipe + `psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/092_v6.sql` → DO erfolgreich nach Korrektur-Iteration (Erst-Apply scheiterte mit `check constraint "ai_jobs_job_type_check" of relation "ai_jobs" is violated by some row` weil bestehender `knowledge_unit_condensation`-Wert im Code-Grep zunaechst uebersehen wurde — DO-Block rollte sauber zurueck, kein partielles Schema). Korrigierte Migration whitelistet **15 job_type-Werte** (14 bestehende + neu `lead_push_retry`): bridge_generation, diagnosis_generation, dialogue_extraction, dialogue_transcription, evidence_extraction, handbook_snapshot_generation, knowledge_unit_condensation, recondense_with_gaps, sop_generation, walkthrough_extract_steps, walkthrough_map_subtopics, walkthrough_redact_pii, walkthrough_stub_processing, walkthrough_transcribe, lead_push_retry. Schema-Verifikation gruen: `\dt lead_push_*` zeigt 2 Tabellen + `\dp lead_push_consent` zeigt 4 Policies (`lpc_all_strategaize_admin`, `lpc_insert_own_mandant`, `lpc_select_own_mandant`, `lpc_select_partner_admin`) + `\dp lead_push_audit` zeigt 4 Policies (`lpa_*`-Variante) + `pg_get_constraintdef(ai_jobs_job_type_check)` enthaelt alle 15 Werte. **Idempotenz-Test (2. Apply)**: zweiter Apply produziert NOTICE-Output (Indexe + Tabellen "already exists, skipping" + CHECK "Dropped + recreated") aber EXIT=0, gleicher Endzustand. Backup-Datei bleibt im /opt/onboarding-plattform-backups/ als Recovery-Point.
  - Apply-Pattern fuer jeden Schritt: sql-migration-hetzner.md (base64 + psql -U postgres + Pre-Apply pg_dump-Backup), Verifikation via `\d+ tenants`, `\d+ partner_organization`, `\df rpc_get_branding_for_tenant`, RLS-Pen-Test-Suite PASS gegen Coolify-DB im node:20-Container.
- Migration SQL Skizze (Schluessel-Stellen, vollstaendige SQL in /backend SLC-101..104..106 als Migration-Files):

  ```sql
  -- 090 Step 1: tenants Schema-Erweiterung
  ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'direct_client'
      CHECK (tenant_kind IN ('direct_client', 'partner_organization', 'partner_client'));
  ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS parent_partner_tenant_id uuid NULL
      REFERENCES public.tenants(id) ON DELETE RESTRICT;
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_parent_partner_consistency CHECK (
      (tenant_kind = 'partner_client' AND parent_partner_tenant_id IS NOT NULL)
      OR (tenant_kind != 'partner_client' AND parent_partner_tenant_id IS NULL)
    );

  -- 090 Step 2: neue Rolle
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partner_admin') THEN
      CREATE ROLE partner_admin;
      GRANT USAGE ON SCHEMA public TO partner_admin;
    END IF;
  END $$;

  -- 090 Step 3: partner_organization
  CREATE TABLE IF NOT EXISTS public.partner_organization (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    legal_name text NOT NULL,
    display_name text NOT NULL,
    partner_kind text NOT NULL DEFAULT 'tax_advisor' CHECK (partner_kind IN ('tax_advisor')),
    tier text NULL,
    contact_email text NOT NULL,
    contact_phone text NULL,
    country text NOT NULL CHECK (country IN ('DE', 'NL')),
    created_by_admin_user_id uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.partner_organization ENABLE ROW LEVEL SECURITY;
  -- RLS-Policies (Skizze): partner_admin SELECT own, strategaize_admin SELECT all
  CREATE POLICY po_select_own_partner_admin ON public.partner_organization
    FOR SELECT TO partner_admin
    USING (tenant_id = auth.user_tenant_id());
  CREATE POLICY po_select_strategaize_admin ON public.partner_organization
    FOR SELECT TO authenticated
    USING (auth.user_role() = 'strategaize_admin');
  -- ... weitere Policies analog (siehe ARCHITECTURE.md V6 RLS-Matrix)

  -- 090 Step 4: partner_client_mapping + Trigger
  CREATE TABLE IF NOT EXISTS public.partner_client_mapping (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invited_by_user_id uuid REFERENCES auth.users(id),
    invitation_status text NOT NULL CHECK (invitation_status IN ('invited', 'accepted', 'revoked')),
    invited_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz NULL,
    revoked_at timestamptz NULL,
    UNIQUE (partner_tenant_id, client_tenant_id)
  );
  CREATE OR REPLACE FUNCTION public.check_partner_client_mapping_tenant_kinds()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (SELECT tenant_kind FROM public.tenants WHERE id = NEW.partner_tenant_id) != 'partner_organization' THEN
        RAISE EXCEPTION 'partner_tenant_id must reference a tenant with tenant_kind=partner_organization';
      END IF;
      IF (SELECT tenant_kind FROM public.tenants WHERE id = NEW.client_tenant_id) != 'partner_client' THEN
        RAISE EXCEPTION 'client_tenant_id must reference a tenant with tenant_kind=partner_client';
      END IF;
      RETURN NEW;
    END $$;
  CREATE TRIGGER trg_partner_client_mapping_tenant_kinds
    BEFORE INSERT OR UPDATE ON public.partner_client_mapping
    FOR EACH ROW EXECUTE FUNCTION public.check_partner_client_mapping_tenant_kinds();
  ALTER TABLE public.partner_client_mapping ENABLE ROW LEVEL SECURITY;
  -- RLS-Policies (Skizze) ...

  -- 091 Step 1: partner_branding_config
  CREATE TABLE IF NOT EXISTS public.partner_branding_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    logo_url text NULL,
    primary_color text NOT NULL DEFAULT '#2563eb' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
    secondary_color text NULL CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9a-fA-F]{6}$'),
    display_name text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.partner_branding_config ENABLE ROW LEVEL SECURITY;
  -- RLS-Policies (Skizze) ...

  -- 091 Step 2: rpc_get_branding_for_tenant
  CREATE OR REPLACE FUNCTION public.rpc_get_branding_for_tenant(p_tenant_id uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
      v_kind text;
      v_parent uuid;
      v_branding jsonb;
    BEGIN
      SELECT tenant_kind, parent_partner_tenant_id INTO v_kind, v_parent
      FROM public.tenants WHERE id = p_tenant_id;
      IF v_kind IS NULL THEN
        RETURN jsonb_build_object('logo_url', NULL, 'primary_color', '#2563eb', 'secondary_color', NULL);
      END IF;
      IF v_kind = 'partner_client' AND v_parent IS NOT NULL THEN
        SELECT to_jsonb(pbc) INTO v_branding
          FROM public.partner_branding_config pbc
          WHERE pbc.partner_tenant_id = v_parent;
      ELSIF v_kind = 'partner_organization' THEN
        SELECT to_jsonb(pbc) INTO v_branding
          FROM public.partner_branding_config pbc
          WHERE pbc.partner_tenant_id = p_tenant_id;
      END IF;
      IF v_branding IS NULL THEN
        RETURN jsonb_build_object('logo_url', NULL, 'primary_color', '#2563eb', 'secondary_color', NULL);
      END IF;
      RETURN v_branding;
    END $$;

  -- 091 Step 3: CHECK-Constraint-Erweiterungen
  ALTER TABLE public.validation_layer DROP CONSTRAINT IF EXISTS validation_layer_reviewer_role_check;
  ALTER TABLE public.validation_layer ADD CONSTRAINT validation_layer_reviewer_role_check
    CHECK (reviewer_role IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee', 'partner_admin', 'system_auto'));
  ALTER TABLE public.block_checkpoint DROP CONSTRAINT IF EXISTS block_checkpoint_checkpoint_type_check;
  ALTER TABLE public.block_checkpoint ADD CONSTRAINT block_checkpoint_checkpoint_type_check
    CHECK (checkpoint_type IN ('proposed', 'reviewed', 'finalized', 'meeting_final', 'auto_final'));

  -- 091 Step 4: Storage-Bucket
  INSERT INTO storage.buckets (id, name, public) VALUES ('partner-branding-assets', 'partner-branding-assets', false)
    ON CONFLICT (id) DO NOTHING;
  -- Storage-RLS-Policies analog walkthroughs-Bucket

  -- 092 Step 1: lead_push_consent
  CREATE TABLE IF NOT EXISTS public.lead_push_consent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    capture_session_id uuid NOT NULL REFERENCES public.capture_session(id) ON DELETE CASCADE,
    mandant_user_id uuid NOT NULL REFERENCES auth.users(id),
    mandant_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    partner_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    consent_given_at timestamptz NOT NULL DEFAULT now(),
    consent_text_version text NOT NULL,
    consent_ip inet NULL,
    consent_user_agent text NULL,
    withdrawal_at timestamptz NULL
  );
  ALTER TABLE public.lead_push_consent ENABLE ROW LEVEL SECURITY;
  -- RLS-Policies ...

  -- 092 Step 2: lead_push_audit
  CREATE TABLE IF NOT EXISTS public.lead_push_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_id uuid NOT NULL REFERENCES public.lead_push_consent(id) ON DELETE RESTRICT,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    attempt_number int NOT NULL DEFAULT 1,
    status text NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    business_system_response_status int NULL,
    business_system_contact_id uuid NULL,
    business_system_was_new boolean NULL,
    error_message text NULL,
    attribution_utm_source text NOT NULL,
    attribution_utm_campaign text NOT NULL,
    attribution_utm_medium text NOT NULL DEFAULT 'referral'
  );
  ALTER TABLE public.lead_push_audit ENABLE ROW LEVEL SECURITY;
  -- RLS-Policies ...

  -- 092 Step 3: ai_jobs.job_type CHECK-Erweiterung
  ALTER TABLE public.ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;
  ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_job_type_check
    CHECK (job_type IN ('knowledge_unit_condensation', 'meeting_snapshot', 'embedding_generation',
                        'handbook_snapshot_generation', 'capture_reminder',
                        'walkthrough_transcribe', 'walkthrough_redact_pii', 'walkthrough_extract_steps',
                        'walkthrough_map_subtopics', 'walkthrough_stub',
                        'lead_push_retry'));
  ```
  (Vollstaendige SQL-Files werden in /backend SLC-101 (Migration 090), /backend SLC-104 (Migration 091) und /backend SLC-106 (Migration 092) erstellt — diese Skizze ist Architektur-Vorgabe, kein Live-Code.)

### MIG-036 — SLC-106 MT-6 Worker-Claim respektiert payload.scheduled_at (Migration 092a, live)
- Date: 2026-05-14
- Scope:
  - `sql/migrations/092a_ai_jobs_claim_scheduled_at_filter.sql` — `CREATE OR REPLACE FUNCTION public.rpc_claim_next_ai_job_for_type(p_job_type text)` erweitert um `AND (payload->>'scheduled_at' IS NULL OR (payload->>'scheduled_at')::timestamptz <= now())`. Idempotent (CREATE OR REPLACE), backwards-kompatibel (NULL/fehlend → wie bisher claimbar).
  - `DROP FUNCTION IF EXISTS storage.rpc_claim_next_ai_job_for_type(text)` — Aufraeum-Statement nach search-path-Fail im ersten Apply-Versuch (siehe IMP-498). Idempotent fuer alle zukuenftigen Re-Applies (kein-op wenn die storage-Variante nicht existiert).
  - GRANT EXECUTE auf `public.rpc_claim_next_ai_job_for_type(text)` an `service_role` (durch CREATE OR REPLACE bereits preserved; explizit nachgereicht fuer Idempotenz).
- Reason: SLC-106 MT-5 enqueued bei Initial-Push-Fail einen ai_jobs `lead_push_retry` mit `payload.scheduled_at=now()+5min`, damit der Worker den Retry-Backoff (DEC-112: 5min nach Attempt 1, 30min nach Attempt 2) respektiert. Die bestehende Claim-RPC (Migration 035) filterte aber nur auf `status='pending'` ohne Faelligkeitspruefung — Retry-Jobs waeren sofort gezogen worden. P-1 aus RPT-244 als Pflicht-Note dokumentiert. Schema-Aenderung ist eine SCALPEL-AENDERUNG der Claim-Logik mit Null-Risiko fuer die 14 bestehenden Job-Types (keiner setzt `scheduled_at` im Payload).
- Affected Areas: `public.rpc_claim_next_ai_job_for_type(text)` Function-Body (Filter-Kondition ergaenzt). Kein Schema-Aenderung an `public.ai_jobs`-Tabelle. Worker-Code in `src/workers/lead-push/handle-job.ts` setzt `payload.scheduled_at` beim Enqueue.
- Risk: Sehr gering. Backwards-Kompatibilitaet via NULL-Handling: Jobs ohne `payload.scheduled_at` (alle bestehenden 14 Job-Types) verhalten sich wie bisher. SECURITY DEFINER + search_path=public bleibt unveraendert. Concurrency-Semantik (FOR UPDATE SKIP LOCKED) unveraendert.
- Rollback Notes: Re-Apply Migration 035 `rpc_claim_next_ai_job_for_type` (ohne scheduled_at-Filter). Konsequenz: `lead_push_retry`-Jobs werden sofort gezogen statt nach Backoff — Worker macht einen unnoetigen sofortigen 2. Push-Versuch, dann blockiert er sich in einem CHECK-Loop bis Attempt 3. UX-only-Degradation, kein Datenverlust.
- Live-Deploy: **LIVE auf Hetzner 2026-05-14** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-151532171639` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Pre-Apply-Backup: `/opt/onboarding-plattform-backups/pre-mig-092a_*.sql` (schema-only via pg_dump). Apply (zweiter Pass nach IMP-498-Fix): `CREATE FUNCTION` + `DROP FUNCTION` (cleanup der versehentlichen `storage.rpc_claim_next_ai_job_for_type` aus Pass 1) + `GRANT`. Post-State verifiziert per `pg_get_functiondef('public.rpc_claim_next_ai_job_for_type(text)'::regprocedure)` zeigt die scheduled_at-Branch. Live-Smoke (BEGIN+ROLLBACK): zukunftiger `scheduled_at` → RPC liefert NULL, vergangener → RPC liefert den Job, NULL/fehlender (classic job-type) → RPC liefert den Job. Drei Verhalten korrekt.

### MIG-035 — SLC-104 MT-12 ISSUE-047 Storage-Bucket file_size_limit auf 500 KiB angeglichen (Migration 091b, live)
- Date: 2026-05-13
- Scope:
  - `sql/migrations/091b_align_partner_branding_assets_size_limit_to_500kib.sql` — `UPDATE storage.buckets SET file_size_limit = 512000 WHERE id = 'partner-branding-assets'` (vorher 524288 = 512 KiB, nachher 512000 = 500 KiB exakt). DO-Block verifiziert Post-State.
  - Parallel-Code-Aenderung (kein DDL): `src/app/partner/dashboard/branding/actions.ts` und `src/app/partner/dashboard/branding/BrandingEditor.tsx` MAX_LOGO_BYTES auf `500 * 1024 = 512000 Byte`.
- Reason: ISSUE-047 (Logo-Upload Size-Limit-Inkonsistenz). 524288 Byte ist `512 KiB`, NICHT 500 KiB, UI-Text + Slice-Spec versprechen aber "Maximal 500 KB". Option B aus ISSUE-047 (Constant-Pflicht-Truth, UI bleibt vertraut "500 KB") gewaehlt — Server-Action, Client-Validation, Storage-Bucket-Limit sind jetzt alle drei konsistent bei 512000 Byte.
- Affected Areas: Storage-Bucket `partner-branding-assets.file_size_limit` (524288 -> 512000), Server-Action `uploadLogo` MAX_LOGO_BYTES-Constant, Client-Component `BrandingEditor` MAX_LOGO_BYTES-Constant. Keine Tabellen-Schemata, keine Daten-Migration noetig.
- Risk: Nahe Null. Bucket existiert seit Migration 091, war im Bestand leer (Production hat noch keine Partner-Tenants — Backfill 0/0 per MIG-034). Bestehende Logo-Files (es gibt keine) bleiben unangetastet — Limit gilt nur fuer NEUE Uploads. Idempotenz: Re-Apply ist Pure-UPDATE auf gleichen Zielwert (=No-Op via `updated_at`-Refresh).
- Rollback Notes: Manuell: `UPDATE storage.buckets SET file_size_limit = 524288 WHERE id = 'partner-branding-assets';`. Plus Code-Revert auf 524288 in beiden TypeScript-Files. Kein automatisches Reverse-Script bereitgestellt — ISSUE-047 ist final closed.
- Live-Deploy: **LIVE auf Hetzner 2026-05-13 14:44 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-073209612941` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Pre-State `SELECT file_size_limit FROM storage.buckets WHERE id='partner-branding-assets'` = 524288, Apply `BEGIN -> UPDATE 1 -> DO -> NOTICE 'MIG-091b: ... aligned to 512000 (=500 KiB)' -> COMMIT`, Post-State = 512000, `updated_at = 2026-05-13 14:44:31.92316+00`. Quality-Gates nach Migration: tsc EXIT=0, eslint Branding-Module EXIT=0, vitest Full-Regression 963 passed + 14 skipped + 2 todo identisch zu MT-11, npm audit production-only keine NEUEN Vulns (5 pre-existing, alle in V5.1-Backlog).

### MIG-037 — V6.3 SLC-105 Diagnose-Werkzeug Schema-Erweiterung + Template-Seed (Migration 093, live)
- Date: 2026-05-16
- Scope:
  - `sql/migrations/093_v63_partner_diagnostic_seed.sql` (geplant in /backend SLC-105 MT-1) — drei DDL/DML-Statements als idempotenter DO-Block:
    1. `ALTER TABLE template ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;` — neue JSONB-Spalte fuer Template-Level-Konfiguration. Existierende Templates (exit_readiness, demo, walkthrough) erhalten `'{}'` Default.
    2. `ALTER TABLE knowledge_unit ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;` — neue JSONB-Spalte fuer Diagnose-spezifische Score + Comment + Score-Rule-Version pro KU. Standard-Pipeline-KUs bleiben mit `'{}'` Default unberuehrt.
    3. `INSERT INTO template (slug, version, name, description, blocks, metadata) VALUES ('partner_diagnostic', 'v1', 'Strategaize-Diagnose-Werkzeug', '24 Fragen ueber 6 MULTIPLIER_MODEL-Bausteine', '<24-Frage-JSON-Payload>', '{"usage_kind": "self_service_partner_diagnostic", "required_closing_statement": "<Pflicht-Output-Aussage>"}') ON CONFLICT (slug, version) DO UPDATE SET blocks=EXCLUDED.blocks, metadata=EXCLUDED.metadata, description=EXCLUDED.description, updated_at=now();` — idempotenter Template-Seed mit den 24 Fragen aus `docs/DIAGNOSE_WERKZEUG_INHALT.md` (6 Bloecke × 4 Fragen), `comment_anchors`-Strings pro Block (3 Stil-Anker Score-Range low/mid/high), `required_closing_statement` als Markdown-Snippet.
- Reason: V6.3 schaltet das Diagnose-Werkzeug live (FEAT-045 / SLC-105). Daten brauchen zwei neue JSONB-Spalten (template.metadata fuer Worker-Branch-Trigger + Pflicht-Output-Aussage, knowledge_unit.metadata fuer Block-Score + KI-Verdichtungs-Kommentar + Score-Rule-Version) und einen Template-Seed mit 24 Workshop-Output-Fragen. DEC-127 fixiert Migration-Nummer auf 093 (sauberer V6.3-Slot, kein 091c-Suffix). DEC-123 + DEC-124 begruenden die JSONB-statt-Tabelle-Entscheidung. DEC-105 + DEC-126 begruenden, warum kein neuer `job_type` notwendig ist — der Worker dispatched ueber `template.metadata.usage_kind`. Keine CHECK-Erweiterungen noetig (Migration 091 hat `validation_layer.reviewer_role` um `system_auto` und `block_checkpoint.checkpoint_type` um `auto_final` bereits erweitert).
- Affected Areas: Schema-Erweiterung auf `public.template` + `public.knowledge_unit` (je 1 neue Spalte). 1 INSERT in `public.template` (Row mit `slug='partner_diagnostic', version='v1'`). Keine RLS-Aenderungen, keine RPC-Aenderungen, keine Indizes, keine CHECK-Erweiterungen. Keine Storage-Bucket-Aenderungen. Worker-Code (`src/workers/condensation/run.ts`) wird im Code-Path um Branch erweitert — kein DB-Touchpoint.
- Risk: Sehr gering. Beide neue Spalten sind NOT NULL DEFAULT '{}' — keine Backfill-Logik noetig, kein NULL-Risiko fuer Standard-Pipeline-Code. Template-Seed via ON CONFLICT idempotent — Re-Apply ist No-Op auf gleiche Inhalte. Standard-Pipeline-Templates (exit_readiness, demo, walkthrough) sind unberuehrt weil ihr `metadata='{}'` ist und der Worker-Branch nicht greift. Forward-Compat: Workshop-Output-Update (Workshop v2) wuerde neue Template-Row `slug='partner_diagnostic', version='v2'` anlegen via Migration 094, nicht alte Row ueberschreiben (Template-Version-Pinning aktiv in `capture_session.template_version`-Spalte).
- Rollback Notes: Manuell: `ALTER TABLE template DROP COLUMN IF EXISTS metadata; ALTER TABLE knowledge_unit DROP COLUMN IF EXISTS metadata; DELETE FROM template WHERE slug='partner_diagnostic' AND version='v1';`. Pre-Apply-Backup `pg_dump --schema-only --table=public.template --table=public.knowledge_unit > /opt/onboarding-plattform-backups/pre-mig-093_$(date +%Y%m%d_%H%M%S).sql` ist Pflicht. Bei vollstaendiger Rollback-Pflicht: capture_session-Rows mit `template_id=<partner_diagnostic_v1>` muessten archiviert/geloescht werden (CASCADE-Chain ueber knowledge_unit + validation_layer + block_checkpoint).
- Live-Deploy: **LIVE auf Hetzner 2026-05-16 14:42 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-091026513867` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Pre-Apply-Backup `pg_dump --schema-only --table=public.template --table=public.knowledge_unit > /opt/onboarding-plattform-backups/pre-mig-037-093_20260516_144246.sql` (9481 bytes) durchgefuehrt. Apply-Result: `NOTICE: MIG-037/093: template.metadata column ensured / knowledge_unit.metadata column ensured / template partner_diagnostic v1 seeded (24 questions, 6 blocks)` → `DO`. Post-Apply-Verifikation: `information_schema.columns` zeigt beide metadata-Spalten als `jsonb NOT NULL`; `SELECT slug, version, metadata->>'usage_kind', jsonb_array_length(blocks), question_count, length(required_closing_statement) FROM template WHERE slug='partner_diagnostic'` = `('partner_diagnostic', 'v1', 'self_service_partner_diagnostic', 6, 24, 206)`; Regression-Check: `exit_readiness + mitarbeiter_wissenserhebung` haben `metadata='{}'` (Default unveraendert). Hinweis zu ON CONFLICT: ARCHITECTURE.md V6.3 sprach von `(slug, version)`, der echte UNIQUE-Constraint ist aber nur `slug` (MIG-021). Migration 093 nutzt `ON CONFLICT (slug) DO UPDATE` — idempotent und Update-faehig. Commit `770dbd5` auf main.

### MIG-038 — V6.3 SLC-105 MT-4 rpc_finalize_partner_diagnostic Stored-Proc (Migration 094, live)
- Date: 2026-05-16
- Scope:
  - `sql/migrations/094_v63_finalize_partner_diagnostic_rpc.sql` — Neue PL/pgSQL-Function `public.rpc_finalize_partner_diagnostic(p_payload jsonb)` als `SECURITY DEFINER` mit `search_path=public`. Function fuehrt fuer N Bloecke (V6.3: 6) jeweils 3 INSERTs aus (`block_checkpoint`, `knowledge_unit`, `validation_layer`) plus ein `UPDATE capture_session SET status='finalized'` — alles in einer einzigen Postgres-Transaktion. Returns jsonb mit `block_count`, `knowledge_unit_ids`, `capture_session_id`. `GRANT EXECUTE ... TO service_role`.
- Reason: Architecture-Anforderung "BEGIN TRANSACTION ... COMMIT" (ARCHITECTURE.md V6.3 Phase 4c) ueber alle Light-Pipeline-Schreib-Operationen. Supabase-JS hat keine echte Tx-API fuer Multi-Table-Inserts. Stored-Proc mit `LANGUAGE plpgsql` ist die einzige saubere Loesung (Precedent: `rpc_bulk_import_knowledge_units` aus MIG-035). Light-Pipeline (`runLightPipeline` in `src/workers/condensation/light-pipeline.ts`) ruft die RPC nach erfolgreicher Bedrock-Verdichtung — bei RPC-Fehler bleibt `capture_session.status='submitted'` (Rollback durch DB-Tx).
- Affected Areas: 1 neue Function in `public`-Schema. Keine Schema-DDL, keine RLS-Aenderungen, keine CHECK-Erweiterungen. Keine Daten-Migrationen. `service_role` EXECUTE-Grant gesetzt; `tenant_member`/`anon` haben keinen Zugriff (`SECURITY DEFINER`).
- Risk: Sehr gering. Function ist `CREATE OR REPLACE` (idempotent). Keine Bestandsdaten beruehrt. Function wird nur von Worker-Code mit Service-Role-Key aufgerufen. Eingangs-Validierung schuetzt vor missgebildeten Payloads (`tenant_id`/`session_id`/`owner_user_id` NOT NULL Check, `blocks`-Array-Validierung, leeres Array fuehrt zu Exception).
- Rollback Notes: Manuell: `DROP FUNCTION IF EXISTS public.rpc_finalize_partner_diagnostic(jsonb);`. Bei eventueller Wieder-Anlage im falschen Schema (z.B. `storage` bei search_path-Drift): Migration 094 enthaelt `DROP FUNCTION IF EXISTS storage.rpc_finalize_partner_diagnostic(jsonb);` als Cleanup.
- Live-Deploy: **LIVE auf Hetzner 2026-05-16 18:11 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-091026513867`. Erster Apply landete versehentlich im `storage`-Schema (search_path `"", storage, public, extensions` von postgres-User stellt storage vor public). Fix: Migration auf `public.rpc_finalize_partner_diagnostic` umbenannt, zweimal applied (`CREATE FUNCTION` ueberschreibt, `DROP FUNCTION IF EXISTS storage.rpc_finalize_partner_diagnostic` raeumt die fehlplatzierte Funktion auf). Verifikation: `SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.proname='rpc_finalize_partner_diagnostic'` → `public` (1 row). Befund: Auf Coolify-Supabase-DB hat der `postgres`-User search_path `"", storage, public, extensions` — neue Functions MUESSEN explizit `public.` prefixed werden, sonst landen sie im storage-Schema. In Header-Kommentar von 094 dokumentiert.


### MIG-039 — V6.3 SLC-105 ISSUE-076 Hotfix ai_cost_ledger CHECK-Constraint-Extension (Migration 095, live)
- Date: 2026-05-17
- Scope:
  - `sql/migrations/095_v63_cost_ledger_light_pipeline_role.sql` — DROP + Re-CREATE der CHECK-Constraint `ai_cost_ledger_role_check`. Erweiterung des erlaubten role-Enums um `'light_pipeline_block'` (zusaetzlich zu den 14 bestehenden Werten analyst/challenger/chat/memory/embedding/orchestrator/sop_generator/diagnosis_generator/evidence_mapper/dialogue_extractor/bridge_engine/walkthrough_pii_redactor/walkthrough_step_extractor/walkthrough_subtopic_mapper).
- Reason: ISSUE-076 im /qa-Live-Smoke 2026-05-17 entdeckt: `src/workers/condensation/light-pipeline.ts:342` schreibt `role='light_pipeline_block'`, alte CHECK-Constraint verbietet diesen Wert, INSERT failt mit Constraint-Violation, `captureException` schluckt den Fehler — AC-14 ("Bedrock-Kosten pro Run werden in ai_cost_ledger protokolliert") silent broken. Fix-Optionen waren (a) Constraint erweitern oder (b) Code auf bestehenden role-Wert wie `'orchestrator'` umstellen. Option (a) gewaehlt weil Semantik "Light-Pipeline ist eigene Cost-Klasse" erhalten bleibt und Diagnose-Reporting im Production-Audit eindeutig nach Light-Pipeline-Calls filterbar bleiben muss.
- Affected Areas: 1 CHECK-Constraint auf `public.ai_cost_ledger` (DROP + CREATE im selben Transaction-Block). Keine Schema-DDL, keine Daten-Migration, keine RLS-Aenderungen, keine RPCs. Backwards-kompatibel: existierende 14 role-Werte unveraendert erlaubt.
- Risk: Sehr gering. Constraint-Extension ist additiv. Existierende Cost-Ledger-Rows mit den 14 alten role-Werten bleiben valid (CHECK gilt nur fuer INSERT/UPDATE). Idempotenz: Re-Apply ist `DROP IF EXISTS` + neue Constraint mit gleichen + zusaetzlichem Wert.
- Rollback Notes: Manuell: `ALTER TABLE public.ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check; ALTER TABLE public.ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY['analyst', 'challenger', 'chat', 'memory', 'embedding', 'orchestrator', 'sop_generator', 'diagnosis_generator', 'evidence_mapper', 'dialogue_extractor', 'bridge_engine', 'walkthrough_pii_redactor', 'walkthrough_step_extractor', 'walkthrough_subtopic_mapper']));`. Pre-Apply-Backup nicht zwingend (Pure-DDL auf Single-Constraint, kein Datenverlust-Risiko).
- Live-Deploy: **LIVE auf Hetzner 2026-05-17 ~08:59 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-064843079054` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Apply-Result: `BEGIN -> ALTER TABLE -> ALTER TABLE -> COMMIT`. Post-Apply `pg_get_constraintdef` zeigt erweitertes Enum-Array. Re-Smoke (zweite Diagnose-Session des Test-Mandanten) verifiziert: 6 ai_cost_ledger-Eintraege mit `role='light_pipeline_block'`, total $0.022080 (78% Headroom unter $0.10-Budget AC-14), 2720 input + 928 output tokens, 30.0s Bedrock-Duration. AC-14 jetzt voll erfuellt. RPT-284 dokumentiert vollstaendigen Fix-Pfad.


### MIG-041 — V7 SLC-131 partner_organization.slug + Backfill + UNIQUE (Migration 097 + 097a, LIVE)
- Date: 2026-05-18 (Migration 097 LIVE 08:33 UTC + Migration 097a DEFAULT-Patch LIVE 08:48 UTC auf Hetzner Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-102228495360`)
- Scope:
  - `sql/migrations/097_v7_partner_organization_slug.sql` — `ALTER TABLE public.partner_organization ADD COLUMN IF NOT EXISTS slug text;` + Backfill-DO-Block via `lower(translate(...))` + `regexp_replace`-Sanitizing + WHILE-Loop-Kollisions-Resolver (`-2`/`-3`-Suffix) fuer alle Rows mit `slug IS NULL` + `ALTER COLUMN slug SET NOT NULL` + `CREATE UNIQUE INDEX IF NOT EXISTS partner_organization_slug_lower_unique ON partner_organization (lower(slug))`. Idempotent ueber `ADD COLUMN IF NOT EXISTS` + `WHERE slug IS NULL` + `CREATE UNIQUE INDEX IF NOT EXISTS` — zweiter Apply ist No-Op (Backfill-Loop hat keine Kandidaten, ALTER COLUMN SET NOT NULL ist no-op wenn schon NOT NULL).
- Reason: V7 FEAT-052 — URL-bare Partner-Identifikation via Slug. Landing-Page-URL `intelligence.strategaize.com/p/<slug>` braucht aufloesbaren Slug-Schluessel statt UUID. Existierende V6-Partner-Tenants (Internal-Test-Mode ~2-3 Rows) bekommen Auto-Slug aus `display_name` per DEC-130. UNIQUE-Constraint blockt Duplikate. NOT NULL erst nach Backfill — atomar in BEGIN/COMMIT-Block.
- Affected Areas: 1 neue Spalte `partner_organization.slug` (text NOT NULL). 1 neuer UNIQUE-Index `partner_organization_slug_lower_unique` auf `lower(slug)` (case-insensitive). Keine RLS-Aenderungen (Public-Resolve via Service-Role bzw. ohne RLS-Anforderung). Keine RPCs. Keine FK-Aenderungen. Application-Code: neuer `src/lib/partner/slug.ts` + `src/lib/partner/reserved-slugs.ts` Helper, `createPartnerOrganization`-Server-Action setzt Slug automatisch bei Anlage. Public-Resolve-Endpoint `GET /api/public/partner/[slug]/route.ts` nutzt diesen Slug fuer Branding-Lookup.
- Risk: Sehr gering. Backfill-DO-Block ist deterministisch + idempotent. Bei naiver Umlaut-Transliteration (translate + regex) koennen suboptimale Slugs entstehen (z.B. `mueller-partner` statt korrektem `mueller-partner` — gleiches Ergebnis durch zufaellige Konvergenz, aber bei komplexen Namen wie "Æble StB" wuerde naive Translation `ble-stb` ergeben). Strategaize-Admin kann Slug-Werte nach Apply via SQL nachjustieren — V7 hat keine Slug-Edit-UI (V8+). Kollisions-Resolver-WHILE-Loop ist effectively bounded (Volumen ~2-3 Rows). Reserve-Slug-Check ist Application-Layer, nicht DB-Constraint — wenn Backfill versehentlich `admin` ergibt (sehr unwahrscheinlich, weil kein Partner so heisst), bleibt Slug in DB eindeutig aber Application blockt Lookup → Admin korrigiert per SQL.
- Rollback Notes: Manuell: `DROP INDEX IF EXISTS public.partner_organization_slug_lower_unique; ALTER TABLE public.partner_organization DROP COLUMN IF EXISTS slug;`. Reversibel ohne Datenverlust (Slug-Daten werden geloescht, aber `display_name` bleibt — Slug-Regeneration immer wiederholbar). Pre-Apply-Backup: `pg_dump --schema-only --table=partner_organization` reicht. Application-Code-Rollback per Coolify-Image-Tag-Switch auf V6.4-Tag erforderlich, sonst werfen Public-Endpoints 500 bei fehlender slug-Spalte.

### MIG-043 — V7 SLC-134 pending_signup GRANTs Fix (Migration 098a, LIVE 16:58 UTC)
- Date: 2026-05-18 (LIVE auf Hetzner 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-102228495360 ~16:58 UTC; danach `NOTIFY pgrst, 'reload schema'` damit PostgREST den Tabellen-API-Endpoint erkennt).
- Scope:
  - `sql/migrations/098a_v7_pending_signup_grants.sql` — `GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_signup TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_signup TO authenticated;` Idempotent (GRANT-Statements sind by-default idempotent).
- Reason: **P0 Production-Bug entdeckt durch SLC-134 Pen-Test.** Migration 098 hat `pending_signup` mit `ENABLE ROW LEVEL SECURITY` aber OHNE explizite Table-GRANTs angelegt. Default-Owner-only-Grants bedeuten: service_role (POST /api/public/signup) und authenticated (potenzielle Future-Use) bekamen `permission denied for table pending_signup`, sobald sie auf die Tabelle zugreifen wollten. Pre-Production-Live-Smoke haette dies SOFORT als 500-Error geworfen. Pen-Test SLC-134 hat den Bug vor dem ersten Live-Signup-Versuch identifiziert. Profiles-Tabelle hat zum Vergleich: `service_role` + `authenticated` INSERT/SELECT/UPDATE/DELETE.
- Affected Areas: GRANTS auf `public.pending_signup`. Schema-Cache von PostgREST muss neu geladen werden (`NOTIFY pgrst, 'reload schema'`) — sonst zeigt `/rest/v1/pending_signup` HTTP 404 statt 201/200. RLS-Policies bleiben unveraendert (default-deny, service_role bypasst RLS via Server-Side-Token).
- Risk: Null. Reine GRANT-Hinzufuegung. Idempotent. Kein DDL-Schema-Change. anon-Role bekommt absichtlich KEIN GRANT — der Public-Signup-Endpoint nutzt service_role-Server-Side, kein Browser-anon-Zugriff erwuenscht.
- Rollback Notes: Manuell: `REVOKE ALL ON public.pending_signup FROM service_role, authenticated;`. Nicht empfohlen — wuerde Production sofort wieder brechen. Migration ist defense-in-depth gegen Signup-Endpoint-Outage.
- Live-Deploy: LIVE 2026-05-18 ~16:58 UTC. Apply per base64 + psql -U postgres. Verifikation `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='pending_signup' AND grantee='service_role'` zeigt 4 Rows (SELECT/INSERT/UPDATE/DELETE). Anschliessend `NOTIFY pgrst, 'reload schema'` damit PostgREST den Endpoint erkennt. Post-Reload-Smoke: `curl POST /rest/v1/pending_signup ... -> HTTP 201`. RPT-305 (SLC-134) dokumentiert Apply.

### MIG-042 — V7 SLC-132 pending_signup + partner_client_mapping invitation_source + DSGVO-Consent (Migration 098, LIVE 09:19 UTC)
- Date: 2026-05-18 (LIVE auf Hetzner 159.69.207.29 supabase-db-bwkg80w04wgccos48gcws8cs-102228495360 09:19 UTC. Pre-Apply-Backup `/opt/onboarding-plattform-backups/pre-mig-042-098_20260518_111944.sql`. Schema-Drift-Korrektur: FK `partner_tenant_id` auf `tenants(id)` Plural statt `tenant(id)` Singular wie in ARCHITECTURE.md Line 6166. Pre-Apply-Schema-Check per IMP-613 hat den Drift entdeckt.)
- Scope:
  - `sql/migrations/098_v7_pending_signup_and_mapping_source.sql` — `CREATE TABLE IF NOT EXISTS public.pending_signup (id uuid PK, partner_tenant_id uuid FK tenant(id), email_lower text, first_name text, last_name text, company_name text NULL, dsgvo_consent_text_version text, dsgvo_consent_accepted_at timestamptz, verify_token_hash text, expires_at timestamptz, status text DEFAULT 'pending' CHECK IN ('pending','verified','expired'), verified_at timestamptz NULL, created_at timestamptz DEFAULT now())` + 3 Indizes (`pending_signup_partner_email_unique_pending` UNIQUE auf `(partner_tenant_id, email_lower) WHERE status='pending'`, `pending_signup_token_hash_lookup` auf `verify_token_hash WHERE status='pending'`, `pending_signup_expires_status` auf `(expires_at, status)`) + RLS ENABLE ohne Policies (default deny, service_role bypasst RLS). + `ALTER TABLE partner_client_mapping ADD COLUMN IF NOT EXISTS invitation_source text NOT NULL DEFAULT 'partner_invite', ADD COLUMN IF NOT EXISTS dsgvo_consent_text_version text NULL, ADD COLUMN IF NOT EXISTS dsgvo_consent_accepted_at timestamptz NULL;` + `ALTER TABLE partner_client_mapping DROP CONSTRAINT IF EXISTS partner_client_mapping_invitation_source_check; ALTER TABLE partner_client_mapping ADD CONSTRAINT partner_client_mapping_invitation_source_check CHECK (invitation_source IN ('partner_invite','self_signup'));`. Idempotent ueber `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS` Pattern.
- Reason: V7 FEAT-053 — Email-Verify-Mechanik via Custom `pending_signup` (DEC-129) + `partner_client_mapping`-Erweiterung um `invitation_source` (`partner_invite`-V6-Default oder `self_signup`-V7) + DSGVO-Consent-Versions-String + Timestamp am Mapping (DSGVO-Audit-Trail). Token-Hash-Speicherung ohne Klartext + 24h-TTL-Pattern + Race-Condition-Safe via UNIQUE-Constraint auf `(partner_tenant_id, email_lower) WHERE status='pending'`.
- Affected Areas: 1 neue Tabelle `pending_signup` mit 12 Spalten + 3 Indizes + RLS-default-deny. 3 neue Spalten in `partner_client_mapping` (`invitation_source`, `dsgvo_consent_text_version`, `dsgvo_consent_accepted_at`). 1 neue CHECK-Constraint auf `partner_client_mapping.invitation_source`. Bestehende V6-Mappings bekommen DEFAULT `'partner_invite'` — keine Daten-Migration noetig (existierende V6-Daten bleiben semantisch korrekt: V6-Mandanten kamen ueber Partner-Admin-Invite-Pfad). Keine RPCs. Keine RLS-Policies auf pending_signup (default deny + service_role bypass — Public-Endpoints nutzen Service-Role).
- Risk: Sehr gering. CREATE TABLE ist nicht destruktiv. ADD COLUMN mit DEFAULT auf existing Tabelle ist O(n) bei der Apply-Zeit aber Internal-Test-Mode-Volumen (~5-10 Mapping-Rows) ist trivial. CHECK-Constraint ist additiv (akzeptiert nur 2 Werte, beide schon explizit oder via DEFAULT abgedeckt). UNIQUE-Constraint mit `WHERE status='pending'` ist Partial-Index — bei Apply auf leere Tabelle 0 Konflikt-Risiko. RLS-ENABLE-ohne-Policies = explicit-deny, Service-Role-Pattern entspricht DEC-065. Idempotenz: zweiter Apply laesst alle IF-NOT-EXISTS-Statements no-op durchlaufen, CHECK-Constraint wird per DROP-IF-EXISTS+ADD recreated (cleaner Re-Apply ohne Constraint-Name-Konflikt).
- Rollback Notes: Manuell: `DROP TABLE IF EXISTS public.pending_signup CASCADE; ALTER TABLE public.partner_client_mapping DROP CONSTRAINT IF EXISTS partner_client_mapping_invitation_source_check; ALTER TABLE public.partner_client_mapping DROP COLUMN IF EXISTS invitation_source; ALTER TABLE public.partner_client_mapping DROP COLUMN IF EXISTS dsgvo_consent_text_version; ALTER TABLE public.partner_client_mapping DROP COLUMN IF EXISTS dsgvo_consent_accepted_at;`. Reversibel mit Datenverlust nur in `pending_signup` (unverifizierte Signups bleiben unverloren wenn Cron sie schon zu verifizierten Tenants provisioniert hat — diese Tenants bleiben in `tenant`/`auth.users`/`partner_client_mapping` bestehen, nur `pending_signup`-Audit-Eintraege gehen verloren). Application-Code-Rollback per Coolify-Image-Tag-Switch auf V6.4-Tag erforderlich, sonst werfen Public-Endpoints 500 bei fehlender Tabelle. Pre-Apply-Backup: `pg_dump --schema-only --table=partner_client_mapping` reicht (pending_signup ist neu).

### MIG-040 — V6.4 SLC-130 Template-Versionierung UNIQUE(slug, version) (Migration 096, live)
- Date: 2026-05-17
- Scope:
  - `sql/migrations/096_v64_template_slug_version_unique.sql` — `ALTER TABLE public.template DROP CONSTRAINT IF EXISTS template_slug_key;` + `CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version);`. Idempotent ueber DROP IF EXISTS + CREATE IF NOT EXISTS — zweiter Apply ist No-Op.
- Reason: BL-105 / SLC-130 — echte Template-Versionierung als Architektur-Polish-Investition. Vor MIG-040 ueberschrieb ein `INSERT ... ON CONFLICT (slug) DO UPDATE` die existierende Template-Row und damit auch die umrahmenden Block-Titel/Intros in bereits abgeschlossenen Mandanten-Berichten (bericht/page.tsx rendert per `session.template_id`-Lookup, der jetzt aber dieselbe Row zeigt). Mit V6.4 koexistieren mehrere Versions, neue Sessions referenzieren die juengste per `ORDER BY created_at DESC LIMIT 1` in `actions.ts:117-130` + `start/page.tsx:79-86`, alte Sessions bleiben an ihrer originalen `template_id`-FK. Spaetestens vor V7 Self-Signup-Funnel (BL-098) muss diese Saubere Versionierung stehen — Vertrauens-Asset fuer Steuerberater, die alte Mandanten-Berichte 6 Monate spaeter mit originalen Texten oeffnen wollen.
- Affected Areas: 1 UNIQUE-Constraint auf `public.template` (DROP `template_slug_key`) + 1 neuer UNIQUE-Index (`template_slug_version_unique`). Keine Schema-DDL ausser Constraint-Wechsel, keine Daten-Migration noetig (bestehende 3 Template-Rows haben heute eindeutige `(slug, version)`-Kombinationen — verifiziert vor Apply via `SELECT slug, version, COUNT(*) FROM template GROUP BY slug, version HAVING COUNT(*) > 1` → 0 Rows). Keine RLS-Aenderungen, keine RPCs, kein neuer Spalten. Bestehende capture_session.template_id-FKs bleiben funktional — referenzieren weiter Template-Rows per UUID. Migration 094 (`rpc_finalize_partner_diagnostic`) bleibt funktional, nutzt session.template_id direkt.
- Risk: Sehr gering. Constraint-Wechsel ist atomar im selben Transaction-Block. Idempotenz garantiert. Funktional-Smoke nach Apply verifiziert: 2 Versions desselben Slugs koennen koexistieren (`INSERT (smoke_mig096, v1)` + `INSERT (smoke_mig096, v2)` → beide INSERT 0 1, ROLLBACK clean).
- Rollback Notes: Manuell: `DROP INDEX IF EXISTS public.template_slug_version_unique; ALTER TABLE public.template ADD CONSTRAINT template_slug_key UNIQUE (slug);`. Vorausgesetzt zu diesem Zeitpunkt existiert keine V2-Row fuer einen bestehenden Slug — sonst muesste die V2-Row erst gedroppt werden (FK-CASCADE auf capture_session.template_id ist RESTRICT, daher manueller Cleanup noetig). Pre-Apply-Backup unter `/opt/onboarding-plattform-backups/pre-mig-040-096_20260517_095124.sql` (Schema-only template-Tabelle).
- Live-Deploy: **LIVE auf Hetzner 2026-05-17 ~09:51 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-080508729886` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Apply-Result: `NOTICE: template_slug_key constraint dropped` + `NOTICE: template_slug_version_unique index ensured` + `DO`. Post-Apply-Verifikation: `pg_constraint` zeigt 0 UNIQUE-Constraints mehr auf template, `pg_indexes` zeigt neuen Index. Funktional-Smoke 2x INSERT (slug='smoke_mig096', v1 + v2) PASS + ROLLBACK clean. Vitest 3/3 PASS gegen Coolify-DB (Cross-Version-Read + UNIQUE-Enforced + alter-Constraint-weg). SLC-105 Baseline-Tests 55/55 regression-frei. RPT-289 (kommt in /backend-Completion) dokumentiert Apply.

### MIG-044 — V7.1 SLC-136 text_override + text_override_history Tabellen (Migration 101, live 2026-05-20)
- Date: 2026-05-20
- Scope: Helper-Praeambel (4 Objekte: `is_strategaize_admin(uuid)`, `current_tenant_id()`, View `partner_admin_view`, View `tenant_to_partner_view`) + Neue Tabellen `text_override` (UNIQUE auf scope+scope_id+text_key+locale, CHECK scope IN ('global','template','partner'), CHECK scope_id_matches_scope) + `text_override_history` (Audit-Log, INSERT-only) + RLS-Policies (7 Policies: admin_all + partner_read_global_template + partner_own + tenant_read auf text_override; admin_all + partner_own + insert_self auf text_override_history) + GRANTs auf service_role + authenticated + Indizes auf (text_key, locale), (scope, scope_id), (text_key, locale, created_at DESC), (editor_id, created_at DESC) + View-Grants.
- Reason: V7.1 FEAT-055 Inline-Text-Override-Foundation (DEC-140). User-Direktive 2026-05-20 nach SLC-700-Live-Test: alle User-sichtbaren Texte editierbar ohne Code-Deploy. Helper-Praeambel pro DEC-149 nachgezogen, weil Pre-Migration-Check beim SLC-136-Start aufdeckte dass die in ARCHITECTURE.md vorausgesetzten 4 Objekte (`is_strategaize_admin`, `partner_admin_view`, `tenant_to_partner_view`, `current_tenant_id`) nie in V6 Migration 090 erstellt wurden.
- Affected Areas: 4 neue public-Helper-Objekte + 2 neue Tabellen (text_override, text_override_history). Keine Aenderung an bestehenden Tabellen. Bestehende `auth.user_tenant_id()`-Function wird wrap-aliased durch `current_tenant_id()`. Bestehende `profiles.role`-Column wird durch `is_strategaize_admin(uuid)` SECURITY-DEFINER-gelesen.
- Apply-Procedure: Coolify-Postgres-Container 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-*` via `docker exec -i ... psql -U postgres -d postgres < /tmp/101_v71_text_override_foundation.sql`. NOTIFY pgrst, 'reload schema' Post-Apply. Re-Apply idempotent verifiziert. GRANTs verifiziert: text_override hat service_role + authenticated mit SELECT/INSERT/UPDATE/DELETE; text_override_history hat authenticated mit SELECT/INSERT (append-only) und service_role mit Full-Set.
- Risk: GRANTs muessen fuer service_role + authenticated korrekt gesetzt sein (siehe `feedback_migration_rls_needs_grants.md` IMP-Lehre aus OP V7 SLC-134). CHECK-Constraint scope_id_matches_scope ist Pflicht (sonst inkonsistente Rows wie scope=global, scope_id=<UUID>). Helper-Function `is_strategaize_admin` ist SECURITY DEFINER — sie liest profiles ohne Tenant-Scope. Falls profiles-Table-Layout-Aenderung kommt: Function muss mitgenommen werden.
- Rollback Notes: `DROP TABLE text_override_history; DROP TABLE text_override; DROP VIEW tenant_to_partner_view; DROP VIEW partner_admin_view; DROP FUNCTION current_tenant_id(); DROP FUNCTION is_strategaize_admin(uuid);` reversibel. Saves seit Live-Apply bleiben jedoch verloren (kein Backup-Restore noetig wenn vor V7.1-Deploy gerollback). Helper-Objekte bleiben optional erhalten weil SLC-138/139 sie auch nutzen werden — bei vollem V7.1-Rollback alle vier mitnehmen.

### MIG-045 — V7.1 SLC-138 template.questions[].helper_text + examples_md Schema-Erweiterung (Migration 099 + 099a, live 2026-05-21)
- Date: 2026-05-21
- Scope: Schema-additive Erweiterung am `template.blocks[].questions[]` JSONB-Array. Neue optionale Felder pro question: `helper_text` (max 300 chars) + `examples_md` (max 800 chars, Markdown-Subset). Bestehende Templates unveraendert. Migration 099 fuehrt `validate_helper_text_schema()` Pure-Validation-Function + Enforcement-Trigger `template_helper_text_schema_check` BEFORE INSERT/UPDATE OF blocks ein. Migration 099a seeded Initial-Content fuer alle 24 Fragen des `partner_diagnostic v1`-Templates (LLM-Draft, Founder-Review-pending via EditableText). Apply-Procedure: standardmaessig per `sql-migration-hetzner.md` durchgelaufen, Container-Suffix `075443571501`, Pre-flight-Backups `pre-mig-045-099_20260521_083525.sql` + `pre-mig-045-099a_*`. Post-Apply Validation: 24/24 Fragen mit helper_text (240-277 chars) + examples_md (254-357 chars), schema-validation PASSED. Smoke-Tests durch: 301-char helper_text wird vom Trigger rejected mit JSONB-Violation-Detail.
- Reason: V7.1 FEAT-057 Helper-Texts pro Frage (BL-115). Conversion-Killer entfernen bei Fach-Begriffen wie "Wissensbereich", "Pflicht-Output".
- Affected Areas: `template`-Tabelle JSONB-Schema, Lookup-Pfad in Diagnose-Run-Page (Info-Icon-Rendering bei vorhandenem helper_text). KEINE ALTER TABLE noetig (JSONB-additiv). Validation-Function `validate_helper_text_schema()` prueft idempotent.
- Cross-Repo-Sync-Pflicht: IS V3 Questionnaire Builder (DEC-063 IS-Repo) MUSS identische Schema-Form erzeugen. Spiegel-DEC-073 in IS-DECISIONS.md. Schema-Drift waere Production-Bug (Builder-Output nicht-renderbar in OP-Light-Pipeline).
- Risk: Falls Initial-Content (099a) Texte > 300/800 chars enthaelt: Validation-Function schlaegt fehl. Mitigation: Content-Validierung vor Migration-Apply via `validate_helper_text_schema()`-Probe.
- Rollback Notes: Schema-additiv -> Rollback = `UPDATE template SET blocks = blocks_strip_helper(blocks);` (Helper-Function unstrip Felder helper_text + examples_md). Bestaande Templates ohne Helper-Texts unbetroffen.

### MIG-046 — V7.2 SLC-139 diagnose_event Tabelle (Migration 100, live 2026-05-21)
- Date: 2026-05-21
- Scope: Neue Tabelle `diagnose_event` mit (capture_session_id FK, tenant_id FK, partner_org_id FK NULL, event_type CHECK 9-Werte-Enum, question_key NULL, payload jsonb, is_test bool, created_at timestamptz) + Indizes auf (capture_session_id, created_at) + (tenant_id, event_type, created_at) + (partner_org_id, created_at WHERE NOT NULL) + 3 RLS-Policies (strategaize_admin all, partner_admin SELECT own partner_org_id, authenticated INSERT own-tenant) + GRANTs (SELECT/INSERT authenticated, SELECT partner_admin, ALL service_role). LIVE auf Coolify-DB Container `supabase-db-bwkg80w04wgccos48gcws8cs-150442851439` 2026-05-21 + NOTIFY pgrst.
- Reason: V7.1 FEAT-058 Diagnose-Funnel-Telemetrie (BL-117). Drop-off pro Frage, Helper-Text-Hits, Time-on-Question als Funnel-Optimierungs-Grundlage (Learning-Loop).
- Affected Areas: Neue Tabelle, keine Aenderung an bestehenden Tabellen. RLS verbietet tenant_admin + tenant_member SELECT (nur strategaize_admin + partner_admin sehen Events). INSERT erlaubt fuer authenticated mit Insert-Policy `tenant_id = current_tenant_id() AND capture_session_id gehoert own-tenant`.
- DSGVO-Schutz: Event-Payload OHNE Klartext-PII (keine Antwort-Inhalte, keine Email, keine IP). Aggregations-Schwelle 5 Sessions pro Filter-Kombo in Analytics-Page (Re-Identifikations-Schutz).
- Risk: Volumen-Wachstum bei Production-Skalierung. V7.1 100%-Sampling (DEC-147), Sampling-Mechanik V8+ via ENV nachruestbar. Index-Sizing pruefen nach ersten 30 Tagen Live-Daten.
- Rollback Notes: `DROP TABLE diagnose_event;` reversibel. Aggregations-Page wuerde Empty-State zeigen. Cleanup-Cron (separate Future-Slice V7.2+) wuerde alte Events nach DSGVO-Retention-Frist (z.B. 90 Tage) loeschen.

### MIG-111 — V9.5 Cross-Thread-Synthese-Stage Schema (email_synthesized_unit + Status + Cost-Spalte) (APPLIED 2026-06-12)
- Date: 2026-06-12
- Scope: `sql/migrations/119_v95_synthesis_stage.sql` (Code-Side geschrieben + LIVE applied 2026-06-12 via base64+psql -U postgres). **R-B-1 LIVE-Stand-Verifikation vorab** (pg_get_constraintdef gegen Coolify-DB): (1) `email_bulk_run.status` CHECK Drop+Add — 16 LIVE-Werte (inkl. V9.1-Zusaetze `continuous`/`paused`/`awaiting_approval`, NICHT MIG-106's 13) + `'synthesizing'` + `'synthesized'` = 18. (2) `email_bulk_run.synthesis_cost_eur numeric(8,4) NOT NULL DEFAULT 0` neu + GENERATED-Spalte `total_cost_eur` DROP+RECREATE auf `(pre_filter_cost_eur + pattern_extraction_cost_eur + synthesis_cost_eur) STORED`. **Zwei abhaengige Views** (`vw_bulk_email_cost_monthly` + `vw_bulk_email_cost_daily`, beide security_invoker=true) mussten vor dem Column-Drop gedroppt + danach identisch neu angelegt werden (SELECT-GRANT authenticated/service_role). (3) `ai_cost_ledger.role` CHECK + `ai_jobs.job_type` CHECK je um `'email_bulk_synthesis'` erweitert (LIVE-Listen 1:1 + neuer Wert) — sonst CHECK-Violation beim Cost-Ledger-INSERT (AC-B-4) bzw. beim Enqueue der Synthese-Job-Row (MT-5). (4) NEUE Tabelle `email_synthesized_unit` (id, tenant_id FK tenants, bulk_run_id FK email_bulk_run ON DELETE CASCADE, title, description, evidence_snippets jsonb, themes text[], suggested_section, aggregated_confidence numeric(3,2), evidence_count int, source_pattern_ids uuid[], curation_status CHECK(pending_curation|accepted|rejected|edited) DEFAULT 'pending_curation', curated_section, curator_user_id FK auth.users, curated_at, imported_to_handbook_at, imported_knowledge_unit_id FK knowledge_unit ON DELETE SET NULL, created_at). (5) NEUE Join-Tabelle `email_synthesized_unit_source` (id, synthesized_unit_id FK ON DELETE CASCADE, pattern_id FK email_pattern ON DELETE CASCADE, thread_id uuid, tenant_id FK tenants ON DELETE CASCADE) + UNIQUE(synthesized_unit_id, pattern_id). (6) RLS-Matrix analog MIG-106 (ENABLE, kein FORCE — wie email_pattern; strategaize_admin SELECT cross-tenant; tenant_admin SELECT/INSERT/UPDATE own-tenant via auth.user_role()+auth.user_tenant_id()) + GRANTs authenticated/service_role + Indizes (bulk_run_id), (bulk_run_id, curation_status), (tenant_id), _source(synthesized_unit_id), _source(pattern_id), _source(tenant_id).
- Reason: V9.5 FEAT-080/081 — additive Cross-Thread-Synthese-Stage zwischen `pattern_extracted` und `curating`. Repraesentation als eigene Tabelle (DEC-214, da email_pattern.thread_id NOT NULL Single-FK + thread-lokale Pseudonyme). Cost-Spalte fuer Live-Cap-Abdeckung der Synthese-Calls (DEC-217, R2 BLOCKING).
- Affected Areas: `email_bulk_run` (Status-CHECK + 1 neue Spalte + GENERATED-Recreate), `ai_cost_ledger`/`ai_jobs` (je 1 CHECK-Wert), 2 abhaengige Cost-Views (drop+recreate), 2 neue Tabellen + RLS. Bestehende `email_pattern`/`email_message`/`email_thread` strukturell unveraendert. Curation-UI + `importAcceptedPatterns` lesen kuenftig `email_synthesized_unit` (Code SLC-V9.5-D, nicht Schema).
- Risk: GENERATED-Spalten-DROP+RECREATE auf `total_cost_eur` (STORED → wird bei Recreate neu materialisiert; pre-existing Runs erhalten synthesis_cost_eur=0 → total bleibt korrekt). Status-CHECK-Erweiterung uebernimmt alle 16 LIVE-Werte (kein Bestands-Status bricht). View-Drop+Recreate muss Definition + security_invoker + GRANTs exakt spiegeln (verifiziert gegen pg_get_viewdef). RLS-Pen-Test in /qa (SC-V9.5-8).
- Rollback Notes: `DROP TABLE email_synthesized_unit_source; DROP TABLE email_synthesized_unit;` + `email_bulk_run` Status-CHECK auf MIG-106+V9.1-Stand (16 Werte) zuruecksetzen + `total_cost_eur` GENERATED auf `(pre_filter + pattern_extraction)` zuruecksetzen (Views erneut drop+recreate) + `DROP COLUMN synthesis_cost_eur` + `ai_cost_ledger.role`/`ai_jobs.job_type` CHECK ohne `email_bulk_synthesis` neu. Reversibel solange keine `synthesized`-Runs existieren (sonst Status-Backfill noetig).

### MIG-112 — V9.5 Bounded-Critic Cost-Ledger-Role (`email_bulk_critic`) (APPLIED 2026-06-12)
- Date: 2026-06-12
- Scope: `sql/migrations/120_v95_critic_role.sql` (Code-Side geschrieben + LIVE applied 2026-06-12 via base64+psql -U postgres). `ai_cost_ledger.role` CHECK Drop+Add — Rebuild vom LIVE-Stand (pg_get_constraintdef vorab gegen Coolify-DB verifiziert: 20 Werte, identisch mit MIG-111) + `'email_bulk_critic'` = 21 Werte. KEIN `ai_jobs.job_type`-Add: der Critic laeuft als zweite LLM-Phase im SELBEN `email_bulk_synthesis`-Job (job_id = Synthese-Job-ID, DEC-216), es entsteht kein neuer Job-Typ.
- Reason: V9.5 FEAT-081 SLC-V9.5-C (R-C-3/AC-C-3) — der bounded Critic-Pass schreibt seinen Cost-Audit-Eintrag mit eigener role `email_bulk_critic` in `ai_cost_ledger`. Ohne CHECK-Erweiterung schlaegt der INSERT mit CHECK-Violation fehl (non-fatal gefangen, aber Audit-Luecke). Slice-Spec-Annahme "role ist freitext" war falsch — Live-Verify zeigte den CHECK (IMP-1228-Disziplin).
- Affected Areas: `ai_cost_ledger` (1 CHECK-Constraint, 1 neuer erlaubter Wert). Keine Tabellen-/Spalten-/RLS-Aenderung.
- Risk: Minimal — Drop+Add eines CHECK mit Superset der Live-Werte; kein Bestands-Row verletzt den neuen CHECK.
- Rollback Notes: CHECK ohne `'email_bulk_critic'` neu anlegen (20-Werte-Liste aus MIG-111). Reversibel solange keine Ledger-Rows mit role `email_bulk_critic` existieren (sonst vorher Rows loeschen oder role nullen).

### MIG-127 — V10 SLC-172 Blueprint-Diagnostik: atomarer KU-Seed-RPC (`rpc_seed_blueprint_diagnosis_input`) (GESCHRIEBEN + DB-VERIFIZIERT 2026-06-24 /backend SLC-172 MT-2, RPT-533, DEC-249/250; NOCH NICHT LIVE-applied — Founder/Coolify-Hold, Apply im /deploy)
- Date: 2026-06-24
- Scope: Neue PL/pgSQL-Function `rpc_seed_blueprint_diagnosis_input(p_session_id uuid) → jsonb` (SECURITY DEFINER, GRANT service_role + ggf. authenticated/Owner). Liest `template.diagnosis_schema` + `capture_session.answers` der Blueprint-Session und seedet pro Diagnose-Block A–G in EINER Transaktion: je Frage in `diagnosis_schema.blocks[X].subtopics[].question_keys` eine `knowledge_unit` (`block_key=X`, `unit_type='observation'`, `source='questionnaire'`, `status='accepted'`, `confidence='medium'`, `title`=Fragelabel, `body`="Frage: …/Antwort: …") + **pro A–G einen Pseudo-`block_checkpoint`** (`checkpoint_type='blueprint_diagnosis_seed'`, DEC-250) als FK-Anker fuer KUs + spaetere `block_diagnosis` (Invariante `checkpoint.block_key==KU.block_key==diagnosis.block_key`). Return: `{ session_id, block_count, ku_count, blocks: [{block_key, checkpoint_id}] }`. Idempotent (DELETE der bestehenden `blueprint_diagnosis_seed`-Checkpoints der Session → FK-CASCADE raeumt geseedete KUs + block_diagnosis ab → sauberer Re-Seed). Zusaetzlich **eine Constraint-Aenderung**: `block_checkpoint.checkpoint_type` CHECK via DROP+ADD um `blueprint_diagnosis_seed` erweitert (6 Werte; Pattern MIG-091/110). Sonst kein Schema-DDL (kein neues Table/Column).
- Affected Areas: `public.knowledge_unit` (INSERT, A–G), `public.block_checkpoint` (INSERT Pseudo-Checkpoints + `checkpoint_type` CHECK-Erweiterung), neue Function `rpc_seed_blueprint_diagnosis_input`. Voraussetzungen live: KU/Checkpoint-Schema (MIG-021), `template.diagnosis_schema` (MIG-051), `stb_blueprint_kanzlei`-Seed (MIG-126).
- Reason: backend.md Atomare-Multi-Entity-Decision-Tree (supabase-js Admin-Persistence → Postgres-Function via `supabase.rpc`; „Sequential admin INSERTs + manual compensation" verboten). Der Blueprint braucht KUs als Input fuer `diagnosis_generation`, bevor die 7 A–G-Jobs laufen (DEC-249 (1)+(3)). Reuse des KU-Write-Musters aus `rpc_finalize_partner_diagnostic` (MIG-094), aber OHNE Session-Finalize (KUs sind Input, nicht Deliverable).
- Risk: Niedrig. Function additiv + idempotent; einziger Constraint-Touch = `checkpoint_type` CHECK-Erweiterung (additiv, bricht keine bestehenden Rows). **DB-Sidecar bereits PASS** (2026-06-24, transaktional gegen Live-Coolify-DB `supabase-db-bwkg80w04...160450719820`, BEGIN…ROLLBACK, 0 Persistenz): reale MIG-127 geladen → Blueprint-Test-Session geseedet → 7 Checkpoints / 13 KUs / A–G-aligned / Antwort-Reconciliation / Idempotenz-Re-Run 7/13 / Tenant-Scope alle GREEN; Post-Check Function NICHT persistiert. Live-Apply (permanent) via `sql-migration-hetzner.md` (base64+ssh+psql-postgres) erst im /deploy.
- Rollback Notes: `DROP FUNCTION IF EXISTS rpc_seed_blueprint_diagnosis_input(uuid);` + ggf. `DELETE FROM knowledge_unit WHERE capture_session_id = <test_session> AND block_key IN ('A'..'G');` (nur Test-Sessions; in Produktion keine, solange Feature-Flag OFF).

### MIG-126 — V10 StB-Vertikale Kanzlei-Blueprint-Seed (`stb_blueprint_kanzlei` v1.0) (LIVE-applied 2026-06-23 /backend SLC-170b, RPT-527)
- Date: 2026-06-23
- Scope: Idempotenter Seed EINER `template`-Row `stb_blueprint_kanzlei` v1.0 (Kanzlei-Blueprint = Gratis-Test-Einstieg: Standortbestimmung + Modul-Routing). 2 Capture-Blocks (`stufe1_kern` required=true 15 Fragen / `stufe2_vertiefung` required=false 5 Fragen) = 20 offene Fragen. `diagnosis_schema` (7 Diagnose-Blöcke A–G / 13 Unterthemen mit `question_keys` + 13 Bewertungsfelder, 1:1 Feld-Reuse exit_readiness MIG-051) + `diagnosis_prompt` (StB-spezifischer system_prompt + 13 field_instructions, Reifegrad 1–4 auf Engine-Skala 0–10 gemappt) + `metadata.routing[]` (13 Unterthema→primär/sekundär `modul_key`, Bedingung Ampel gelb/rot, erreicht alle 17 Kern-Module). KEIN `ki_hebel`/`output_contract` (Triple liefern die Fachmodule). KEIN Schema-DDL — Reuse `template` + diagnosis_schema/diagnosis_prompt (MIG-051). `INSERT ... ON CONFLICT (slug, version) DO UPDATE` (idempotent, 2× live-applied → 1 Row).
- Affected Areas: `public.template` (1 neue Row, slug `stb_blueprint_kanzlei`). Keine Schema-/Constraint-/Policy-Aenderung. Voraussetzungen bereits live: `template.metadata` (MIG-093), `template.diagnosis_schema`/`diagnosis_prompt` (MIG-051), UNIQUE(slug, version) (MIG-096), template-RLS/GRANTs (MIG-021/022). Entsperrt SLC-172 (Blueprint-Capture+Diagnose+Routing-Display).
- Reason: Founder-IP-Blueprint (abgenommene Quelle `docs/stb-vertikale/M-BP-seed-source.md`, DEC-234 neuer StB-Inhalt) seeden, damit der Gratis-Test (Capture → Diagnose Ampel/Reifegrad/Empfehlung → Modul-Vorschau) lauffaehig wird, sobald SLC-172/173 deployen.
- Risk: Niedrig (Daten-Seed, kein DDL, idempotent, kein Live-App-Code liest den neuen Slug bis SLC-172/173 deployen). Block-/Question-UUIDs deterministisch (uuid5 NAMESPACE_URL, NS enthält Slug → F-BP-IDs distinkt von exit_readiness). Deterministisch erzeugt: `docs/stb-vertikale/gen-mig126-blueprint-seed.py` (committet, reproduzierbar). Verifikation via DB-Sidecar `src/lib/db/__tests__/migration-126-blueprint-seed.test.ts` (AC-170b-1/2/4) im /qa + Live-SQL-Verify (block_count=2, question_count=20, diag_blocks=7, modul_key=bp, routing=13, has_ki_hebel=false, RLS-Read authenticated PASS).
- Build-Flags für SLC-172 (kein Seed-Thema): (1) Capture-Blöcke (2: stufe1/stufe2) ≠ Diagnose-Blöcke (7: A–G); die Engine iteriert heute pro Capture-block_key → `diagnosis_schema.blocks[key]` — die A–G-Reconciliation ist SLC-172-Wiring. (2) `metadata.routing[]`-Format wird in SLC-172 MT-2 gelesen. (3) Live-Rückfrage/adaptive Nachfrage-Schicht (Founder „überarbeiten") triggert Vertiefung adaptiv (§7.3/§7.7).
- Rollback Notes: `DELETE FROM public.template WHERE slug='stb_blueprint_kanzlei' AND version='1.0';` (keine FK-Abhaengigen solange keine capture_session daran gebunden). Pre-Apply-Backup: `/opt/onboarding-plattform-backups/pre-mig-126_*.sql` (pg_dump --table=public.template).

### MIG-125 — V10 StB-Vertikale Template-Content-Seed M-04 (`stb_modul_m04` v1.0) (applied 2026-06-22 /deploy SLC-170, RPT-514)
- Date: 2026-06-22
- Scope: Idempotenter Seed EINER `template`-Row `stb_modul_m04` v1.0 (M-04 Grundlegende Finanzsteuerung GuV/Bilanz/Cash). 2 Blocks (`stufe1_kern` required=true / `stufe2_vertiefung` required=false), 26 Fragen (10 Kern / 16 Workspace), 13 KI-Hebel (Reifegrad 1-4) in `metadata.ki_hebel[]`. KEIN Schema-DDL — Reuse bestehende `template`-Tabelle + Block/Question-Shape (`src/lib/db/template-queries.ts`). `INSERT ... ON CONFLICT (slug, version) DO UPDATE` (idempotent). M-04-only per DEC-242 (Blueprint/M-06/Rest -> SLC-170b; M-05 gestrichen).
- Affected Areas: `public.template` (1 neue Row). Keine Schema-/Constraint-/Policy-Aenderung. Voraussetzungen bereits live: `template.metadata` (MIG-093), UNIQUE(slug, version) (MIG-096), template-RLS/GRANTs (MIG-021/022). Bruecke `metadata.modul_key='m04'` -> `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124). Blockt SLC-173 (Modul-Capture M-04).
- Reason: Prio-A-1-Modul (M-04, voll ausgearbeitete IP) seeden, damit der V10-E2E-Flow (Capture SLC-173 -> Worker SLC-174 -> Reader SLC-175) lauffaehig/testbar ist. Content-Quelle: M-04-Modul-Spec (26 Fragen / 13 KI-Hebel). Quell-Mapping: `docs/stb-vertikale/M-04-seed-source.md`.
- Risk: Niedrig (Daten-Seed, kein DDL, idempotent). Block-/Question-UUIDs deterministisch (uuid5) -> stabil ueber Re-Applies. Verifikation via DB-Sidecar-Test `src/lib/db/__tests__/migration-125-template-seed.test.ts` (AC-170-1..5) im /qa.
- Rollback Notes: `DELETE FROM public.template WHERE slug='stb_modul_m04' AND version='1.0';` (keine FK-Abhaengigen solange keine capture_session daran gebunden). Pre-Apply-Backup: pg_dump --table=public.template (siehe Migration-Header).

### MIG-124 — V10 StB-Vertikale Modul-Liefer-Domaene (`modul_output` + module_output_synthesis-Job + RPC) (applied 2026-06-22 /deploy SLC-170, RPT-514; geschrieben /backend SLC-169 2026-06-21)
- Date: 2026-06-21
- Scope: SQL-Datei `124_v10_stb_modul_domain.sql` (geplant, /architecture V10 DEC-233/234/235). Additiv: (1) `CREATE TABLE modul_output (id, tenant_id FK tenants, capture_session_id FK capture_session, block_checkpoint_id FK block_checkpoint NULL, modul_key text, output_kind CHECK(entscheidung|standard|implementierungsschritt|ki_hebel), title, body NOT NULL, reifegrad smallint CHECK(1-4) NULL, evidence_refs jsonb DEFAULT '[]', source DEFAULT 'ai_draft', status CHECK(proposed|accepted|edited|rejected) DEFAULT 'proposed', ai_job_id NULL, created_at/updated_at/updated_by)` + Indizes (tenant_id),(capture_session_id),(modul_key) + RLS-Matrix (Zwei-Teil-USING `tenant_id = auth.user_tenant_id()` + Rolle; ai_draft-Writes service_role, Edit/Status tenant_admin) + GRANTs authenticated/service_role. (2) `module_output_synthesis` in `fn_min_tier_for_job` → `blueprint`-Tier; `ai_jobs.job_type`-CHECK + `ai_cost_ledger.role`-CHECK je um die neuen Werte (`module_output_synthesis`, `module_output_critic`) erweitern — **Live-Stand vorab via `pg_get_constraintdef` gegen Coolify-DB verifizieren** (IMP-1228/MIG-111-Disziplin: CHECK ist Superset der Live-Werte). (3) `rpc_enqueue_module_output(p_capture_session_id, p_modul_key)` (SECURITY DEFINER, tier-gated via `fn_tier_allows`, INSERT `ai_jobs(job_type='module_output_synthesis', session_tier=…)`; Pattern aus `rpc_create_block_checkpoint`). (4) `NOTIFY pgrst, 'reload schema'`.
- Reason: V10 FEAT-091/094/095 — das strukturierte Modul-Deliverable (Triple Entscheidung/Standard/Implementierungsschritt + KI-Hebel-Liste mit Reifegrad 1-4) braucht eine queryable eigene Tabelle (DEC-233); das flache `knowledge_unit` bleibt fuer Blueprint-Findings (DEC-234). Neuer Synthese-Job tier-gated + cost-capped (DEC-235).
- Affected Areas: NEU `modul_output` (+ RLS/Indizes/GRANTs). Erweitert (additiv, je 1-2 CHECK-Werte): `ai_jobs.job_type`, `ai_cost_ledger.role`, `fn_min_tier_for_job`. NEU `rpc_enqueue_module_output`. Bestehende Tabellen `template`/`capture_session`/`block_checkpoint`/`knowledge_unit` strukturell UNVERAENDERT (Reuse). `capture_session.metadata.imported_dataset_ref` = jsonb-Slot, kein DDL (DEC-237). **Template-Seeds (Blueprint + M-04/05/06) = separate Seed-Migration**, Schnitt in /slice-planning.
- Risk: CHECK-Erweiterungen muessen Live-Werte spiegeln (sonst INSERT-CHECK-Violation beim Enqueue/Cost-Ledger — MIG-111/112-Praezedenz). RLS-Pen-Test (Tenant-Isolation `modul_output`) im /qa via node-Sidecar (SAVEPOINT, `coolify-test-setup.md`). Naechste freie SQL-Datei = 124.
- R-169-1 (Live-Stand 2026-06-21, pg_get_constraintdef gegen Coolify-DB, IMP-1228): `ai_jobs_job_type_check` LIVE 22 Werte (live 3 mehr als MIG-111: `email_bulk_pipeline_trigger`/`email_bulk_retention_sweep`/`email_bulk_synthesis`) → +`module_output_synthesis` = 23. `ai_cost_ledger_role_check` LIVE 21 Werte → +`module_output_synthesis`+`module_output_critic` = 23. CHECK = Superset der Live-Werte. **DEVIATION (Rule 1/3, DEC-241):** Slice-AC-169-3 schrieb literal `status='queued'`; LIVE `ai_jobs_status_check` kennt 'queued' NICHT + claim-Loop claimt `'pending'` → daher `status='pending'` (konsistent mit Dispatch-RPCs 032/047/074).
- Status: /backend SLC-169 2026-06-21 geschrieben + tsc 0 / eslint 0 / next build PASS. DB-Sidecar-Tests (`migration-124-modul-output.test.ts` + `migration-124-enqueue-rpc.test.ts`) im /qa gegen Coolify-DB. LIVE-Apply im /deploy VOR Worker-Code-Redeploy (R-169-2).
- Rollback Notes: `DROP FUNCTION rpc_enqueue_module_output; DROP TABLE modul_output;` + CHECK-Constraints (`ai_jobs.job_type`, `ai_cost_ledger.role`) auf Pre-V10-Stand zuruecksetzen + `fn_min_tier_for_job` ohne `module_output_synthesis` neu. Reversibel solange keine `modul_output`-Rows / `module_output_synthesis`-Jobs existieren.
