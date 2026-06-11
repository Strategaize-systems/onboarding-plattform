# SLC-V9.1-C — Storage-Retention-Cron (FEAT-078)

**Version:** V9.1
**Feature:** FEAT-078 (Storage-Retention-Cron: 60d Soft-Delete + 90d Hard-Delete + Idempotency vs knowledge_unit)
**Backlog:** BL-157
**Status:** planned
**Created:** 2026-06-09
**Priority:** High
**Estimate:** ~3-4 MTs, ~2-3 Tage Code-Side
**Worktree Branch:** `v9-1-forward-bucket-email` (Cumulative-Single-Branch, fortgesetzt aus SLC-V9.1-B)

## Slice Goal

Liefert die **DSGVO-Lifecycle-Schicht** fuer V9.1:

1. **Storage-Retention-Cron-Worker**: Daily Coolify-Scheduled-Task `02:00 UTC` ruft `/api/cron/bulk-email-retention-sweep`, fuehrt 2-Phasen-Loesch durch (Soft-Delete + Hard-Delete) per DEC-198.
2. **Soft-Delete-Phase (60d)**: UPDATE `email_message SET deleted_at=now() WHERE retention_until-30d < now() AND deleted_at IS NULL` symmetrisch fuer `email_bulk_run`. Bedeutung: Row bleibt sichtbar fuer Reverse-Window (30 Tage Erholungspuffer), aber `deleted_at IS NOT NULL`-Filter blockt Default-Reads.
3. **Hard-Delete-Phase (90d)**: SELECT `email_message WHERE retention_until < now() AND deleted_at IS NOT NULL` -> Idempotency-Check vs `knowledge_unit.source='email_bulk' AND metadata->>'email_message_id'` -> bei Pass: DELETE Storage-Object + DELETE Row, bei Imported-Skip: log + behalt Row (auch ueber 90d).
4. **Audit-Trail**: INSERT `audit_log (event_type='email_retention_sweep_run', payload={soft_deleted_messages, soft_deleted_runs, hard_deleted_messages, hard_deleted_runs, skipped_imported})`.

Output: DSGVO-Loesch-Compliance fuer Forward-Bucket-Raw-Emails. Fertig fuer SLC-V9.1-D Setup-UI + Admin-Audit-Erweiterung.

> **⚠ RUN-LEVEL RESOLUTION (DEC-208, 2026-06-11) — supersedes der message-level Prosa unten.**
> Beim /backend-Pattern-Inspect zeigte sich: die as-built Foundation MIG-058 (SLC-V9.1-A) traegt `retention_until` + `soft_delete_at` AUSSCHLIESSLICH auf `email_bulk_run` — `email_message` hat KEIN `deleted_at`/`retention_until` (nur `raw_storage_path`+`received_at`), haengt aber per FK `ON DELETE CASCADE` am Run. `knowledge_unit` verknuepft per `metadata->>bulk_run_id` (kein `email_message_id`). OP hat kein `audit_log` (Audit via `error_log`). Der Sweep arbeitet daher **run-granular**: Soft/Hard-Delete auf `email_bulk_run` (Schwellen gegen `created_at`), Idempotency-Check pro Run, Storage-Delete je `email_message.raw_storage_path`, dann `DELETE email_bulk_run` (Cascade entfernt die Messages). Wo der MT-2/AC-Text unten `email_message.deleted_at` / `email_message_id` / `audit_log` sagt, gilt die korrigierte Run-Level-Variante (siehe DEC-208 + ARCHITECTURE Flow D). Implementierung: `src/workers/retention/handle-bulk-email-retention-sweep.ts`. KEIN neues Migration.

## In Scope

- **`src/workers/retention/handle-bulk-email-retention-sweep.ts`** — Worker-Implementation per ARCHITECTURE.md V9.1 Flow D.
- **`src/workers/retention/__tests__/handle-bulk-email-retention-sweep.test.ts`** — Vitest gegen Coolify-DB: Soft-Delete, Hard-Delete, Imported-Skip, Cross-Tenant-RLS.
- **`src/app/api/cron/bulk-email-retention-sweep/route.ts`** — Cron-Endpoint mit `verifyCronSecret`-Pattern + Trigger des Workers.
- **`src/app/api/cron/bulk-email-retention-sweep/__tests__/route.test.ts`** — Vitest fuer CRON_SECRET-Auth + Worker-Trigger.
- **`src/lib/bulk-email/retention-policy.ts`** — Pure-Function `getRetentionPolicy(): { softDeleteDays, hardDeleteDays }` liest ENVs `V91_RETENTION_SOFT_DELETE_DAYS` + `V91_RETENTION_HARD_DELETE_DAYS` mit Defaults 60/90.
- **`src/lib/bulk-email/retention-idempotency.ts`** — Helper `isImportedToHandbook(emailMessageId): Promise<boolean>` -> SELECT knowledge_unit WHERE source='email_bulk' AND metadata->>'email_message_id' = $1 LIMIT 1.
- **`src/lib/bulk-email/storage-delete.ts`** — Helper `deleteStorageObject(path: string)` mit Service-Role-Client.
- **`src/lib/bulk-email/__tests__/retention-policy.test.ts`** + **`retention-idempotency.test.ts`** + **`storage-delete.test.ts`** — Vitest.
- **Coolify-Scheduled-Task-Eintrag** (Dokumentation in `docs/RUNBOOK.md` Erweiterung): tagliche Frequenz `0 2 * * *` POST an `/api/cron/bulk-email-retention-sweep` mit CRON_SECRET-Header.
- **`docs/RUNBOOK.md`** Erweiterung Section "V9.1 Storage-Retention-Cron" mit Per-Tenant-Override-Procedure (`SET LOCAL` ENV via Tenant-Settings JSONB-Read deferred V9.1.x — Founder-Manuell-Override via Direct-UPDATE auf email_message.retention_until + audit_log Entry).
- **`docs/MIGRATIONS.md`** Update: MIG-058 Retention-Spalten-Apply bestaetigt + Backfill-Confirmation (`UPDATE email_bulk_run SET retention_until = created_at + 90d WHERE retention_until IS NULL` lief idempotent).

## Out of Scope

- **Per-Tenant-Cost-Cap-Override via Tenant-Settings JSONB** — V9.1.x
- **Setup-UI + Admin-Audit-Erweiterung Forward-Source-Statistik** — SLC-V9.1-D
- **Auto-Restore aus Soft-Delete via UI** (Founder muss Manuell-UPDATE machen) — V9.2+
- **Storage-Quota-Enforcement Pre-Upload-Check** — V9.2+
- **Eigene Bayesian-Spam-Heuristik** — V9.2+

## Pre-Conditions

- ✓ SLC-V9.1-A DONE (MIG-058 hat `retention_until` + `deleted_at` Spalten LIVE)
- ✓ SLC-V9.1-B DONE (Cron-Pattern + verifyCronSecret aktiv)
- ✓ knowledge_unit.metadata JSONB ist v4-Foundation-Pflichtfeld mit `'{}'` default (per V9.0 SLC-168 RPT-Confirmation)
- ⏳ Coolify-Scheduled-Task-Eintrag fuer `/api/cron/bulk-email-retention-sweep` (PFLICHT vor MT-3 Live-Smoke — Founder-Setup ~5 Min)

## Micro-Tasks

### MT-1: Retention-Policy + Idempotency-Helper + Storage-Delete
- **Goal**: 3 Pure-Function-Helper mit Vitest-Coverage.
- **Files**:
  - `src/lib/bulk-email/retention-policy.ts` (NEU)
  - `src/lib/bulk-email/retention-idempotency.ts` (NEU)
  - `src/lib/bulk-email/storage-delete.ts` (NEU)
  - `src/lib/bulk-email/__tests__/retention-policy.test.ts` (NEU)
  - `src/lib/bulk-email/__tests__/retention-idempotency.test.ts` (NEU)
  - `src/lib/bulk-email/__tests__/storage-delete.test.ts` (NEU)
- **Expected behavior**:
  - `getRetentionPolicy()` returnt `{ softDeleteDays: parseInt(V91_RETENTION_SOFT_DELETE_DAYS ?? '60'), hardDeleteDays: parseInt(V91_RETENTION_HARD_DELETE_DAYS ?? '90') }`. Pruefung `softDeleteDays < hardDeleteDays` (Throw bei Invalid).
  - `isImportedToHandbook(emailMessageId): Promise<boolean>` macht 1 SQL-Roundtrip: `SELECT 1 FROM knowledge_unit WHERE source='email_bulk' AND metadata->>'email_message_id' = $1 LIMIT 1`. Returnt `true` bei min. 1 Row, `false` sonst.
  - `deleteStorageObject(path: string): Promise<void>` ruft Supabase Storage-API `bucket('bulk-email').remove([path])`. Bei Object-Not-Found: silent-OK (idempotent).
- **Verification**: Vitest GREEN:
  - getRetentionPolicy mit ENVs 60/90 -> { 60, 90 }
  - getRetentionPolicy ohne ENVs -> Defaults
  - getRetentionPolicy mit invalid 90/60 -> Throw
  - isImportedToHandbook mit existierender KU-Row -> true
  - isImportedToHandbook ohne Match -> false
  - deleteStorageObject mit Mock-Storage-Client: 1 Call zu .remove(), kein Throw bei Not-Found
- **Dependencies**: SLC-V9.1-B DONE

### MT-2: Retention-Sweep-Worker
- **Goal**: `handle-bulk-email-retention-sweep.ts` Worker mit 2-Phasen-Loesch + Idempotency-Check + audit_log.
- **Files**:
  - `src/workers/retention/handle-bulk-email-retention-sweep.ts` (NEU)
  - `src/workers/retention/__tests__/handle-bulk-email-retention-sweep.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Worker-Schritt-Reihenfolge per ARCHITECTURE.md V9.1 Flow D:
    1. `getRetentionPolicy()` -> {softDays, hardDays}
    2. Soft-Delete-Phase email_message:
       - `UPDATE email_message SET deleted_at=now() WHERE created_at < now() - INTERVAL '${softDays} days' AND deleted_at IS NULL RETURNING id`
       - Count: softDeletedMessages
    3. Soft-Delete-Phase email_bulk_run:
       - `UPDATE email_bulk_run SET deleted_at=now() WHERE inbound_source='forward_bucket' AND created_at < now() - INTERVAL '${softDays} days' AND deleted_at IS NULL RETURNING id`
       - Count: softDeletedRuns
    4. Hard-Delete-Phase email_message:
       - `SELECT id, raw_storage_path FROM email_message WHERE created_at < now() - INTERVAL '${hardDays} days' AND deleted_at IS NOT NULL`
       - Per Row: `isImportedToHandbook(id)` -> bei `true`: log skip + behalt Row, bei `false`: `deleteStorageObject(raw_storage_path)` + DELETE FROM email_message WHERE id=$1
       - Counts: hardDeletedMessages + skippedImported
    5. Hard-Delete-Phase email_bulk_run:
       - `SELECT id FROM email_bulk_run WHERE created_at < now() - INTERVAL '${hardDays} days' AND deleted_at IS NOT NULL`
       - Per Row: SELECT count(*) FROM email_message WHERE bulk_run_id=$1 -> bei >0 Rows: log skip (Run-Loeschung nur wenn alle email_message hard-deleted), bei 0 Rows: DELETE FROM email_bulk_run WHERE id=$1
       - Counts: hardDeletedRuns + skippedRunsWithMessages
    6. INSERT audit_log (event_type='email_retention_sweep_run', payload={softDeletedMessages, softDeletedRuns, hardDeletedMessages, hardDeletedRuns, skippedImported, skippedRunsWithMessages, policy: {softDays, hardDays}, run_duration_ms})
  - Atomic-Pattern: Soft-Delete-UPDATEs sind atomar via single-SQL-Statement. Hard-Delete-Loop iteriert pro-Row (kein Batching noetig fuer V9.1-Volumen), pro DELETE = single-Transaction.
- **Verification**: Vitest gegen Coolify-DB:
  - Seed 5 email_message: 2x created_at=heute (skip), 2x created_at=-65d (soft-delete-target), 1x created_at=-95d AND deleted_at=-30d (hard-delete-target wenn nicht imported)
  - Worker-Run: 2x softDeleted, 1x hardDeleted (oder skipped wenn imported)
  - audit_log Entry mit korrekten Counts
  - Cross-Tenant-RLS: Worker laeuft als Service-Role, sieht alle Tenants
  - Storage-Delete: deleteStorageObject wird 1x aufgerufen bei Hard-Delete
- **Dependencies**: MT-1

### MT-3: Cron-Endpoint + Live-Smoke
- **Goal**: `/api/cron/bulk-email-retention-sweep` Endpoint + Live-Smoke gegen Production-DB.
- **Files**:
  - `src/app/api/cron/bulk-email-retention-sweep/route.ts` (NEU)
  - `src/app/api/cron/bulk-email-retention-sweep/__tests__/route.test.ts` (NEU)
- **Expected behavior**:
  - Cron-Pattern (Strategaize-Standard): `verifyCronSecret` + constant-time-compare
  - Bei Fail: 401 + audit_log (event_type='cron_secret_invalid')
  - Bei Pass: Worker-Trigger (synchron, da Retention-Cron klein) oder enqueue `email_bulk_retention_sweep`-Job in ai_jobs (asynchron, per ai_jobs.job_type CHECK aus MIG-057). Empfehlung: synchron in V9.1-Initial (kein Worker-Queue-Overhead), Migration zu asynchron via Worker-Pattern in V9.2+.
  - Return: `{ runs_evaluated, softDeletedMessages, softDeletedRuns, hardDeletedMessages, hardDeletedRuns, skippedImported, duration_ms }`
- **Verification**: Vitest gegen Coolify-DB:
  - Cron mit valider CRON_SECRET + Seed-Data -> 200 + korrekte Counts in Response
  - Cron mit invalider CRON_SECRET -> 401 + audit_log
  - Live-Smoke: `curl -X POST https://onboarding.strategaizetransition.com/api/cron/bulk-email-retention-sweep -H "X-Cron-Secret: ..."` -> sieht Production-Stand, prueft 0 unerwartete Deletes (V9.1-Initial-State: 0 Rows mit created_at > 60d, deshalb 0/0/0/0 Counts erwartet)
- **Dependencies**: MT-2

### MT-4: RUNBOOK + Records-Update + Master-Merge-Prep
- **Goal**: RUNBOOK-Section + slices/INDEX, planning/backlog, features/INDEX, STATE-Updates.
- **Files**:
  - `docs/RUNBOOK.md` (UPDATE — Section "V9.1 Storage-Retention-Cron" mit Founder-Override-Procedure + Test-Trigger-Pattern)
  - `slices/INDEX.md` (UPDATE — SLC-V9.1-C `planned -> in_progress -> done`)
  - `features/INDEX.md` (UPDATE — FEAT-078 `planned -> in_progress -> done`)
  - `planning/backlog.json` (UPDATE — BL-157 `in_progress -> done`)
  - `docs/STATE.md` (UPDATE — Current Focus)
- **Expected behavior**:
  - RUNBOOK Section enthaelt:
    - Test-Trigger-Pattern: `curl -X POST .../api/cron/bulk-email-retention-sweep -H "X-Cron-Secret: ..."`
    - Founder-Override-Procedure: `UPDATE email_message SET retention_until = created_at + INTERVAL '120 days' WHERE tenant_id='...' AND id='...'` + `INSERT audit_log (event_type='email_retention_manual_override', ...)`
    - Restore-aus-Soft-Delete-Procedure: `UPDATE email_message SET deleted_at=NULL WHERE id='...'` (Founder-Manuell, Auto-Restore-UI ist V9.2+)
  - Records-Updates Cockpit-konsistent
- **Verification**: RUNBOOK Section vorhanden, alle Records-IDs CONSIST.
- **Dependencies**: MT-3

## Acceptance Criteria

- **AC-V9.1-C-1**: Cron-Endpoint `/api/cron/bulk-email-retention-sweep` mit `verifyCronSecret` validiert CRON_SECRET.
- **AC-V9.1-C-2** (run-level, DEC-208): Soft-Delete-Phase setzt `email_bulk_run.soft_delete_at = now()` fuer Runs mit `created_at < now() - softDeleteDays` UND `soft_delete_at IS NULL`.
- **AC-V9.1-C-3** (run-level, DEC-208): Hard-Delete-Phase loescht je `email_message.raw_storage_path` via `deleteStorageObject` + `DELETE FROM email_bulk_run` (CASCADE entfernt email_message) fuer Runs mit `created_at < now() - hardDeleteDays` UND `soft_delete_at IS NOT NULL` UND `isRunImportedToHandbook === false`.
- **AC-V9.1-C-4**: Idempotency-Skip bei `isRunImportedToHandbook === true` (knowledge_unit via `metadata->>bulk_run_id`): Run bleibt persistiert (auch ueber 90d), Counter `skipped_imported`.
- **AC-V9.1-C-5**: email_bulk_run Hard-Delete loescht den Run als Ganzes (Cascade entfernt alle email_message atomar); importierte Runs bleiben komplett erhalten (Cascade-Safety intrinsisch).
- **AC-V9.1-C-6**: Audit-Entry in `error_log` (level='info', message='email_retention_sweep_run', OP hat kein audit_log) enthaelt alle Counts (runs_evaluated, soft_deleted_runs, hard_deleted_runs, skipped_imported, deleted_storage_objects, storage_errors) + Policy + duration_ms.
- **AC-V9.1-C-7**: ENV `V91_RETENTION_SOFT_DELETE_DAYS` + `V91_RETENTION_HARD_DELETE_DAYS` ueberschreibbar, Defaults 60/90.
- **AC-V9.1-C-8**: Vitest gegen Coolify-DB mit Seed-Data simuliert alle 4 Phasen (skip/soft/hard/imported-skip) korrekt.
- **AC-V9.1-C-9**: Live-Smoke Cron-Endpoint mit Production-CRON_SECRET liefert 0/0/0/0/0 (V9.1-Initial-State, kein Row > 60d).
- **AC-V9.1-C-10**: RUNBOOK Section "V9.1 Storage-Retention-Cron" enthaelt Test-Trigger-Pattern + Founder-Override-Procedure + Restore-aus-Soft-Delete-Procedure.
- **AC-V9.1-C-11**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Notable Risks / Dependencies

- **R1 (DSGVO-Loesch-Anspruch-Mismatch)**: 60d Soft-Delete + 90d Hard-Delete sind Default. DSGVO erlaubt Loesch-Anspruch zu jedem Zeitpunkt -> Founder-Override-Procedure via RUNBOOK Pattern dokumentiert. V9.2+ koennte UI-getriebene Loeschung implementieren.
- **R2 (Imported-Pattern-Forever-Retention)**: Wenn email_message in knowledge_unit importiert wurde, bleibt Row forever persistiert (auch ueber 90d). Mitigation: Pattern-Discard-via-Curation-UI (V9.0 SLC-167) loescht email_pattern + knowledge_unit -> Pre-Reverse-Check vor finalem Hard-Delete: nach Pattern-Discard koennte Email-Hard-Delete in der naechsten Cron-Iteration durchlaufen.
- **R3 (Storage-Delete-Error)**: deleteStorageObject koennte bei Supabase-Storage-Timeout fehlschlagen -> DELETE FROM email_message wuerde dann Orphan-Storage-Objects hinterlassen. Mitigation: Try/Catch um Storage-Delete + Row bleibt mit deleted_at SET (in der naechsten Iteration wird Storage-Delete neu-versucht).
- **R4 (Worker-Crash mid-loop)**: Bei Worker-Crash zwischen Storage-DELETE und Row-DELETE: Storage geloescht aber Row noch da -> nicht reproduzierbar in V9.1 (Worker synchron, kein Queue). Mitigation: V9.2+ asynchroner Worker mit ai_jobs.status-Recovery.
- **R5 (Cron-Frequency-Tradeoff)**: 1x/Tag 02:00 UTC ist konservativ. Bei 100+ Tenants und vielen Daily-Roll-Over-Runs koennte Frequenz erhoeht werden. V9.1-Initial-Volumen (Founder-only Pilot): minimal.
- **R6 (Retention-Override-Drift)**: ENV `V91_RETENTION_SOFT_DELETE_DAYS` lokal vs Production-Coolify-ENV koennten driften -> Lokal-Tests koennten andere Retention-Schwellen testen als Production. Mitigation: Defaults 60/90 in `retention-policy.ts` + ENV-Drift wird in MT-4 RUNBOOK dokumentiert.
- **D1**: Hard-Dependency auf SLC-V9.1-A DONE (MIG-058 hat `retention_until` + `deleted_at` Spalten).
- **D2**: Hard-Dependency auf SLC-V9.1-B DONE (Cron-Pattern + verifyCronSecret aktiv).
- **D3**: Hard-Dependency auf V9.0 knowledge_unit.metadata JSONB (per V9.0 SLC-168).
- **D4**: Coolify-Scheduled-Task-Eintrag Pre-Cond fuer Live-Smoke (Founder-Setup ~5 Min).

## Worktree

- **Branch**: `v9-1-forward-bucket-email`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v91`
- **Cumulative**: weiterhin im V9.1-Worktree, kein Master-Merge nach SLC-V9.1-C

## Next After SLC-V9.1-C

**SLC-V9.1-D — Setup-UI Conversational-First + Admin-Audit-Erweiterung (FEAT-079)**. Conversational-First "Mit KI beschreiben"-Button + 4-Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Pflicht-Disclaimer + Test-Send-Button + Erweiterung admin/audit/bulk-email um Forward-Source-Statistik + Master-Merge `v9-1-forward-bucket-email -> main`.
