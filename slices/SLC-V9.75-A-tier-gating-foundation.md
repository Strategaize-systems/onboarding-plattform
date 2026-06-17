# SLC-V9.75-A — Tier-Gating Foundation

> **Status:** planned · **Feature:** FEAT-085 / BL-506 · **Version:** V9.75 · **Created:** 2026-06-17 (RPT-482)
> **Worktree:** `v9-75-exit-readiness` (Cumulative-Single-Branch, MT-0 Setup) · **MIG reserviert:** 121 (+122 falls Split) · **Delivery Mode:** SaaS (TDD mandatory)
> **Basis:** ARCHITECTURE.md „## V9.75 Architecture Addendum" §3/§4/§5/§8 · DEC-219/220/221 · /architecture RPT-481

## Ziel
Server-side erzwungenes Stufen-Flag pro `capture_session` (`free`/`blueprint`/`handbook`), das an JEDEM Dispatch-Eintrittspunkt + als Worker-Defense durchgesetzt wird. Schliesst ISSUE-097. **Zuerst — alles haengt am Flag.**

## In Scope
- `capture_session.tier` + `ai_jobs.session_tier` (Stempel) Spalten.
- SQL-Single-Source-Matrix (`fn_tier_rank`, `fn_min_tier_for_job`, `fn_session_tier_allows`).
- Schreibpfad-Schutz: `set_capture_session_tier`-RPC (strategaize_admin) + `capture_session_tier_change_guard`-Trigger (service_role-aware, Reuse BS-`profiles.role`-Pattern).
- Dispatch-Gate Schicht 1: Inline in `rpc_create_block_checkpoint` (032), `rpc_enqueue_recondense_job` (047), `rpc_trigger_handbook_snapshot` (074) + TS-`assertSessionTierAllows` in 5 TS-Dispatches.
- Worker-Defense Schicht 2: `rpc_claim_next_ai_job_for_type` (035) gibt `session_tier` zurueck; `claim-loop.ts` prueft nach Claim, fail-closed.
- Bypass-Test-Matrix (direkter Call pro gated Pfad + PostgREST-PATCH-Self-Promotion).

## Out of Scope
- Fahrplan-Report (SLC-B), Register (SLC-C). Billing / Self-Serve-Upgrade. Volle Tier-Admin-UI (Internal-Test-Mode: server-action + RPC genuegen).

## Akzeptanzkriterien
- **AC-A-1** (SC-V9.75-1): `capture_session.tier text NOT NULL DEFAULT 'handbook' CHECK (tier IN ('free','blueprint','handbook'))`; Bestands-Sessions backfillen auf `handbook` (kein Funktionsverlust).
- **AC-A-2** (SC-V9.75-2): Ein gated `job_type` ueber Session-Stufe wird **am Dispatch-Punkt** abgelehnt (RPC RAISE / TS-Guard-Error), nachgewiesen per direktem RPC-/Action-Aufruf pro Pfad.
- **AC-A-3** (SC-V9.75-2, Defense-in-Depth): Ein gated Job, der die Dispatch-Schicht umgeht (direkter `ai_jobs`-INSERT), wird im **Worker** nach Claim abgelehnt (`status='failed'`, `error='tier_gate_denied_worker'`, Handler nicht aufgerufen). NULL `session_tier` bei gated job_type → fail-closed.
- **AC-A-4** (SC-V9.75-3): ISSUE-097 geschlossen — `blueprint`/`free`-Session kann `email_bulk_*`, `sop_generation`, `handbook_snapshot_generation`, `dialogue_*`, `walkthrough_*` weder per Menue noch per direktem RPC/Action ausloesen.
- **AC-A-5** (Security): `tier` ist column-level geschuetzt — `PATCH /rest/v1/capture_session {tier:'handbook'}` durch `authenticated`/`tenant_admin` wird vom Trigger geblockt; nur `set_capture_session_tier` (strategaize_admin/service_role) aendert es. Bypass-Test (direkter PATCH) GREEN.
- **AC-A-6** (SC-V9.75-8): Tenant-RLS — tenant liest eigene `tier`, kann sie nicht schreiben; kein Cross-Tenant-Read/Write (node:20-Sidecar SAVEPOINT-Pen-Test).
- **AC-A-7**: Matrix-Single-Source — TS-Guard-Erlaubnis == `fn_min_tier_for_job`-Output fuer alle 20 `job_type`s (Paritaets-Test). `lead_push_retry` ungated.
- **AC-A-8**: TSC EXIT=0, ESLint EXIT=0, Vitest GREEN (neue Tests + 0 Regression), `next build` PASS.

## Risiken
- **R-A-1** (PRD R1): breite Gating-Oberflaeche (8 Dispatch-Punkte). Mitigation: SQL-Single-Source + Worker-Defense-Backstop + Bypass-Test pro Pfad (MT-5).
- **R-A-2**: `set_capture_session_tier` / Trigger-Wechselwirkung — der legitime Admin-Set darf nicht vom Trigger geblockt werden (service_role-aware Guard, Reuse BS-`profiles.role`-Lehre IMP-1207). Test: service_role-Set ok, authenticated-Set blocked.
- **R-A-3**: `rpc_claim_next_ai_job_for_type`-Aenderung (Return-Shape) — bestehender Worker-Claim-Pfad darf nicht brechen. Test: Claim ungated job (`lead_push_retry`) laeuft unveraendert.
- **R-A-4** (PRD R4): falscher Default gatet interne Sessions. Mitigation: Default `handbook` + Backfill-Verify.
- **R-A-5**: `bridge_generation`-Min-Tier (blueprint angenommen) an realer Handler-Semantik bestaetigen — 1-Zeilen-Aenderung in `fn_min_tier_for_job`.

## Micro-Tasks

#### MT-0: Worktree-Setup
- Goal: Cumulative-Single-Branch-Worktree fuer V9.75 aufsetzen.
- Files: — (git worktree `v9-75-exit-readiness` aus `main`)
- Expected behavior: `git worktree add c:/strategaize/strategaize-onboarding-plattform-v975 -b v9-75-exit-readiness main`, `npm install`, `tsc --noEmit` + `next build` Baseline EXIT=0.
- Verification: Branch existiert, Baseline-Build gruen.
- Dependencies: none

#### MT-1: Migration 121 — Schema + Matrix-Funktionen + Schreibpfad-Schutz (TDD-RED zuerst)
- Goal: tier-Spalte, session_tier-Stempel-Spalte, Matrix-Funktionen, set-tier-RPC, Change-Guard-Trigger, RLS.
- Files: `sql/migrations/121_v975_tier_gating_foundation.sql`, `src/__tests__/migrations/121-v975-tier-gating.test.ts`
- Expected behavior: `ALTER capture_session ADD tier ...`; `ALTER ai_jobs ADD session_tier text NULL`; `fn_tier_rank(text) IMMUTABLE` (free=0/blueprint=1/handbook=2); `fn_min_tier_for_job(text) IMMUTABLE` (Matrix §3); `fn_session_tier_allows(uuid,text)` (liest capture_session.tier + Rank-Vergleich); `set_capture_session_tier(uuid,text)` SECURITY DEFINER strategaize_admin-only; `capture_session_tier_change_guard` BEFORE-UPDATE-Trigger (service_role-aware); RLS: tenant SELECT tier, kein tenant UPDATE tier.
- Verification: node:20-Sidecar (coolify-test-setup): Spalte+Default-Backfill, alle 20 job_types→korrektes Min-Tier, authenticated tier-UPDATE→Exception, service_role tier-UPDATE→ok, authenticated other-column-UPDATE→ok, Cross-Tenant→denied (SAVEPOINT).
- Dependencies: MT-0

#### MT-2: Dispatch-Gate Schicht 1 — 3 PL/pgSQL-RPCs (TDD-RED)
- Goal: Inline-Tier-Gate + session_tier-Stempel in den 3 RPC-Dispatches.
- Files: `sql/migrations/121_*.sql` (CREATE OR REPLACE; ggf. eigenes File 122), `src/__tests__/migrations/121-v975-tier-gating.test.ts` (erweitert)
- Expected behavior: `rpc_create_block_checkpoint`/`rpc_enqueue_recondense_job`/`rpc_trigger_handbook_snapshot` rufen `fn_session_tier_allows(p_capture_session_id, '<job_type>')`; bei false `RAISE EXCEPTION 'tier_gate_denied'`; bei INSERT in `ai_jobs` wird `session_tier = capture_session.tier` mitgeschrieben.
- Verification: Sidecar — handbook-Trigger auf `blueprint`-Session→Exception; condensation auf `free`-Session→Exception; auf `handbook`-Session→Job + session_tier='handbook' gestempelt.
- Dependencies: MT-1

#### MT-3: Dispatch-Gate Schicht 1 — TS-Guard + 5 TS-Dispatches + set-tier-Action (TDD)
- Goal: gemeinsamer TS-Guard + Wiring + Paritaets-Test + Tier-Verwaltungs-Action.
- Files: `src/lib/auth/assert-session-tier.ts` (+ `.test.ts`), `src/app/admin/debrief/[sessionId]/[blockKey]/diagnosis-actions.ts`, `…/sop-actions.ts`, `src/lib/walkthrough/pipeline-trigger.ts`, `src/lib/bulk-email/pipeline-trigger.ts`, `src/app/api/dialogue/recording-ready/route.ts`, `src/app/admin/.../set-tier-action.ts`
- Expected behavior: `assertSessionTierAllows(client, sessionId, jobType)` (RPC-Roundtrip auf `fn_session_tier_allows` — eine Wahrheit) vor jedem `.insert()`; jeder Dispatch stempelt `session_tier`. `setCaptureSessionTier(sessionId, tier)` (strategaize_admin-Guard) ruft `set_capture_session_tier`-RPC. Paritaets-Test: Guard-Erlaubnis == SQL fuer alle 20 job_types.
- Verification: Unit-Tests (Guard allow/deny + Parität) + manuelle Wiring-Diff-Review (alle 5 Pfade gated + gestempelt). TSC/ESLint EXIT=0.
- Dependencies: MT-1, MT-2

#### MT-4: Worker-Defense Schicht 2 (TDD)
- Goal: Claim-RPC liefert session_tier; Worker prueft fail-closed nach Claim.
- Files: `sql/migrations/121_*.sql` (CREATE OR REPLACE `rpc_claim_next_ai_job_for_type`), `src/workers/condensation/claim-loop.ts`, `src/workers/condensation/claim-loop.test.ts`
- Expected behavior: Claim-RPC-Return um `session_tier` erweitert; in `claim-loop` nach Claim `fn_tier_allows(session_tier, job_type)` (oder TS-Spiegel) → bei Verstoss Job `status='failed'`, `error='tier_gate_denied_worker'`, kein Handler-Aufruf. NULL bei gated job_type → Payload-Resolve, sonst fail-closed. `lead_push_retry` immer erlaubt.
- Verification: Worker-Unit-Test (gated Job low-tier → failed, Handler nicht aufgerufen; ungated → unveraendert; NULL gated → failed). Sidecar Claim-Return-Shape.
- Dependencies: MT-1, MT-2

#### MT-5: Bypass-Test-Matrix + ISSUE-097-Closure (TDD/Security)
- Goal: Nachweis server-side Durchsetzung pro gated Pfad + Self-Promotion-Block.
- Files: `src/__tests__/security/v975-tier-bypass.test.ts`
- Expected behavior: pro gated Pfad ein direkter RPC-/Action-Call auf zu-niedriger-Session → abgelehnt; direkter `ai_jobs`-INSERT eines gated job_type → Worker-failed; PostgREST-PATCH `tier` durch authenticated → Trigger-Block.
- Verification: Sidecar-Suite GREEN; ISSUE-097-Closure dokumentiert (KNOWN_ISSUES → resolved im /qa/deploy).
- Dependencies: MT-1..MT-4

## Pre-Conditions
SLC-A ist erste Slice; MT-0 erzeugt den Worktree. Keine externe Pre-Cond (0 ENV/Cron). Live-Apply Migration 121 erfolgt im /deploy (sql-migration-hetzner.md).
