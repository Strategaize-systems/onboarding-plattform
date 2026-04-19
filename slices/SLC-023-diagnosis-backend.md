# SLC-023 — Diagnose-Backend (block_diagnosis + Worker + RPCs + Template-Seed)

## Feature
FEAT-016 — Template-driven Diagnosis Layer

## Goal
Backend-Infrastruktur fuer den Diagnose-Layer: Tabelle, RPCs, Worker-Handler, Template-Seed. Nach diesem Slice kann die Diagnose per Server Action getriggert und vom Worker generiert werden.

## Scope

### In Scope
- block_diagnosis-Tabelle (Migration 050)
- Template-Erweiterung diagnosis_schema + diagnosis_prompt (Migration 051)
- Exit-Readiness diagnosis_schema Seed (13 Felder, ~30 Subtopics ueber 9 Bloecke)
- Exit-Readiness diagnosis_prompt Seed (System-Prompt + Feld-Instruktionen)
- RPCs: rpc_create_diagnosis, rpc_update_diagnosis, rpc_confirm_diagnosis (Migration 052)
- Worker-Handler handle-diagnosis-job.ts
- Prompt-Builder diagnosis-prompt.ts
- Types diagnosis/types.ts
- Claim-Loop-Integration (neuer Job-Type diagnosis_generation)
- Server Actions: triggerDiagnosisGeneration, fetchDiagnosis

### Out of Scope
- UI-Komponenten (SLC-024)
- SOP-Gate (SLC-024)
- i18n (SLC-024)

## Acceptance Criteria
- AC-1: block_diagnosis-Tabelle existiert mit RLS (admin full, tenant read)
- AC-2: template.diagnosis_schema + template.diagnosis_prompt Spalten existieren
- AC-3: Exit-Readiness hat befuelltes diagnosis_schema (alle 9 Bloecke, Subtopics, 13 Felder)
- AC-4: 3 RPCs funktionieren (create, update, confirm)
- AC-5: Worker claimed und verarbeitet diagnosis_generation Jobs
- AC-6: triggerDiagnosisGeneration enqueued Job, fetchDiagnosis liefert Ergebnis
- AC-7: Kosten werden in ai_cost_ledger mit feature='diagnosis' geloggt

## Micro-Tasks

### MT-1: block_diagnosis-Tabelle (Migration 050)
- Goal: Neue Tabelle block_diagnosis mit allen Spalten, RLS, Indexes, GRANTs, updated_at-Trigger
- Files: `sql/migrations/050_block_diagnosis.sql`
- Expected behavior: Tabelle mit tenant-isolierter RLS (strategaize_admin Full, tenant_admin Read), Indexes auf (session_id, block_key) und (checkpoint_id), GRANTs fuer authenticated + service_role, _set_updated_at Trigger
- Verification: Migration auf Hetzner ausfuehren, `\d block_diagnosis` zeigt alle Spalten + Constraints
- Dependencies: none

### MT-2: Template diagnosis_schema + diagnosis_prompt (Migration 051)
- Goal: Zwei neue JSONB-Spalten auf template + Exit-Readiness Seed mit vollstaendigem diagnosis_schema und diagnosis_prompt
- Files: `sql/migrations/051_template_diagnosis_fields.sql`
- Expected behavior: ALTER TABLE template ADD COLUMN diagnosis_schema JSONB, ADD COLUMN diagnosis_prompt JSONB. UPDATE exit_readiness mit: (a) diagnosis_schema mit Subtopics pro Block A-I + 13 Bewertungsfeldern, (b) diagnosis_prompt mit System-Prompt und Feld-Instruktionen fuer M&A-Diagnose
- Verification: `SELECT slug, diagnosis_schema->'fields' FROM template WHERE slug='exit_readiness'` zeigt 13 Felder. `SELECT jsonb_object_keys(diagnosis_schema->'blocks') FROM template WHERE slug='exit_readiness'` zeigt A-I.
- Dependencies: none

### MT-3: Diagnosis RPCs (Migration 052)
- Goal: 3 RPCs fuer Diagnose-Lifecycle (create, update, confirm)
- Files: `sql/migrations/052_rpc_diagnosis.sql`
- Expected behavior:
  - `rpc_create_diagnosis(session_id, block_key, checkpoint_id, content, model, cost, created_by)` — ermittelt tenant_id, INSERT, RETURN {diagnosis_id}
  - `rpc_update_diagnosis(diagnosis_id, content)` — prueft strategaize_admin, UPDATE content + updated_at
  - `rpc_confirm_diagnosis(diagnosis_id)` — prueft strategaize_admin, UPDATE status='confirmed' + updated_at
  - Alle SECURITY DEFINER, GRANT TO authenticated
- Verification: `\df rpc_*diagnosis*` zeigt 3 Funktionen
- Dependencies: MT-1

### MT-4: Diagnosis TypeScript Types
- Goal: TypeScript-Interfaces fuer Diagnose-Datenstrukturen
- Files: `src/workers/diagnosis/types.ts`
- Expected behavior: Interfaces: DiagnosisSubtopic (key, name, fields), DiagnosisContent (block_key, block_title, subtopics[]), DiagnosisField (key, label, type, options?, min?, max?), DiagnosisSchema (blocks, fields), DiagnosisPromptConfig (system_prompt, output_instructions, field_instructions)
- Verification: `tsc --noEmit`
- Dependencies: none

### MT-5: Diagnosis Prompt Builder
- Goal: System- und User-Prompt-Builder fuer Diagnose-Generierung
- Files: `src/workers/diagnosis/diagnosis-prompt.ts`
- Expected behavior:
  - `buildDiagnosisSystemPrompt(config: DiagnosisPromptConfig)` — baut System-Prompt aus Template-Config, inkl. JSON-Output-Format und Feld-Instruktionen
  - `buildDiagnosisUserPrompt(params: { blockKey, blockTitle, subtopics, knowledgeUnits, qualityReport? })` — baut User-Prompt mit KU-Kontext, Subtopic-Definitionen und Analyse-Auftrag
- Verification: `tsc --noEmit`
- Dependencies: MT-4

### MT-6: Diagnosis Job Handler
- Goal: Vollstaendiger Job-Handler analog handle-sop-job.ts
- Files: `src/workers/diagnosis/handle-diagnosis-job.ts`
- Expected behavior:
  1. Load block_checkpoint by payload.block_checkpoint_id
  2. Load KUs (status IN proposed/accepted/edited)
  3. Load template (diagnosis_schema + diagnosis_prompt)
  4. Build system + user prompts
  5. chatWithLLM() — temperature 0.3, maxTokens 8192
  6. Parse JSON, validate against schema fields
  7. rpc_create_diagnosis() persist
  8. Log costs to ai_cost_ledger (feature='diagnosis')
  9. rpc_complete_ai_job()
- Verification: `tsc --noEmit`, manueller Test auf Hetzner (Job enqueue → Worker picks up → block_diagnosis Row erscheint)
- Dependencies: MT-3, MT-4, MT-5

### MT-7: Claim-Loop + run.ts Integration
- Goal: diagnosis_generation als neuen Job-Type registrieren
- Files: `src/workers/condensation/claim-loop.ts`, `src/workers/condensation/run.ts`
- Expected behavior:
  - claim-loop.ts: JOB_TYPES Array um 'diagnosis_generation' erweitern, Dispatcher um diagnosisHandler erweitern
  - run.ts: import handleDiagnosisJob, als 4. Handler an startClaimLoop uebergeben
- Verification: Worker startet ohne Fehler, loggt 4 Job-Types bei Startup
- Dependencies: MT-6

### MT-8: Server Actions (trigger + fetch)
- Goal: Server Actions fuer Diagnose-Trigger und -Abfrage
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/diagnosis-actions.ts`
- Expected behavior:
  - `triggerDiagnosisGeneration(sessionId, blockKey, checkpointId)` — Auth-Check (strategaize_admin), Checkpoint validieren, INSERT ai_jobs type='diagnosis_generation'
  - `fetchDiagnosis(sessionId, blockKey)` — SELECT block_diagnosis WHERE session+block, return oder null
- Verification: `tsc --noEmit`, `npm run build`
- Dependencies: MT-1, MT-3

## Execution Order
MT-1 + MT-2 + MT-4 (parallel, keine Abhaengigkeiten) → MT-3 (braucht MT-1) + MT-5 (braucht MT-4) → MT-6 (braucht MT-3, MT-5) → MT-7 (braucht MT-6) → MT-8 (braucht MT-1, MT-3)

## Risks
- R10: Subtopic-Zuordnung — Qualitaet haengt vom diagnosis_schema-Seed ab. Mitigation: Sorgfaeltiger Seed basierend auf bestehendem Template-Content.
- R11: Prompt-Komplexitaet — 13 Felder pro Subtopic ist anspruchsvoll. Mitigation: Klare Feld-Instruktionen im diagnosis_prompt.
