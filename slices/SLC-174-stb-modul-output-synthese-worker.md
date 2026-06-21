# SLC-174 — Modul-Output-Synthese-Worker (lean Fan-out + Bounded-Critic + Cost-Cap)

- Version: V10
- Feature: FEAT-094
- Backlog: BL-513
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: C (sequenziell nach A+B) — abhaengig von SLC-169 (Tabelle+RPC) + SLC-173 (Capture-Antworten)
- MIG reserviert: keine (Job-Typ/Tier/CHECK in MIG-124, SLC-169)
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc174-synthese-worker`, Merge nach /qa-PASS

## Ziel
Der neue Worker `handle-module-output-job.ts` erzeugt pro Modul aus den Capture-Antworten via KI das strukturierte Deliverable: das Output-Triple (Entscheidung / Standard / Implementierungsschritt) + eine KI-Hebel-Liste (Reifegrad 1-4). Lean Fan-out (Draft) + Bounded-Critic (~2-4 LLM-Calls/Modul) nach dem `bulk-email/handle-synthesis-job`-Muster — NICHT der schwere condensation-Orchestrator, NICHT Single-Pass. Tier-gated, cost-capped, EU-Region. ~70-80 % Draft-Ziel.

## Architektur-Anker
- DEC-235: lean Per-Modul-Synthese (Draft + Bounded-Critic) nach `bulk-email/handle-synthesis-job`-Muster; `job_type = module_output_synthesis`; Bedrock Sonnet eu-central-1 via `src/lib/llm.ts`; strukturierter JSON-Output; `ai_cost_ledger` + Cost-Cap (Run-Cap + Tenant-Monatscap + Worker-Live-Cap).
- ARCHITECTURE §3.5 + §5.3. Schreibt `modul_output`-Rows (SLC-169 Schema).
- Synthetic-`ai_jobs`-Pattern NICHT noetig — Enqueue laeuft ueber `rpc_enqueue_module_output` (SLC-169), also echter Queue-Job (kein synchroner Service-Call).

## Akzeptanzkriterien
- **AC-174-1:** Worker `handle-module-output-job.ts` verarbeitet `module_output_synthesis`-Jobs: liest `block_checkpoint.content` (SLC-173-Shape), lean Fan-out erzeugt Entscheidung/Standard/Implementierungsschritt + KI-Hebel-Liste, Bounded-Critic prueft/verbessert (~2-4 Calls total).
- **AC-174-2:** Schreibt `modul_output`-Rows: je Output-Kind (`entscheidung`/`standard`/`implementierungsschritt`) + `ki_hebel`-Rows mit `reifegrad` 1-4; `source='ai_draft'`, `status='proposed'`, `ai_job_id` gesetzt, `evidence_refs` aus Capture-Antworten. Writes via `service_role` (RLS AC-169-2).
- **AC-174-3:** ~70-80 % Draft-Abdeckung pro Modul (kuratier-/editierbarer Zustand); StB-Vertiefung = Status-Edit auf `modul_output` (SLC-175-Scope).
- **AC-174-4:** Jeder LLM-Call EU (Bedrock Frankfurt); Kosten in `ai_cost_ledger` geloggt; Cost-Cap greift (Run-Cap + Tenant-Monatscap + Worker-Live-Cap, Reuse bestehender Cap-Mechanik).
- **AC-174-5:** Bei LLM-Fail: deterministischer Fallback / sauberer Error-State, KEIN Silent-Fail (Job → `failed`, kein halb-geschriebenes `modul_output`).
- **AC-174-6:** Reifegrad-Inferenz festgelegt (deterministisch aus Evidenz-Dichte/Confidence vs. LLM-gewertet — Entscheidung im Slice dokumentiert, siehe R-174-2).
- **AC-174-7:** `tsc`/`eslint` 0; hermetische Tests (Prompt-Bau, Critic, Writer, Fallback) GREEN; DB-Sidecar `modul_output`-Write-Test GREEN.

## Micro-Tasks

### MT-1: Synthese-Prompt + lean Fan-out (Draft)
- Goal: aus Capture-Antworten Triple + KI-Hebel-Draft erzeugen.
- Files: `src/lib/stb-vertikale/synthesis-prompt.ts` (neu — strukturierter JSON-Output-Vertrag Triple + ki_hebel[reifegrad]), `src/lib/stb-vertikale/synthesize-module-output.ts` (neu — Fan-out via `src/lib/llm.ts`), Tests.
- Expected behavior: deterministischer Prompt aus `block_checkpoint.content` + Modul-Template-Context; LLM liefert valides JSON (Triple + ki_hebel).
- Verification: hermetischer Prompt-Test (Content-Block + Output-Schema); JSON-Parse-Guard.
- Dependencies: SLC-169 (Schema-Shape), SLC-173 (Capture-Shape).

### MT-2: Bounded-Critic + Reifegrad-Inferenz
- Goal: Draft-Qualitaet anheben (1 Critic-Pass) + Reifegrad zuordnen.
- Files: `src/lib/stb-vertikale/critic.ts` (neu — Bounded-Critic, max 1-2 Refine-Calls), Reifegrad-Inferenz-Helper, Tests.
- Expected behavior: Critic prueft Triple gegen Modul-Kriterien, gibt verbessertes JSON; `reifegrad` 1-4 pro KI-Hebel gesetzt (Inferenz-Regel dokumentiert).
- Verification: hermetischer Test (Critic verbessert/bestaetigt; Reifegrad in 1-4).
- Dependencies: MT-1.

### MT-3: modul_output-Writer + Status-Lifecycle + Cost-Cap + Fallback
- Goal: Ergebnis persistent, kosten-getrackt, fail-safe.
- Files: `src/workers/stb-vertikale/handle-module-output-job.ts` (neu — Worker-Handler), Worker-Registrierung (bestehende Worker-Registry erweitern), `ai_cost_ledger`-Logging (Reuse), Cost-Cap-Check (Reuse), Tests (hermetisch + DB-Sidecar Write).
- Expected behavior: Job → Synthese → `modul_output`-Rows (service_role); Cost in `ai_cost_ledger`; Cap-Ueberschreitung → Job `failed` sauber; LLM-Fail → kein halber Write, Job `failed`.
- Verification: hermetischer Worker-Test (Happy + Cap-Reject + LLM-Fail); DB-Sidecar `modul_output`-Write + RLS (service_role schreibt, tenant liest).
- Dependencies: MT-1, MT-2, SLC-169 (Tabelle+RPC live).

## Risiken & Dependencies
- **R-174-1 (Muster-Reuse-Disziplin):** `bulk-email/handle-synthesis-job.ts` als kanonische Vorlage code-lesen (Fan-out + Cost-Cap + Job-Lifecycle) — NICHT condensation-Orchestrator portieren (Overkill, DEC-235).
- **R-174-2 (Reifegrad-Inferenz, OFFEN aus ARCH §10):** deterministisch vs. LLM-gewertet — im /backend festlegen + dokumentieren. Empfehlung: LLM schlaegt Reifegrad vor, deterministischer Clamp auf 1-4 + Plausibilitaets-Check.
- **R-174-3 (Live-Smoke = R1-Validierung):** echte Draft-Qualitaet (~70-80 %) erst an Founder-eigener Kanzlei messbar (Internal-Test). Code-Side beweist Pfad + Schema + Cost-Cap; Qualitaet = post-deploy observational.
- **Dependency:** SLC-169 (modul_output + RPC + Job-Typ live), SLC-173 (Capture-Antworten). Liefert `modul_output`-Rows → SLC-175.

## Out of Scope
Mandanten-Output (V11+); vollautomatische Umsetzung (Change-Management bleibt beim Unternehmer); Embedding-Normalisierung ueber bestehendes RAG hinaus; Reader-UI (SLC-175).
