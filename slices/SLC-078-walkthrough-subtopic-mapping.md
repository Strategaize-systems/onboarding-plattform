# SLC-078 — Walkthrough Stufe 3 Auto-Mapping (Bridge-Engine Reverse-Direction)

## Goal

Dritte Stufe der V5 Option 2 Methodik-Pipeline. Migration 086 deployen (`walkthrough_review_mapping` Tabelle mit GENERATED `confidence_band`-Column nach DEC-087 + Partial-Indizes mapped/unmapped + RLS-Policies). Neuer Worker-Job-Handler `walkthrough_map_subtopics` ordnet jeden walkthrough_step (aus SLC-077) einem Subtopic im Template-Tree zu (oder NULL = Unmapped-Bucket nach DEC-085). Schwelle `WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD` (Default 0.7, ENV-Override per DEC-084) entscheidet zugeordnet vs. unmapped. Pattern-Reuse aus FEAT-023 Bridge-Engine in **Reverse-Direction**: Bridge-Engine spawnt Subtopic → capture_session, V5 Option 2 mapped walkthrough_step → Subtopic. **Pflicht: derselbe `bedrock-client.ts`-Aufruf, dieselben Audit-Felder, derselbe Cost-Logging-Pfad** wie Bridge-Engine — kein Code-Drift erlaubt. Pipeline-Trigger advanced status `mapping → pending_review`.

## Feature

FEAT-037 (Walkthrough AI-Pipeline) — Stufe 3. Sequentiell nach SLC-077 Schritt-Extraktion. Pattern-Reuse: FEAT-023 Bridge-Engine (V4 SLC-035 + SLC-036).

## In Scope

### A — Migration 086 (`walkthrough_review_mapping` Tabelle)

Pfad: `sql/migrations/086_v5opt2_walkthrough_review_mapping.sql` (neu), per `sql-migration-hetzner.md`-Pattern auf Hetzner appliziert.

DDL gemaess MIG-032 (siehe `docs/MIGRATIONS.md` MIG-032 Format-Skizze):
- 14 Columns (id, tenant_id, walkthrough_step_id, template_id, template_version, subtopic_id, confidence_score, confidence_band GENERATED, mapping_model, mapping_reasoning, reviewer_corrected, reviewer_user_id, reviewed_at, created_at, updated_at).
- **GENERATED `confidence_band` Column** mit CASE-Logik (red wenn subtopic_id NULL, green ≥0.85, yellow ≥0.70, sonst red — DEC-087).
- 2 Partial Indizes: `idx_wkrm_session_subtopic` (alle Mappings) + `idx_wkrm_unmapped` (WHERE subtopic_id IS NULL).
- ENABLE ROW LEVEL SECURITY.
- 3 Policies (gleiche 4-Rollen-Matrix wie walkthrough_step):
  - `walkthrough_review_mapping_select` (SELECT 4-Rollen).
  - `walkthrough_review_mapping_update` (UPDATE strategaize_admin + tenant_admin eigener Tenant).
  - **Kein INSERT-Policy** — Worker schreibt via service_role.
- `_set_updated_at`-Trigger.
- CHECK `confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)`.
- UNIQUE-Constraint via `walkthrough_step_id UNIQUE` (1:1 Mapping pro Schritt).
- Idempotent. Pre-Apply-Backup.

### B — Bedrock-Prompt `subtopic_map.ts`

Pfad: `src/lib/ai/prompts/walkthrough/subtopic_map.ts` (neu).

- System-Prompt: "Du ordnest SOP-Schritte den passenden Subtopics im Onboarding-Template-Tree zu."
- Input: walkthrough_step-Liste (action, responsible, timeframe) + Subtopic-Tree als JSON (alle blocks[].subtopics[] mit id, title, description).
- Output-Schema: pro Schritt `{ step_id, subtopic_id | null, confidence_score: 0..1, reasoning: string }`.
- Few-shot-Beispiele: korrekte Zuordnung, Mapping mit niedriger Confidence (gelb), Unmapped-Fall.
- Konservative Guidance: "Bei unklarer Zuordnung lieber niedrige Confidence + Berater korrigiert als forciertes Mapping."

### C — Worker `walkthrough-map-subtopics-worker.ts`

Pfad: `src/workers/ai/walkthrough-map-subtopics-worker.ts` (neu).

**Pflicht-Constraint Bridge-Engine-Pattern-Konsistenz:**
- Gleicher `bedrockClient.complete()`-Aufruf wie `bridge-engine-worker.ts` (kein eigener HTTP-Stack).
- Gleiche Audit-Felder (`mapping_model`, `mapping_reasoning`, ai_cost_ledger).
- Gleicher Cost-Logging-Pfad (`logAiCost(...)` aus existing helper).

Logik:
- Polling-Loop: claim AI-Job mit `job_type='walkthrough_map_subtopics'`.
- Lade walkthrough_session + alle walkthrough_step-Rows fuer diese Session (WHERE deleted_at IS NULL).
- Lade Template + template_version aus capture_session.template_id.
- Bedrock-Call mit Prompt + step-Liste + subtopic-Tree.
- Parse JSON-Output, Zod-Schema-Validation.
- Pro Step ein Mapping-Eintrag:
  - confidence_score < THRESHOLD (default 0.7, ENV `WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD`) → subtopic_id=NULL, sonst gesetzt.
  - mapping_model = bedrockClient.modelId.
  - mapping_reasoning aus LLM-Output.
  - reviewer_corrected=false (Auto-Output, nicht Berater-Korrektur).
- Bulk-INSERT walkthrough_review_mapping.
- ai_cost_ledger-Eintrag.
- Status `mapping → pending_review` via pipeline-trigger.
- Failure-Handling: try/catch + JSON-Parse-Fail → status='failed' + error_log category='walkthrough_pipeline_failure', stage='map_subtopics'.

### D — Coverage-Test (SC-V5-7 Pflicht)

Pfad: `src/workers/ai/__tests__/walkthrough-map-subtopics.test.ts` (neu).

Auf 3 echten Walkthroughs (oder Bedrock-Mock auf 3 Fixture-Sets):
- ≥70% der Schritte mit Confidence ≥0.7 zugeordnet (= Subtopic gemappt).
- 0 Cross-Tenant-Mappings (ein Mapping referenziert nie ein Subtopic eines fremden Templates).
- mapping_reasoning nicht leer.

## Micro-Tasks

### MT-1: Migration 086 Apply
- Goal: `walkthrough_review_mapping` Tabelle + GENERATED-Column + RLS live.
- Files: `sql/migrations/086_v5opt2_walkthrough_review_mapping.sql` (neu).
- Expected behavior: Tabelle existiert, GENERATED confidence_band rechnet korrekt, 2 Partial-Indizes, 2 Policies (kein INSERT-Policy), Trigger.
- Verification: Hetzner-Apply via base64-Pattern. `\d walkthrough_review_mapping` zeigt confidence_band als GENERATED. `SELECT confidence_band FROM walkthrough_review_mapping WHERE confidence_score=0.85` liefert 'green' (Test-INSERT via service_role). Pre-Apply-Backup-CSV.
- Dependencies: SLC-077 MT-1 (Migration 085 zuerst, weil walkthrough_step_id FK)

### MT-2: Bedrock-Prompt `subtopic_map.ts` + Zod-Schema
- Goal: Prompt + Output-Schema definiert.
- Files: `src/lib/ai/prompts/walkthrough/subtopic_map.ts` (neu), `src/lib/ai/prompts/walkthrough/subtopic_map.schema.ts` (neu).
- Expected behavior: Prompt liefert konsistente JSON-Outputs.
- Verification: Zod-Schema-Test, Prompt-Snapshot-Test.
- Dependencies: none

### MT-3: Worker `walkthrough-map-subtopics-worker.ts` mit Bridge-Engine-Pattern-Konsistenz
- Goal: Worker laeuft, mapped Schritte, advanced Status.
- Files: `src/workers/ai/walkthrough-map-subtopics-worker.ts` (neu), `src/workers/index.ts` (modify — Job-Type-Registrierung).
- Expected behavior: Bulk-INSERT walkthrough_review_mapping mit korrektem confidence_band. status='pending_review' am Ende.
- Verification: Vitest-Mock + Live-Smoke. **Diff-Review** gegen `bridge-engine-worker.ts` zeigt identische Bedrock-Aufrufe + Cost-Logging-Pfad.
- Dependencies: MT-1, MT-2

### MT-4: Coverage-Test SC-V5-7 ≥70%
- Goal: 3 Test-Walkthroughs mit ≥70% Confidence ≥0.7.
- Files: `src/workers/ai/__tests__/walkthrough-map-subtopics.test.ts` (neu), `src/workers/ai/__tests__/fixtures/walkthrough-mappings/*.ts` (3 Fixtures).
- Expected behavior: Test verifiziert Coverage-Quote und Cross-Tenant-Isolation.
- Verification: `npm run test -- --run walkthrough-map` PASS.
- Dependencies: MT-3

## Out of Scope

- Methodik-Review-UI (Move-Action) → SLC-079.
- Re-Mapping nach Subtopic-Tree-Aenderung → V5.x.
- Per-Tenant-Confidence-Schwelle → V5.x (DEC-084 explizit deferred).
- Haiku-Optimization fuer Stufe 3 → V5.x (DEC-081 explizit deferred).

## Risks / Mitigations

- **R1 — Coverage-Quote <70% auf Test-Walkthroughs**: Prompt-Tuning (more few-shot examples), evtl. Threshold-Senkung im ENV (0.7 → 0.65) als Notnagel. Slice-Block falls auch nach Iteration <60%.
- **R2 — Subtopic-FK-Drift bei Template-Update**: template_version eingefroren beim Mapping (CHECK NOT NULL in Migration 086) — alte Mappings bleiben gueltig auch wenn neuere Template-Version Subtopics umstrukturiert. UI in SLC-079 muss Dangling-Subtopics tolerieren.
- **R3 — Bridge-Engine-Pattern-Drift**: Pflicht-Diff-Review in MT-3-Verification (gleicher Bedrock-Client + gleicher Cost-Pfad). /qa-Reviewer pflicht-checkt Pattern-Konsistenz.

## Verification

- Migration 086 live appliziert mit Pre-Apply-Backup.
- `npm run lint` 0/0.
- `npm run build` ohne Fehler.
- `npm run test -- --run walkthrough-map` PASS (Coverage ≥70%).
- Live-Smoke: 1 echter Walkthrough durchlaeuft extracting → mapping → pending_review (status-Verlauf + walkthrough_review_mapping-Rows in DB belegbar). confidence_band-Verteilung dokumentiert (z.B. "8 green, 3 yellow, 2 red").
- Bridge-Engine-Pattern-Konsistenz-Diff: Side-by-side `bridge-engine-worker.ts` vs. `walkthrough-map-subtopics-worker.ts` zeigt gleichen Bedrock-Aufruf, gleichen Cost-Logging-Pfad.

## Pflicht-Gates

- **SC-V5-7 Auto-Mapping Coverage ≥70%** auf 3 Test-Walkthroughs (MT-4).
- Migration 086 via `sql-migration-hetzner.md`-Pattern.
- Bedrock-Region `eu-central-1`.
- Bridge-Engine-Pattern-Konsistenz: gleicher bedrock-client, gleiche Cost-Felder, gleicher ai_cost_ledger-Pfad.
- ENV `WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD` in `coolify-env.ts` mit Default 0.7.

## Status

planned

## Created

2026-05-06
