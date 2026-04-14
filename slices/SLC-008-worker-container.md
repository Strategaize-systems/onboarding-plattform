# SLC-008 — Worker-Container + Verdichtung

- Feature: FEAT-005
- Status: planned
- Priority: Blocker (Herzstueck V1)
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Separater Docker-Service `worker` laeuft neben `app`, pollt `ai_jobs`-Queue (SKIP LOCKED), verarbeitet `knowledge_unit_condensation`-Jobs: laedt Checkpoint, ruft Bedrock (Claude Sonnet eu-central-1), parst JSON, schreibt `knowledge_unit` via RPC, loggt Kosten.

## In Scope
- `src/workers/condensation/knowledge-unit-condensation-worker.ts` (portiert aus OS `blueprint-block-draft-worker.ts`, **auf Bedrock**)
- `src/workers/condensation/prompt.ts` — Prompt-Template mit Exception-Support
- `src/workers/condensation/parse-output.ts` — JSON-Extraktion + Zod-Validation + `evidence_refs`-Check
- RPC `rpc_claim_next_ai_job_for_type(p_job_type)` (portiert aus OS Migration 033)
- RPC `rpc_complete_ai_job(p_job_id)` + `rpc_fail_ai_job(p_job_id, p_error)`
- RPC `rpc_bulk_import_knowledge_units(p_jsonb)`
- Tabelle `ai_cost_ledger` (falls nicht Blueprint-Bestand)
- Docker-Compose-Service `worker` in `docker-compose.yml`
- `Dockerfile.worker` (separate Image, node, starts `dist/workers/condensation/run.js`)
- ENV: `AI_WORKER_POLL_MS`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID`
- Tests: Prompt-Generation, Output-Parser, Worker-Claim-Flow (Integration mit echter DB)

## Out of Scope
- 3-Agenten-Loop (V2)
- Auto-Retry bei Transient Fails (V1 manueller Retry)
- Horizontale Skalierung mit mehreren Workers (trivial via compose-replicas, aber kein V1-Use-Case)
- Ollama-Client wird NICHT portiert (Rule: 0 Ollama-Code-Pfade am Ende dieses Slices)

## Acceptance
- Nach Block-Submit entsteht innerhalb von < 5 min mindestens 1 `knowledge_unit`-Row
- `ai_jobs.status = completed` nach Worker-Run
- `ai_cost_ledger`-Row mit tokens_in, tokens_out, usd_cost
- Worker-Crash (simuliert) → Job zurueck auf `pending` (via Claim-Timeout) oder `failed` (nach N Versuchen)
- grep `ollama` in `src/` leer

## Dependencies
- SLC-001..007 (alle Upstream-Slices)
- AWS-Credentials + Bedrock-Model-Access verifiziert (liegt ausserhalb Slice-Scope, User-Aufgabe)

## Risks
- Bedrock-Claude-Sonnet-Response-Format nicht deterministisch → Parser muss robust sein (Retry mit angepasstem Prompt? V1: 1 Shot, Fehler → fail-Job)
- `evidence_refs` muessen auf tatsaechliche Answer-Ids verweisen → Validierung im Parser
- Deployment: 2 Container = doppelter Rollout, Coolify-Config anpassen

## Micro-Tasks

### MT-1: Migration 031 — RPCs aus OS portieren
- Goal: `rpc_claim_next_ai_job_for_type`, `rpc_complete_ai_job`, `rpc_fail_ai_job`, `rpc_bulk_import_knowledge_units`, `ai_cost_ledger`.
- Files:
  - `sql/migrations/031_ai_queue_rpcs.sql`
  - `sql/migrations/032_ai_cost_ledger.sql`
- Expected behavior: SKIP LOCKED Claim-RPC mit Lease-Timeout. `rpc_bulk_import_knowledge_units` akzeptiert JSONB-Array und inserted batched. Alle RPCs `SECURITY DEFINER` und pruefen Service-Role-Context.
- Verification: `\df rpc_claim_next_ai_job_for_type` auf Prod; manueller Call mit Test-Job.
- Dependencies: SLC-001, SLC-006 MT-1

### MT-2: Worker-Core (Claim + Dispatch)
- Goal: Poll-Loop + Job-Dispatcher-Skelett.
- Files:
  - `src/workers/condensation/run.ts` — Entrypoint
  - `src/workers/condensation/claim-loop.ts`
  - `src/workers/condensation/claim-loop.test.ts`
- Expected behavior: Loop `rpc_claim_next_ai_job_for_type('knowledge_unit_condensation')` alle `AI_WORKER_POLL_MS` ms. Bei Job: Dispatch an Handler, dann complete/fail.
- Verification: Unit-Test mit Mock-DB; lokaler Run claimt Fake-Job.
- Dependencies: MT-1

### MT-3: Prompt + Bedrock-Client
- Goal: Prompt-Builder + Bedrock-Invoke.
- Files:
  - `src/workers/condensation/prompt.ts`
  - `src/workers/condensation/prompt.test.ts`
  - `src/lib/ai/bedrock-client.ts` (aus Blueprint pruefen, sonst neu)
- Expected behavior: Prompt enthaelt: Block-Titel, Fragen, Antworten, Exception, Chat-Kontext, Output-JSON-Schema. `bedrock-client.invokeClaude(prompt)` → raw string. Kosten-Info (token counts) aus Response.
- Verification: `npm run test -- prompt` gruen; manueller Bedrock-Call mit Test-Payload (separates Script, nicht CI).
- Dependencies: MT-2

### MT-4: Output-Parser + Evidence-Validation
- Goal: Bedrock-Output → validierte KU-Liste.
- Files:
  - `src/workers/condensation/parse-output.ts`
  - `src/workers/condensation/parse-output.test.ts`
- Expected behavior: JSON-Extract (tolerant gegen Markdown-Fences), Zod-Schema `KUArraySchema`, `evidence_refs` muessen gueltige `question_id`s referenzieren (sonst KU verwerfen oder warn-log). Confidence nur `low|medium|high`.
- Verification: Test-Fixtures (happy + malformed + wrong-evidence) alle gruen.
- Dependencies: MT-3

### MT-5: Handler + Persist + Cost-Log
- Goal: Kompletter Handler fuer einen Job.
- Files:
  - `src/workers/condensation/handle-job.ts`
  - `src/workers/condensation/handle-job.test.ts`
- Expected behavior: Laedt `block_checkpoint`, baut Prompt, ruft Bedrock, parst, ruft `rpc_bulk_import_knowledge_units`, schreibt `ai_cost_ledger`, ruft `rpc_complete_ai_job`. Bei Fehler: `rpc_fail_ai_job` mit Error-Text.
- Verification: Integrationstest gegen Test-DB + Bedrock-Mock.
- Dependencies: MT-1..MT-4

### MT-6: Dockerfile + compose-Service
- Goal: Separater `worker`-Container lebt parallel zu `app`.
- Files:
  - `Dockerfile.worker`
  - `docker-compose.yml` (erweitern)
  - `docs/MIGRATIONS.md` + `docs/RELEASES.md` Notiz
- Expected behavior: Build-Args `worker` baut nur Worker-Code (share node_modules). Compose definiert Service `worker` mit ENV aus `.env`, `depends_on: supabase-db`, `restart: unless-stopped`, `command: node dist/workers/condensation/run.js`.
- Verification: `docker compose up worker` lokal zeigt Poll-Loop-Log.
- Dependencies: MT-2..MT-5

### MT-7: Coolify-Deployment verifizieren
- Goal: Worker als eigener Service in Coolify registriert, laeuft auf Hetzner.
- Files: keine Code-Aenderung; Coolify-Config in `docs/KNOWN_ISSUES.md` oder `docs/RELEASES.md` dokumentieren.
- Expected behavior: Coolify-UI zeigt 2 Container (app + worker) healthy. Worker-Logs zeigen `polling...`.
- Verification: Manuell in Coolify-UI.
- Dependencies: MT-6

### MT-8: Acceptance-Test End-to-End
- Goal: 1 echter Block-Submit → KUs in DB < 5 min.
- Files: `src/workers/condensation/__tests__/e2e.manual.md` (Manual-Testscript)
- Expected behavior: Submit Block → nach < 5 min: `SELECT COUNT(*) FROM knowledge_unit WHERE block_checkpoint_id = ...` > 0. `ai_cost_ledger`-Row exists.
- Verification: Manuell auf Staging/Prod.
- Dependencies: MT-7

### MT-9: Ollama-Aufraeumen
- Goal: Alle Ollama-Spuren entfernen.
- Files: potenziell `src/lib/ai/ollama-*.ts`, `docker-compose.yml` (ollama-service), `.env.example`.
- Expected behavior: `grep -r "ollama" src/ docker-compose.yml .env.example` leer (ausser Blueprint-Legacy-Kommentare, wenn vorhanden).
- Verification: grep.
- Dependencies: MT-2..MT-5 (erst nach Bedrock-Pfad stabil)

## Verification Summary
- Unit + Integration-Tests gruen
- `npm run build` gruen
- Lokal: `docker compose up worker` zeigt Polling
- Prod: 2 Container healthy, E2E-Submit produziert KUs < 5 min
- Bedrock-Kosten in `ai_cost_ledger` sichtbar
- grep `ollama` leer
