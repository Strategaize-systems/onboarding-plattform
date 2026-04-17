# SLC-008 — Worker-Container + Multi-Agent Verdichtung + Blueprint Chat-Flow

- Feature: FEAT-005
- Status: planned
- Priority: Blocker (Herzstueck V1)
- Created: 2026-04-14
- Updated: 2026-04-17 (DEC-014: Single-Pass → Multi-Agent-Loop, Blueprint-Chat-Flow-Integration)
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Zwei Teile:

**Teil A — Blueprint Chat-Flow (interaktiv):** Der Fragebogen-Workspace bekommt den vollstaendigen Blueprint-Chat-Flow: KI-Chat mit Kontextgedaechtnis, "Zusammenfassung erstellen"-Button (nach ≥2 Nachrichten), Summary-Card mit "Als Antwort uebernehmen" + "Regenerieren", Event-History rechts statt falschem Direkt-Textarea, "Was die KI sich gemerkt hat" Memory-Sektion. Alle Endpoints nutzen Bedrock Claude Sonnet eu-central-1.

**Teil B — Worker + Verdichtung (Background):** Separater Docker-Service `worker` laeuft neben `app`, pollt `ai_jobs`-Queue (SKIP LOCKED), verarbeitet `knowledge_unit_condensation`-Jobs mit iterativem Analyst+Challenger Loop: laedt Checkpoint, fuehrt 2-8 Iterationen Analyst→Challenger durch (Bedrock Claude Sonnet eu-central-1), schreibt finale `knowledge_unit` via RPC, loggt Kosten und Iterations-Verlauf.

## WICHTIG — Blueprint 1:1 Pflicht
Die Questionnaire-UI muss den Blueprint-Flow (strategaize-blueprint-plattform) exakt replizieren:
- Referenz-Datei: `strategaize-blueprint-plattform/src/app/runs/[id]/run-workspace-client.tsx`
- Kein eigenes UI erfinden — nur Datenquellen/Tabellennamen anpassen
- Rechte Spalte = Event-History (gespeicherte Antworten chronologisch), KEIN Direkt-Textarea
- Antwort-Flow: Chat → Zusammenfassung → Uebernehmen → Speichern
- "Ausnahmen & Ergaenzungen" existiert NICHT (SLC-007 reverted)

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

### Teil A — Blueprint Chat-Flow
- Bedrock-Client: `src/lib/ai/bedrock-client.ts` (Claude Sonnet eu-central-1, Provider-Adapter-Pattern)
- Chat-API erweitern: `/api/chat/block` bekommt Memory-Kontext, Profil-Kontext, Frage-Kontext (wie Blueprint)
- Generate-Answer-API: `/api/chat/block/generate-answer` — Zusammenfassung des Chat-Verlaufs (temp 0.3, max 2048 tokens)
- Run-Memory-System: Tabelle `session_memory` (session_id, memory_text, version, updated_at), API GET/POST, async Fire-and-Forget Updates nach jedem Chat
- Event-basierte Antwort-Speicherung: Events statt direktem JSONB-Merge (wie Blueprint `question_events`)
- UI-Umbau `questionnaire-form.tsx`:
  - "Zusammenfassung erstellen"-Button (erscheint nach ≥2 Chat-Nachrichten)
  - Summary-Card mit gruener Formatierung + "Als Antwort uebernehmen" + "Regenerieren"
  - Rechte Spalte: Event-History (gespeicherte Antworten chronologisch) statt Direkt-Textarea
  - "Was die KI sich gemerkt hat" Memory-Sektion unter dem Questionnaire-Grid
  - "Antwort speichern"-Button speichert uebernommene Zusammenfassung oder Chat-Input
- Referenz: `strategaize-blueprint-plattform/src/app/runs/[id]/run-workspace-client.tsx`

### Teil B — Worker + Verdichtung
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
- Tests: Prompt-Generation, Output-Parser, Iteration-Loop, Worker-Claim-Flow, Chat-Summary

## Out of Scope
- Exception-Feld / "Ausnahmen & Ergaenzungen" (SLC-007 reverted, kein Berater-Use-Case)
- Rechtes Direkt-Textarea (entfernt, Antworten kommen nur aus Chat-Flow)
- Iterative Luecken-Erkennung mit Rueckspielung ins Questionnaire (V2)
- Auto-Retry bei Transient-Fails (V1 manueller Retry)
- Horizontale Skalierung mit mehreren Workers (trivial via compose-replicas, kein V1-Use-Case)
- Ollama-Client wird NICHT portiert (Rule: 0 Ollama-Code-Pfade am Ende dieses Slices)
- Prompt-Admin-UI (V2+)
- Free-Form-Chat-Tab (Blueprint hat "Offen"-Tab, aber erst V2 fuer Onboarding)

## Acceptance

### Teil A — Chat-Flow
- User tippt im Chat-Input (links unten), sendet Nachricht → KI antwortet im Chat
- Nach ≥2 Nachrichten: "Zusammenfassung erstellen"-Button erscheint
- Klick auf Zusammenfassung → gruene Summary-Card erscheint mit vorgeschlagener Antwort
- "Als Antwort uebernehmen" setzt Text als Antwort-Entwurf
- "Antwort speichern" speichert die Antwort (Event-basiert)
- Rechte Spalte zeigt gespeicherte Antworten chronologisch (Event-History)
- "Was die KI sich gemerkt hat" zeigt akkumulierten Memory-Text
- Memory wird async nach jedem Chat aktualisiert und fliesst in naechste Chat-Runde ein
- KEIN Direkt-Textarea rechts, KEIN Exception-Feld

### Teil B — Worker + Verdichtung
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

### Teil A — Blueprint Chat-Flow

### MT-A1: Bedrock-Client + Provider-Adapter
- Goal: Zentraler Bedrock-Client (Claude Sonnet eu-central-1, DEC-006)
- Files: `src/lib/ai/bedrock-client.ts`, Tests
- Expected behavior: `invokeModel(prompt, options)` → Response. Temp/maxTokens konfigurierbar. Cost-Tracking vorbereitet.
- Dependencies: AWS-Credentials in ENV

### MT-A2: Chat-API erweitern (Memory + Kontext)
- Goal: `/api/chat/block` Endpoint nutzt Bedrock-Client, laedt Memory/Profil/Frage-Kontext (wie Blueprint)
- Files: `src/app/api/chat/block/route.ts`, Tests
- Referenz: `strategaize-blueprint-plattform/src/app/api/tenant/runs/[runId]/questions/[questionId]/chat/route.ts`
- Dependencies: MT-A1

### MT-A3: Session-Memory-System
- Goal: Tabelle `session_memory` (session_id, memory_text, version, updated_at) + API + async Fire-and-Forget Updates
- Files: `sql/migrations/033_session_memory.sql`, `src/app/api/capture/[sessionId]/memory/route.ts`
- Referenz: Blueprint `run_memory` + `updateRunMemory()`
- Dependencies: MT-A2

### MT-A4: Generate-Answer-Endpoint (Zusammenfassung)
- Goal: `/api/chat/block/generate-answer` — Chat-Verlauf zusammenfassen, Antwort vorschlagen (temp 0.3, max 2048 tokens)
- Files: `src/app/api/chat/block/generate-answer/route.ts`, Tests
- Referenz: `strategaize-blueprint-plattform/src/app/api/tenant/runs/[runId]/questions/[questionId]/generate-answer/route.ts`
- Dependencies: MT-A1, MT-A3

### MT-A5: UI-Umbau Questionnaire-Workspace (Blueprint 1:1)
- Goal: questionnaire-form.tsx komplett auf Blueprint-Flow umbauen
- Changes:
  - "Zusammenfassung erstellen"-Button (nach ≥2 Nachrichten)
  - Summary-Card (gruen, Sparkle-Icon) mit "Als Antwort uebernehmen" + "Regenerieren"
  - Rechte Spalte → Event-History (gespeicherte Antworten chronologisch)
  - "Was die KI sich gemerkt hat" Memory-Sektion
  - "Antwort speichern" speichert uebernommene Zusammenfassung oder Chat-Input
- Files: `src/app/capture/[sessionId]/block/[blockKey]/questionnaire-form.tsx`, ggf. `event-history.tsx`, `run-memory-view.tsx`
- Referenz: `strategaize-blueprint-plattform/src/app/runs/[id]/run-workspace-client.tsx` (Zeilen 1146-1539)
- Dependencies: MT-A2, MT-A3, MT-A4

### MT-A6: Event-basierte Antwort-Speicherung
- Goal: Antworten als Events speichern (wie Blueprint `question_events`), Save-Action anpassen
- Files: `src/app/capture/[sessionId]/block/[blockKey]/actions.ts`, ggf. Migration fuer Event-Tabelle
- Dependencies: MT-A5

### Teil B — Worker + Verdichtung

### MT-1: Migration 034 — Queue-RPCs + Cost-Ledger + Iterations-Log
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
