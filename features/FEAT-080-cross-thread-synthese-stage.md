# FEAT-080 — Cross-Thread-Synthese-Stage

- Status: planned
- Version: V9.5
- Created: 2026-06-12

## Purpose
Eine additive Pipeline-Stage zwischen `email_bulk_run.status` `pattern_extracted` und `curating`. Sie liest **alle** rohen `email_pattern`-Rows eines Runs, partitioniert sie deterministisch nach `suggested_section` (DEC-215) und verdichtet sie pro Section via **einem** Sonnet-Synthese-Call zu konsolidierten, deduplizierten, evidenz-gewichteten Kandidaten-Units. Output: neue `email_synthesized_unit`-Rows (+ `email_synthesized_unit_source`-Provenance).

## Why it matters
Heute erzeugen 50 Mails ueber denselben wiederkehrenden Einwand 50 isolierte Pattern-Cards (flacher Per-Thread-Extraktor, FEAT-073). Die Synthese-Stage macht daraus **eine** gut belegte Aussage mit n Evidenz-Snippets — weniger Rauschen, weniger Curation-Last, mehr Wissens-Tiefe im Handbuch-Material. Das Analyst↔Challenger-**Prinzip** der Fragebogen-Verdichtung (`condensation/*`) wird auf den Bulk-Pfad gehoben, ohne den Code 1:1 zu reusen (Datenform Email-Fragmente ≠ Fragebogen-`BlockDefinition`).

## How it works
- Neuer Claim-Loop-Worker `email_bulk_synthesis` (job_type), Dispatcher-Wiring in `claim-loop.ts` + Registrierung in `run.ts`.
- Enqueue am Success-Tail des Per-Thread-Extraktors (1 Statement, Extraktor-Kern unveraendert — SC-V9.5-7; OQ-1).
- Status-Flow: `pattern_extracted → synthesizing → synthesized` (MIG-111).
- Synthese-Pure-Function `bedrock-sonnet/email-synthesis.ts` + frischer Prompt (ARCHITECTURE §V9.5.6), zod-Schema, eu-central-1.
- Persist: `email_synthesized_unit` (spiegelt curierbare `email_pattern`-Felder + `evidence_count`/`source_pattern_ids`) + Join `email_synthesized_unit_source` (pattern_id, thread_id).
- Cost: `synthesis_cost_eur` inkrementiert + Live-Cap gegen `total_cost_eur` (DEC-217); regulaere `ai_jobs`-Row (kein synthetic), `ai_cost_ledger` role `email_bulk_synthesis`.
- Pseudonyme P1/P2 werden NICHT in die konsolidierte `description` uebernommen (thread-lokal, DEC-214).

## In Scope
- Synthese-Worker + Pure-Function + Prompt + Migration-Anbindung (MIG-111) + Dispatcher.
- Curation-UI + `importAcceptedPatterns` lesen `email_synthesized_unit` (DEC-214-Folge).
- Re-Run-Idempotenz (skip wenn Units fuer `bulk_run_id` existieren, OQ-4).

## Out of Scope
- Critic-Gate (FEAT-081, eigene LLM-Phase).
- Per-Thread-Multi-Pass, Corpus-Gap-Detection, Cross-Source-Synthese (PRD §V9.5 Out of Scope).

## Acceptance
- SC-V9.5-1 (messbare Reduktions-Quote raw→konsolidiert), SC-V9.5-2 (Multi-Thread-Evidenz-Aggregation: 1 Unit, n Snippets), SC-V9.5-4 (EU + Audit + unter Hard-Cap), SC-V9.5-5 (Promotion unveraendert), SC-V9.5-7 (Extraktor-Kern unveraendert), SC-V9.5-8 (Tenant-RLS). Siehe PRD §"Success Criteria (V9.5 Gesamt)".

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" — DEC-214/215/217, MIG-111, Prompt-Entwurf §6.
- /architecture RPT-454, /requirements RPT-453, /discovery RPT-452.
