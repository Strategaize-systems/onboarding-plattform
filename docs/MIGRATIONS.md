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


### MIG-040 — V6.4 SLC-130 Template-Versionierung UNIQUE(slug, version) (Migration 096, live)
- Date: 2026-05-17
- Scope:
  - `sql/migrations/096_v64_template_slug_version_unique.sql` — `ALTER TABLE public.template DROP CONSTRAINT IF EXISTS template_slug_key;` + `CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version);`. Idempotent ueber DROP IF EXISTS + CREATE IF NOT EXISTS — zweiter Apply ist No-Op.
- Reason: BL-105 / SLC-130 — echte Template-Versionierung als Architektur-Polish-Investition. Vor MIG-040 ueberschrieb ein `INSERT ... ON CONFLICT (slug) DO UPDATE` die existierende Template-Row und damit auch die umrahmenden Block-Titel/Intros in bereits abgeschlossenen Mandanten-Berichten (bericht/page.tsx rendert per `session.template_id`-Lookup, der jetzt aber dieselbe Row zeigt). Mit V6.4 koexistieren mehrere Versions, neue Sessions referenzieren die juengste per `ORDER BY created_at DESC LIMIT 1` in `actions.ts:117-130` + `start/page.tsx:79-86`, alte Sessions bleiben an ihrer originalen `template_id`-FK. Spaetestens vor V7 Self-Signup-Funnel (BL-098) muss diese Saubere Versionierung stehen — Vertrauens-Asset fuer Steuerberater, die alte Mandanten-Berichte 6 Monate spaeter mit originalen Texten oeffnen wollen.
- Affected Areas: 1 UNIQUE-Constraint auf `public.template` (DROP `template_slug_key`) + 1 neuer UNIQUE-Index (`template_slug_version_unique`). Keine Schema-DDL ausser Constraint-Wechsel, keine Daten-Migration noetig (bestehende 3 Template-Rows haben heute eindeutige `(slug, version)`-Kombinationen — verifiziert vor Apply via `SELECT slug, version, COUNT(*) FROM template GROUP BY slug, version HAVING COUNT(*) > 1` → 0 Rows). Keine RLS-Aenderungen, keine RPCs, kein neuer Spalten. Bestehende capture_session.template_id-FKs bleiben funktional — referenzieren weiter Template-Rows per UUID. Migration 094 (`rpc_finalize_partner_diagnostic`) bleibt funktional, nutzt session.template_id direkt.
- Risk: Sehr gering. Constraint-Wechsel ist atomar im selben Transaction-Block. Idempotenz garantiert. Funktional-Smoke nach Apply verifiziert: 2 Versions desselben Slugs koennen koexistieren (`INSERT (smoke_mig096, v1)` + `INSERT (smoke_mig096, v2)` → beide INSERT 0 1, ROLLBACK clean).
- Rollback Notes: Manuell: `DROP INDEX IF EXISTS public.template_slug_version_unique; ALTER TABLE public.template ADD CONSTRAINT template_slug_key UNIQUE (slug);`. Vorausgesetzt zu diesem Zeitpunkt existiert keine V2-Row fuer einen bestehenden Slug — sonst muesste die V2-Row erst gedroppt werden (FK-CASCADE auf capture_session.template_id ist RESTRICT, daher manueller Cleanup noetig). Pre-Apply-Backup unter `/opt/onboarding-plattform-backups/pre-mig-040-096_20260517_095124.sql` (Schema-only template-Tabelle).
- Live-Deploy: **LIVE auf Hetzner 2026-05-17 ~09:51 UTC** im Coolify-Postgres-Container `supabase-db-bwkg80w04wgccos48gcws8cs-080508729886` per sql-migration-hetzner.md Pattern (base64 + psql -U postgres). Apply-Result: `NOTICE: template_slug_key constraint dropped` + `NOTICE: template_slug_version_unique index ensured` + `DO`. Post-Apply-Verifikation: `pg_constraint` zeigt 0 UNIQUE-Constraints mehr auf template, `pg_indexes` zeigt neuen Index. Funktional-Smoke 2x INSERT (slug='smoke_mig096', v1 + v2) PASS + ROLLBACK clean. Vitest 3/3 PASS gegen Coolify-DB (Cross-Version-Read + UNIQUE-Enforced + alter-Constraint-weg). SLC-105 Baseline-Tests 55/55 regression-frei. RPT-289 (kommt in /backend-Completion) dokumentiert Apply.
