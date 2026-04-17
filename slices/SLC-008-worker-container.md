# SLC-008 — Worker-Container + Multi-Agent Verdichtung (Analyst+Challenger Loop)

- Feature: FEAT-005
- Status: planned
- Priority: Blocker (Herzstueck V1)
- Created: 2026-04-14
- Updated: 2026-04-17 (DEC-014: Single-Pass → Multi-Agent-Loop)
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Separater Docker-Service `worker` laeuft neben `app`, pollt `ai_jobs`-Queue (SKIP LOCKED), verarbeitet `knowledge_unit_condensation`-Jobs mit iterativem Analyst+Challenger Loop: laedt Checkpoint, fuehrt 2-8 Iterationen Analyst→Challenger durch (Bedrock Claude Sonnet eu-central-1), schreibt finale `knowledge_unit` via RPC, loggt Kosten und Iterations-Verlauf.

## Loop-Architektur im Worker

```
Job claimed → Load block_checkpoint content
  → Iteration 1:
      Analyst-Prompt (Rohdaten) → Bedrock → Analysis JSON
      Challenger-Prompt (Analysis + Rohdaten) → Bedrock → Verdict
  → Iteration 2..N:
      Analyst-Prompt (Rohdaten + Challenger-Feedback) → Bedrock → Revised Analysis
      Challenger-Prompt (Revised Analysis + Rohdaten) → Bedrock → Verdict
  → Convergence (ACCEPTED / ACCEPTED_WITH_NOTES / max_iterations):
      → Parse final Analysis → Knowledge Units
      → rpc_bulk_import_knowledge_units
      → Log iterations + costs
      → rpc_complete_ai_job
```

Minimum 2 Iterationen. Maximum 8. Bei NEEDS_REVISION/REJECTED: naechste Iteration. Bei max_iterations: bestes Ergebnis + Warning.

## In Scope
- Analyst-Prompt portiert aus OS `blueprint-analyze` SKILL.md (301 Zeilen)
- Challenger-Prompt portiert aus OS `blueprint-challenge` SKILL.md (274 Zeilen)
- Convergence-Logik portiert aus OS `blueprint-loop` SKILL.md (455 Zeilen)
- Worker-Core: Claim-Loop, Job-Dispatcher, Iteration-Manager
- `src/workers/condensation/analyst-prompt.ts` — Analyst-Prompt-Builder
- `src/workers/condensation/challenger-prompt.ts` — Challenger-Prompt-Builder
- `src/workers/condensation/iteration-loop.ts` — Convergence-Logik (min/max Iterationen, Verdict-Check)
- `src/workers/condensation/parse-output.ts` — JSON-Extraktion + Zod-Validation + evidence_refs-Check
- RPCs: `rpc_claim_next_ai_job_for_type`, `rpc_complete_ai_job`, `rpc_fail_ai_job`, `rpc_bulk_import_knowledge_units`
- Tabelle `ai_cost_ledger` + `ai_iterations_log`
- Docker-Compose-Service `worker` + `Dockerfile.worker`
- ENV: `AI_WORKER_POLL_MS`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID`, `AI_MIN_ITERATIONS=2`, `AI_MAX_ITERATIONS=8`
- Tests: Prompt-Generation, Output-Parser, Iteration-Loop, Worker-Claim-Flow

## Out of Scope
- Iterative Luecken-Erkennung mit Rueckspielung ins Questionnaire (V2)
- Auto-Retry bei Transient-Fails (V1 manueller Retry)
- Horizontale Skalierung mit mehreren Workers (trivial via compose-replicas, kein V1-Use-Case)
- Ollama-Client wird NICHT portiert (Rule: 0 Ollama-Code-Pfade am Ende dieses Slices)
- Prompt-Admin-UI (V2+)

## Acceptance
- Nach Block-Submit entsteht innerhalb von < 5 min mindestens 1 `knowledge_unit`-Row
- Mindestens 2 Iterationen (Analyst→Challenger) pro Job nachweisbar im Iterations-Log
- Challenger-Verdict ACCEPTED oder ACCEPTED_WITH_NOTES im finalen Iterations-Eintrag
- `ai_jobs.status = completed` nach Worker-Run
- `ai_cost_ledger`-Row(s) mit tokens_in, tokens_out, usd_cost pro Bedrock-Call
- Worker-Crash (simuliert) → Job zurueck auf `pending` (via Claim-Timeout) oder `failed`
- grep `ollama` in `src/` leer

## Dependencies
- SLC-001..007 (alle Upstream-Slices)
- SLC-006 (ai_jobs-Tabelle + rpc_create_block_checkpoint bereits deployed)
- AWS-Credentials + Bedrock-Model-Access verifiziert (User-Aufgabe)
- OS-Skills als Prompt-Referenz: `strategaize-operating-system/.claude/skills/blueprint-{analyze,challenge,loop}/SKILL.md`

## Risks
- Bedrock-Response-Format nicht deterministisch → Parser muss robust sein
- `evidence_refs` muessen auf tatsaechliche Answer-IDs verweisen → Validierung im Parser
- Deployment: 2 Container = doppelter Rollout, Coolify-Config anpassen
- Kosten: 4-16 Bedrock-Calls pro Block statt 1 → $0.10-$0.40 pro Block (akzeptabel per DEC-014)
- Challenger kann in Endlos-NEEDS_REVISION-Loop geraten → max_iterations=8 als harte Grenze

## Micro-Tasks

### MT-1: Migration 033 — Queue-RPCs + Cost-Ledger + Iterations-Log
- Goal: RPCs aus OS portieren + neue Tabellen
- Files: `sql/migrations/033_ai_queue_rpcs_and_logging.sql`
- Inhalt: rpc_claim_next_ai_job_for_type (SKIP LOCKED), rpc_complete_ai_job, rpc_fail_ai_job, rpc_bulk_import_knowledge_units, ai_cost_ledger, ai_iterations_log
- Dependencies: SLC-006 (ai_jobs existiert)

### MT-2: Worker-Core (Claim + Dispatch)
- Goal: Poll-Loop + Job-Dispatcher-Skelett
- Files: `src/workers/condensation/run.ts`, `claim-loop.ts`, Tests
- Dependencies: MT-1

### MT-3: Analyst-Prompt + Bedrock-Client
- Goal: Analyst-Prompt-Builder (portiert aus OS blueprint-analyze) + Bedrock-Invoke
- Files: `src/workers/condensation/analyst-prompt.ts`, `src/lib/ai/bedrock-client.ts`, Tests
- Dependencies: MT-2

### MT-4: Challenger-Prompt
- Goal: Challenger-Prompt-Builder (portiert aus OS blueprint-challenge)
- Files: `src/workers/condensation/challenger-prompt.ts`, Tests
- Dependencies: MT-3

### MT-5: Iteration-Loop + Convergence
- Goal: Orchestrierung der Analyst→Challenger Iterationen
- Files: `src/workers/condensation/iteration-loop.ts`, Tests
- Dependencies: MT-3, MT-4

### MT-6: Output-Parser + Evidence-Validation
- Goal: Finales Analyst-Output → validierte KU-Liste
- Files: `src/workers/condensation/parse-output.ts`, Tests
- Dependencies: MT-5

### MT-7: Handler + Persist + Cost-Log
- Goal: Kompletter Job-Handler (Loop + Persist + Log)
- Files: `src/workers/condensation/handle-job.ts`, Tests
- Dependencies: MT-1..MT-6

### MT-8: Dockerfile + compose-Service
- Goal: Separater `worker`-Container
- Files: `Dockerfile.worker`, `docker-compose.yml`
- Dependencies: MT-7

### MT-9: Coolify-Deployment + E2E-Test
- Goal: Worker auf Hetzner, Block-Submit → KUs in < 5 min mit >= 2 Iterationen
- Dependencies: MT-8

### MT-10: Ollama-Aufraeumen
- Goal: Alle Ollama-Spuren entfernen
- Dependencies: MT-3..MT-7
