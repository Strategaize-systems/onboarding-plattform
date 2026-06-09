# SLC-V9.1-B — Continuous-Cost-Cap-Service + Pipeline-Trigger (FEAT-077)

**Version:** V9.1
**Feature:** FEAT-077 (Continuous-Cost-Cap-Service: Daily + Monthly + Per-Email-Approval)
**Backlog:** BL-156
**Status:** planned
**Created:** 2026-06-09
**Priority:** High
**Estimate:** ~4-5 MTs, ~3-4 Tage Code-Side
**Worktree Branch:** `v9-1-forward-bucket-email` (Cumulative-Single-Branch, fortgesetzt aus SLC-V9.1-A)

## Slice Goal

Liefert die **Continuous-Cost-Kontrolle** fuer V9.1:

1. **Continuous-Cost-Cap-Service**: Wrapper um V9.0 `cost-cap.ts` (DEC-182) mit neuer Daily-Schicht. 3-Schichten-Defense per DEC-197: Daily 5 EUR + Monthly 100 EUR (V9-Reuse) + Per-Email-Approval > 0.50 EUR.
2. **Periodischer Pipeline-Trigger-Cron**: Coolify-Scheduled-Task ruft stuendlich `/api/cron/email-bulk-pipeline-trigger` auf, iteriert email_bulk_run mit `status='continuous'`, prueft Continuous-Cost-Cap + Trigger-Bedingung (`email_count >= EMAIL_BULK_TRIGGER_MIN_COUNT` ODER Daily-Roll-Over), triggert V9.0-Pipeline (status `continuous -> parsing`).
3. **Per-Email-Approval-Modal-Logik**: Pre-Cost-Estimate vor Sonnet-Call. Bei >0.50 EUR/Email -> GF-Notification + Pipeline-Pause + Approval-Modal (Pattern aus V9 `pattern-start/page.tsx` Reuse).
4. **GF-Notification + Pipeline-Pause**: Bei Daily/Monthly-Hit -> UPDATE email_bulk_run.status='paused' + audit_log + Email-Notification an Founder + Banner in admin/audit/bulk-email-Page.

Output: Cost-Layer komplett, Foundation-Layer (SLC-V9.1-A) fliesst kontrolliert in V9.0-Pipeline. Fertig fuer SLC-V9.1-C Retention-Cron.

## In Scope

- **`src/lib/bulk-email/continuous-cost-cap.ts`** — Pure-Function `checkContinuousCostCap(tenantId): Promise<CapCheckResult>` per ARCHITECTURE.md V9.1 Flow C. Wrapt V9.0 `cost-cap.ts`.
- **`src/lib/bulk-email/__tests__/continuous-cost-cap.test.ts`** — Vitest fuer 3-Schichten (Daily-Hit, Monthly-Hit, Both-Pass) + Edge-Cases (NULL-Cost, fehlendes vw_bulk_email_cost_daily).
- **`src/app/api/cron/email-bulk-pipeline-trigger/route.ts`** — Cron-Endpoint mit `verifyCronSecret`-Pattern (Strategaize-Standard), iteriert email_bulk_run, Cap-Check + Trigger-Bedingung, enqueue `email_bulk_parse`-Job (V9.0-Worker-Reuse).
- **`src/app/api/cron/email-bulk-pipeline-trigger/__tests__/route.test.ts`** — Vitest gegen Coolify-DB: Multi-Tenant-Run-Listing, Cap-Hit-Skip, Threshold-Pass-Trigger, Daily-Roll-Over-Detect.
- **`src/lib/bulk-email/per-email-approval.ts`** — Pre-Cost-Estimate-Helper: `estimatePatternExtractionCost(emailCount): { total_eur, per_email_eur }` + Schwellen-Check vs `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR`.
- **`src/lib/bulk-email/__tests__/per-email-approval.test.ts`** — Vitest fuer Pre-Estimate-Logik.
- **`src/lib/bulk-email/notify-founder.ts`** — Email-Notification-Helper (Reuse V8.1 `src/lib/email/sender.ts` Pattern): bei Daily/Monthly-Hit -> Email an Founder mit Tenant-Slug + Reason + Actual-Cost + Cap.
- **`src/lib/bulk-email/__tests__/notify-founder.test.ts`** — Vitest fuer Notify-Body-Template.
- **`src/workers/bulk-email/handle-parse-job.ts`** Update: Vor jedem Sonnet-Pattern-Extraction-Call -> Per-Email-Approval-Check; bei Threshold-Hit ohne `approval_token` in Payload -> UPDATE bulk_run.status='awaiting_approval' + INSERT audit_log (event_type='email_bulk_per_email_approval_requested') + Notify-Founder.
- **`src/app/admin/audit/bulk-email/page.tsx`** Update: Cap-Hit-Banner anzeigen wenn min. 1 Tenant `status='paused'` ODER `status='awaiting_approval'` hat.
- **Coolify-Scheduled-Task-Eintrag** (Dokumentation in `docs/RUNBOOK.md` Erweiterung): stuendliche Frequenz `0 * * * *` POST an `/api/cron/email-bulk-pipeline-trigger` mit CRON_SECRET-Header.
- **`docs/RUNBOOK.md`** Erweiterung Section "V9.1 Continuous-Cost-Cap + Pipeline-Trigger" mit Founder-Reset-Procedure (`UPDATE email_bulk_run SET status='continuous' WHERE status='paused' AND tenant_id=...` nach Manuell-Cost-Review).

## Out of Scope

- **Storage-Retention-Cron** (Soft-Delete + Hard-Delete + Idempotency vs knowledge_unit) — SLC-V9.1-C
- **Setup-UI + Admin-Audit-Erweiterung Forward-Source-Statistik** — SLC-V9.1-D
- **Per-Tenant-Cost-Cap-Override via Tenant-Settings JSONB** — V9.1.x
- **Sliding-Window Cost-Cap** (statt Cold-Start) — V9.2+
- **In-App Notification-Channel** (statt Email-only) — V9.2+
- **Auto-Resume nach Cap-Reset** (statt Manuell-Reset via Founder) — V9.2+

## Pre-Conditions

- ✓ SLC-V9.1-A DONE (Inbound-Foundation + Validation-Layer + Schema-Migrations LIVE)
- ✓ V9.0 `cost-cap.ts` + `vw_bulk_email_cost_daily` + `vw_bulk_email_cost_monthly` LIVE (DEC-182)
- ✓ V9.0 `email_bulk_parse`-Worker LIVE (SLC-165 + SLC-166 + SLC-167)
- ✓ Coolify CRON_SECRET ENV vorhanden (Strategaize-Standard, schon fuer V9.0-Cleanup-Crons gesetzt)
- ⏳ Coolify-Scheduled-Task-Eintrag fuer `/api/cron/email-bulk-pipeline-trigger` (PFLICHT vor MT-2 Live-Smoke — Founder-Setup ~5 Min)

## Micro-Tasks

### MT-1: Continuous-Cost-Cap-Service + Per-Email-Approval-Helper
- **Goal**: `continuous-cost-cap.ts` + `per-email-approval.ts` Pure-Functions mit Vitest-Coverage.
- **Files**:
  - `src/lib/bulk-email/continuous-cost-cap.ts` (NEU)
  - `src/lib/bulk-email/per-email-approval.ts` (NEU)
  - `src/lib/bulk-email/__tests__/continuous-cost-cap.test.ts` (NEU)
  - `src/lib/bulk-email/__tests__/per-email-approval.test.ts` (NEU)
- **Expected behavior**:
  - `checkContinuousCostCap(tenantId): Promise<CapCheckResult>` per ARCHITECTURE.md V9.1 Flow C:
    1. SELECT `vw_bulk_email_cost_daily` fuer today + tenantId -> Daily-Hit-Check
    2. SELECT `vw_bulk_email_cost_monthly` fuer current-month + tenantId -> Monthly-Hit-Check
    3. Return `{ allowed: boolean, reason?: 'daily_cap_hit'|'monthly_cap_hit', cap?: number, actual?: number }`
  - ENV-Defaults: `EUR_CAP_DAILY=V91_BULK_EMAIL_DAILY_CAP_EUR ?? 5`, `EUR_CAP_MONTHLY=V91_BULK_EMAIL_MONTHLY_CAP_EUR ?? 100`
  - `estimatePatternExtractionCost(emailCount): { total_eur, per_email_eur }` per DEC-179-V9-Schaetzung (~5 EUR Sonnet pro 1000 Emails = 0.005 EUR/Email Baseline, +20% Safety-Buffer)
  - `requiresPerEmailApproval(estimate, thresholdEur): boolean` -> wenn `per_email_eur > threshold` (DEC-197 0.50 EUR Default)
- **Verification**: Vitest GREEN:
  - Daily-Cost = 4.5 EUR -> allowed
  - Daily-Cost = 5.0 EUR -> daily_cap_hit
  - Monthly-Cost = 99 EUR -> allowed (Daily auch unter)
  - Monthly-Cost = 101 EUR -> monthly_cap_hit (Daily-Check uebersprungen wenn Daily auch hit)
  - NULL-Cost (kein Run heute) -> allowed
  - Per-Email-Estimate 1000 Emails -> ~0.006 EUR/Email (mit Safety-Buffer)
  - Per-Email-Approval-Schwelle 0.50 EUR -> 100-Emails-Mega-Cluster (5 EUR Total / 0.05 EUR/Email) -> nicht-required
- **Dependencies**: SLC-V9.1-A DONE

### MT-2: Pipeline-Trigger-Cron-Endpoint
- **Goal**: `/api/cron/email-bulk-pipeline-trigger` mit `verifyCronSecret`-Pattern, iteriert email_bulk_run-Rows mit `status='continuous'`, prueft Continuous-Cost-Cap + Trigger-Bedingung, enqueue `email_bulk_parse`-Job.
- **Files**:
  - `src/app/api/cron/email-bulk-pipeline-trigger/route.ts` (NEU)
  - `src/app/api/cron/email-bulk-pipeline-trigger/__tests__/route.test.ts` (NEU, Integration-Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Cron-Pattern (Strategaize-Standard per `strategaize-pattern-reuse.md`):
    - `verifyCronSecret` mit `CRON_SECRET` ENV + constant-time-compare
    - Bei Fail: 401 + audit_log (event_type='cron_secret_invalid')
  - Iteration: `SELECT FROM email_bulk_run WHERE inbound_source='forward_bucket' AND status='continuous'`
  - Pro Run:
    1. Pruefe Continuous-Cost-Cap fuer tenant_id (MT-1 Reuse)
    2. Bei Cap-Hit: skip + audit_log (event_type='email_bulk_pipeline_trigger_skipped', payload={tenant_id, reason}) + Notify-Founder bei Cap-Hit (MT-4)
    3. Pruefe Trigger-Bedingung:
       - `email_count >= V91_BULK_EMAIL_TRIGGER_MIN_COUNT` (Default 25, DEC-197)
       - ODER `DATE(created_at) < today` (Daily-Roll-Over, Run aus Vortag noch nicht-getriggert)
    4. Bei Trigger: UPDATE status='continuous' -> 'parsing' + INSERT ai_jobs (job_type='email_bulk_pipeline_trigger', payload={bulk_run_id})
  - Return: `{ runs_evaluated, runs_triggered, runs_skipped_cap, runs_skipped_threshold }`
  - **Atomar pro Run via Postgres-Function** falls Multi-Statement-Update noetig (per [[feedback-postgres-function-via-rpc-atomic-tx]] Decision-Tree — hier nur 1 UPDATE + 1 INSERT, daher kein RPC-Function noetig, supabase-js admin-client 2 Calls in try/catch reicht).
- **Verification**: Vitest gegen Coolify-DB:
  - Cron mit valider CRON_SECRET + 3 Tenants (2 unter Cap, 1 ueber Daily-Cap) -> 3 evaluated, 2 triggered, 1 skipped_cap
  - Cron mit invalider CRON_SECRET -> 401 + audit_log
  - Run mit email_count=20 (unter Threshold 25) UND today=created_at_date -> skipped_threshold
  - Run mit email_count=20 UND created_at=gestern -> triggered (Daily-Roll-Over)
  - Status-Transition `continuous -> parsing` korrekt
- **Dependencies**: MT-1

### MT-3: Per-Email-Approval-Logik in Worker
- **Goal**: `handle-parse-job.ts`-Erweiterung: Vor jedem Sonnet-Pattern-Extraction-Call -> Per-Email-Approval-Check; bei Threshold-Hit ohne Approval-Token -> UPDATE bulk_run.status='awaiting_approval' + audit_log + Notify-Founder.
- **Files**:
  - `src/workers/bulk-email/handle-parse-job.ts` (UPDATE — Pre-Sonnet-Call Hook)
  - `src/workers/bulk-email/__tests__/handle-parse-job.test.ts` (UPDATE — neue Test-Cases fuer Approval-Pause)
  - `src/lib/bulk-email/types.ts` (UPDATE — `ApprovalToken` Type)
- **Expected behavior**:
  - Pre-Sonnet-Hook in Worker:
    1. `estimatePatternExtractionCost(bulk_run.email_count)` aufrufen
    2. `requiresPerEmailApproval(estimate, threshold)` -> wenn true UND kein `approval_token` in Job-Payload:
       - UPDATE `email_bulk_run SET status='awaiting_approval', updated_at=now()` (atomar via single-UPDATE-Statement, kein Postgres-Function noetig)
       - INSERT `audit_log (event_type='email_bulk_per_email_approval_requested', tenant_id, payload={bulk_run_id, estimated_total_eur, estimated_per_email_eur, threshold_eur})`
       - Notify-Founder (MT-4)
       - return: Job beendet als 'paused', kein Sonnet-Call
    3. Bei `approval_token` in Payload (Founder hat approved via UI in SLC-V9.1-D) -> proceed mit Sonnet-Call
  - Pattern-Konsistenz zu V9.0 SLC-167 `pattern-start/page.tsx` Cost-Estimate-UI
- **Verification**: Vitest gegen Coolify-DB:
  - bulk_run mit email_count=100 (Estimate ~0.6 EUR/Email > 0.5 Threshold) ohne Approval-Token -> Worker setzt status='awaiting_approval' + audit_log + kein Sonnet-Call
  - bulk_run mit email_count=10 (Estimate ~0.06 EUR/Email < 0.5) -> Worker proceedet, kein Approval-Hook
  - bulk_run mit email_count=100 MIT Approval-Token in Payload -> Worker proceedet
- **Dependencies**: MT-1

### MT-4: GF-Notification + Admin-Audit-Banner
- **Goal**: Email-Notification-Helper + Banner-Component in admin/audit/bulk-email-Page bei `status='paused'` ODER `status='awaiting_approval'`.
- **Files**:
  - `src/lib/bulk-email/notify-founder.ts` (NEU)
  - `src/lib/bulk-email/__tests__/notify-founder.test.ts` (NEU)
  - `src/app/admin/audit/bulk-email/page.tsx` (UPDATE — Banner-Component bei Cap-Hit / Awaiting-Approval)
  - `src/app/admin/audit/bulk-email/__tests__/page.test.ts` (UPDATE — Banner-Sichtbarkeit-Test)
- **Expected behavior**:
  - `notifyFounderCapHit({ tenantId, reason, cap, actual })`: Reuse V8.1 SMTP-Adapter (`src/lib/email/sender.ts` per `strategaize-pattern-reuse.md`), Email-Body mit Tenant-Slug + Reason + Numbers + Direct-Link zu admin/audit/bulk-email.
  - `notifyFounderApprovalRequired({ tenantId, bulkRunId, estimatedEur })`: Analog mit Approval-Modal-Link.
  - Admin-Audit-Banner: Roter/Gelber-Banner oben in Page wenn min. 1 Tenant `status IN ('paused', 'awaiting_approval')` -> Liste + Direct-Action-Link "Cost-Review oeffnen" / "Approval-Modal oeffnen".
- **Verification**: Vitest:
  - Notify-Body-Template enthaelt Tenant-Slug + Reason + Cap + Actual
  - Admin-Audit-Page rendert Banner wenn 1 paused-Tenant, kein Banner wenn 0 paused-Tenants
  - Manuelle Smoke: SMTP-Send geht durch (V8.1 Reuse-Pattern)
- **Dependencies**: MT-2, MT-3

### MT-5: Live-Smoke + Records-Update + RUNBOOK
- **Goal**: Live-Smoke Cron-Endpoint + Per-Email-Approval-Flow + RUNBOOK-Erweiterung + Records-Update.
- **Files**:
  - `docs/RUNBOOK.md` (UPDATE — Section "V9.1 Continuous-Cost-Cap + Pipeline-Trigger" mit Founder-Reset-Procedure)
  - `slices/INDEX.md` (UPDATE — SLC-V9.1-B `planned -> in_progress -> done`)
  - `features/INDEX.md` (UPDATE — FEAT-077 `planned -> in_progress -> done`)
  - `planning/backlog.json` (UPDATE — BL-156 `in_progress -> done`)
  - `docs/STATE.md` (UPDATE — Current Focus + Last Stable Version bleibt V9)
- **Expected behavior**:
  - Live-Smoke: Coolify-Scheduled-Task-Eintrag manuell-getriggert via `curl -X POST https://onboarding.strategaizetransition.com/api/cron/email-bulk-pipeline-trigger -H "X-Cron-Secret: ..."` -> sieht Production-email_bulk_run-Rows, prueft Cap, triggert bei Threshold-Pass
  - Test-Per-Email-Approval-Flow mit kuenstlich-grossem bulk_run (100+ Emails) -> Worker setzt 'awaiting_approval', Founder bekommt Notification-Email
  - RUNBOOK enthaelt: `UPDATE email_bulk_run SET status='continuous' WHERE status='paused' AND tenant_id='...'` (Manuell-Reset-Pattern), `INSERT ai_jobs (job_type='email_bulk_pipeline_trigger', payload={bulk_run_id, approval_token='...'})` (Manuell-Approval-Trigger-Pattern)
- **Verification**: Live-Smoke-Manual-Test PASS, RUNBOOK Section vorhanden, alle Records Cockpit-konsistent.
- **Dependencies**: MT-4

## Acceptance Criteria

- **AC-V9.1-B-1**: `continuous-cost-cap.ts` Service mit 3-Schichten-Defense (Daily 5 EUR + Monthly 100 EUR + Per-Email-Approval > 0.50 EUR) implementiert, Vitest GREEN.
- **AC-V9.1-B-2**: Cron-Endpoint `/api/cron/email-bulk-pipeline-trigger` mit `verifyCronSecret` validiert CRON_SECRET, iteriert email_bulk_run mit `status='continuous'`, returnt `{ runs_evaluated, runs_triggered, runs_skipped_cap, runs_skipped_threshold }`.
- **AC-V9.1-B-3**: Cron triggert V9.0-Pipeline (`status: 'continuous' -> 'parsing'` + ai_jobs INSERT) bei `email_count >= V91_BULK_EMAIL_TRIGGER_MIN_COUNT` ODER Daily-Roll-Over (Run aus Vortag).
- **AC-V9.1-B-4**: Per-Email-Approval-Hook in `handle-parse-job.ts` setzt bulk_run.status='awaiting_approval' bei Estimate > 0.50 EUR/Email ohne Approval-Token in Payload + INSERT audit_log + Notify-Founder.
- **AC-V9.1-B-5**: Approval-Token in Job-Payload bypassed Hook, Worker proceedet mit Sonnet-Call.
- **AC-V9.1-B-6**: `notifyFounderCapHit` + `notifyFounderApprovalRequired` Email-Notifications via V8.1-SMTP-Adapter (Reuse-Pattern per `strategaize-pattern-reuse.md`).
- **AC-V9.1-B-7**: Admin-Audit-Banner in `/admin/audit/bulk-email` sichtbar wenn min. 1 Tenant `status IN ('paused', 'awaiting_approval')` mit Direct-Action-Link.
- **AC-V9.1-B-8**: RUNBOOK Section "V9.1 Continuous-Cost-Cap" enthaelt Founder-Reset-Procedure + Manuell-Approval-Trigger-Pattern.
- **AC-V9.1-B-9**: Live-Smoke Cron-Endpoint mit Production-CRON_SECRET evaluiert Production-email_bulk_run-Rows korrekt (gemessen via Production-DB-Snapshot vorher/nachher).
- **AC-V9.1-B-10**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Notable Risks / Dependencies

- **R1 (Cost-Cap-Werte ENV-Drift)**: Coolify-ENVs `V91_BULK_EMAIL_DAILY_CAP_EUR` + `V91_BULK_EMAIL_MONTHLY_CAP_EUR` + `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR` muessen gesetzt sein (sonst Default-Werte 5/100/0.5). Mitigation: SLC-V9.1-A MT-7 setzt diese ENVs schon, ENV-Pruefung in MT-2 Cron-Handler ergaenzen.
- **R2 (Estimate-Drift vs Real-Cost)**: `estimatePatternExtractionCost` basiert auf DEC-179-V9-Schaetzung (~5 EUR Sonnet/1000 Emails). Real-Cost kann variieren je nach Email-Laenge + Sonnet-Output-Token-Count. Mitigation: +20% Safety-Buffer im Estimate, MT-0 Skeleton-Validation in SLC-V9.1-A Per-Email-Cost-Telemetry zeigt Real-Drift.
- **R3 (Cron-Frequency-Tradeoff)**: Stuendliche Frequenz = 24x/Tag. Bei 10 Tenants = 240 Cron-Calls/Tag. Sehr leicht, kein Performance-Risiko. Bei groesserem Volumen V9.1.x koennte Frequenz auf 30min reduziert werden.
- **R4 (Daily-Roll-Over-Edge-Case)**: Run aus 23:59 UTC mit email_count=5 wird um 00:01 UTC als Daily-Roll-Over getriggert mit nur 5 Emails -> kleine Pattern-Extraktion-Run. Mitigation: Akzeptabel, Cost minimal.
- **R5 (Per-Email-Approval-UX-Friction)**: Per-Email-Approval > 0.50 EUR triggert bei seltenen Outlier-Mega-Runs. Bei ueblichen Continuous-Stream-Volumen (5-30 Emails/Tag) selten relevant. Mitigation: ENV-Override per Tenant ist V9.1.x Carry-Over.
- **R6 (Founder-Reset-Procedure-Manual)**: Manuelles UPDATE `status='paused' -> 'continuous'` via psql ist Operations-Risiko. Mitigation: RUNBOOK dokumentiert, SLC-V9.1-D Admin-Audit-UI koennte Button bekommen (Out-of-Scope V9.1 Initial).
- **D1**: Hard-Dependency auf SLC-V9.1-A DONE (`email_bulk_run.status='continuous'` + `inbound_source='forward_bucket'` Spalten + `email_inbound_endpoint`-FK).
- **D2**: Hard-Dependency auf V9.0 `vw_bulk_email_cost_daily` + `vw_bulk_email_cost_monthly` (DEC-182).
- **D3**: Hard-Dependency auf V9.0 `email_bulk_parse`-Worker.
- **D4**: Coolify-Scheduled-Task-Eintrag Pre-Cond fuer Live-Smoke (Founder-Setup ~5 Min).

## Worktree

- **Branch**: `v9-1-forward-bucket-email`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v91`
- **Cumulative**: weiterhin im V9.1-Worktree, kein Master-Merge nach SLC-V9.1-B

## Next After SLC-V9.1-B

**SLC-V9.1-C — Storage-Retention-Cron (FEAT-078)**. Daily-Coolify-Task mit Soft-Delete + Hard-Delete + Idempotency-Check vs knowledge_unit-Referenzen. Reihenfolge fix per ARCHITECTURE.md V9.1 Slice-Empfehlung.
