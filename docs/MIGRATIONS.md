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
