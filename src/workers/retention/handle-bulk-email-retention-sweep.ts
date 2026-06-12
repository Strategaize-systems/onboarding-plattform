// V9.1 SLC-V9.1-C MT-2 — Storage-Retention-Sweep-Worker (FEAT-078).
//
// Slice:  slices/SLC-V9.1-C-storage-retention-cron.md (MT-2)
// DECs:   DEC-198 (90-Tage-Retention), DEC-199 (Soft-vor-Hard).
//
// RUN-LEVEL Resolution (Founder-Entscheid 2026-06-11, Option B):
// Die Slice-Spec + ARCHITECTURE Flow D beschrieben message-level-Retention
// (email_message.deleted_at / .retention_until) — diese Spalten existieren NICHT.
// As-built (MIG-058 / SLC-V9.1-A) traegt retention_until + soft_delete_at auf
// email_bulk_run; email_message haengt per FK ON DELETE CASCADE dran. Der Sweep
// arbeitet daher run-granular:
//   - Soft-Delete: email_bulk_run.soft_delete_at = now() ab created_at + softDays
//   - Hard-Delete: Run past created_at + hardDays UND soft_delete_at gesetzt
//                  -> Idempotency-Check (knowledge_unit via bulk_run_id)
//                  -> Storage-Objekte aller email_message loeschen
//                  -> DELETE email_bulk_run (CASCADE entfernt email_message-Rows)
// Cascade-Safety (AC-V9.1-C-5): ein Run wird nur als Ganzes geloescht; ein Run
// mit importiertem Pattern bleibt komplett erhalten (AC-V9.1-C-4 / R2).
//
// Audit (AC-V9.1-C-6): OP hat KEINE audit_log-Tabelle (vgl. pipeline-trigger.ts).
// Der Sweep schreibt einen deterministischen, awaited error_log-Eintrag
// (level='info', message='email_retention_sweep_run', metadata=Counts+Policy).

import type { SupabaseClient } from "@supabase/supabase-js";

import { captureInfo } from "@/lib/logger";
import {
  getRetentionPolicy,
  type RetentionPolicy,
} from "@/lib/bulk-email/retention-policy";
import { isRunImportedToHandbook } from "@/lib/bulk-email/retention-idempotency";
import { deleteStorageObject } from "@/lib/bulk-email/storage-delete";

export const LOG_SOURCE = "cron:bulk-email-retention-sweep";
export const AUDIT_EVENT_TYPE = "email_retention_sweep_run";

export interface RetentionSweepSummary {
  /** Wie viele Hard-Delete-Kandidaten (past hardDays + soft-deleted) evaluiert wurden. */
  runs_evaluated: number;
  /** Runs, die in dieser Iteration soft-deleted wurden (soft_delete_at gesetzt). */
  soft_deleted_runs: number;
  /** Runs, die hart geloescht wurden (Storage + Row inkl. Cascade-Messages). */
  hard_deleted_runs: number;
  /** Runs, die wegen Handbook-Import uebersprungen wurden (Row bleibt). */
  skipped_imported: number;
  /** Einzelne Storage-Objekte, die erfolgreich geloescht wurden. */
  deleted_storage_objects: number;
  /** Storage-Delete-Fehler (Run wird dann behalten, naechster Sweep retry). */
  storage_errors: number;
  /** Run-Laufzeit in Millisekunden. */
  duration_ms: number;
}

export interface HardDeletableRun {
  id: string;
  tenant_id: string;
}

export interface RetentionAuditEntry {
  runs_evaluated: number;
  soft_deleted_runs: number;
  hard_deleted_runs: number;
  skipped_imported: number;
  deleted_storage_objects: number;
  storage_errors: number;
  policy: RetentionPolicy;
  duration_ms: number;
}

/**
 * Daten-Zugriff fuer den Sweep — kapselt die SQL/Storage-Roundtrips, damit die
 * Orchestrierung (runRetentionSweep) hermetisch testbar bleibt (analog
 * ContinuousCapStore in SLC-V9.1-B). Produktiv via
 * createRetentionStoreFromSupabase(admin).
 */
export interface RetentionStore {
  /** Soft-Delete aller Runs mit created_at < softCutoff und soft_delete_at IS NULL. Returnt Count. */
  softDeleteExpiredRuns(softCutoffIso: string): Promise<number>;
  /** Runs mit created_at < hardCutoff UND soft_delete_at IS NOT NULL. */
  selectHardDeletableRuns(hardCutoffIso: string): Promise<HardDeletableRun[]>;
  /** True, wenn min. ein Pattern dieses Runs ins Handbuch importiert wurde. */
  isRunImported(bulkRunId: string): Promise<boolean>;
  /** Nicht-NULL raw_storage_path aller email_message dieses Runs. */
  selectRunStoragePaths(bulkRunId: string): Promise<string[]>;
  /** Loescht ein Storage-Objekt (idempotent bei Not-Found, wirft bei echtem Fehler). */
  deleteStorageObject(path: string): Promise<void>;
  /** DELETE email_bulk_run (CASCADE entfernt email_message-Rows). */
  deleteRun(bulkRunId: string): Promise<void>;
  /** Deterministischer Audit-Eintrag (error_log). */
  writeAudit(entry: RetentionAuditEntry): Promise<void>;
}

export interface RetentionSweepDeps {
  store: RetentionStore;
  /** Default: getRetentionPolicy() aus ENV. */
  policy?: RetentionPolicy;
  /** Default: aktueller Zeitpunkt. Injectable fuer Cutoff-Tests. */
  now?: Date;
}

/** ISO-Timestamp von `now` minus `days` Tagen. */
function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Fuehrt einen Retention-Sweep durch: Soft-Delete-Phase (UPDATE) + Hard-Delete-
 * Phase (Idempotency-Check -> Storage-Delete -> Run-DELETE) + Audit. Idempotent:
 * mehrfache Laeufe sind safe (soft_delete_at IS NULL-Guard, importierte Runs
 * bleiben, Storage-Delete ist not-found-tolerant).
 */
export async function runRetentionSweep(
  deps: RetentionSweepDeps,
): Promise<RetentionSweepSummary> {
  const { store } = deps;
  const policy = deps.policy ?? getRetentionPolicy();
  const now = deps.now ?? new Date();
  const startedAt = Date.now();

  const summary: RetentionSweepSummary = {
    runs_evaluated: 0,
    soft_deleted_runs: 0,
    hard_deleted_runs: 0,
    skipped_imported: 0,
    deleted_storage_objects: 0,
    storage_errors: 0,
    duration_ms: 0,
  };

  // ── Phase 1: Soft-Delete ──────────────────────────────────────────────────
  summary.soft_deleted_runs = await store.softDeleteExpiredRuns(
    cutoffIso(now, policy.softDeleteDays),
  );

  // ── Phase 2: Hard-Delete ──────────────────────────────────────────────────
  const hardRuns = await store.selectHardDeletableRuns(
    cutoffIso(now, policy.hardDeleteDays),
  );
  summary.runs_evaluated = hardRuns.length;

  for (const run of hardRuns) {
    if (await store.isRunImported(run.id)) {
      // R2 / AC-V9.1-C-4: importierter Run bleibt komplett erhalten.
      summary.skipped_imported += 1;
      continue;
    }

    const paths = await store.selectRunStoragePaths(run.id);
    let runStorageError = false;
    for (const path of paths) {
      try {
        await store.deleteStorageObject(path);
        summary.deleted_storage_objects += 1;
      } catch {
        // R3: Storage-Fehler -> Run behalten, naechster Sweep versucht erneut.
        summary.storage_errors += 1;
        runStorageError = true;
      }
    }

    if (runStorageError) {
      // Run NICHT loeschen, solange Storage-Objekte nicht weg sind (kein Orphan).
      continue;
    }

    await store.deleteRun(run.id);
    summary.hard_deleted_runs += 1;
  }

  summary.duration_ms = Date.now() - startedAt;

  // ── Audit (deterministisch, awaited) ──────────────────────────────────────
  await store.writeAudit({
    runs_evaluated: summary.runs_evaluated,
    soft_deleted_runs: summary.soft_deleted_runs,
    hard_deleted_runs: summary.hard_deleted_runs,
    skipped_imported: summary.skipped_imported,
    deleted_storage_objects: summary.deleted_storage_objects,
    storage_errors: summary.storage_errors,
    policy,
    duration_ms: summary.duration_ms,
  });

  // Container-Log (fire-and-forget, dupliziert den Audit-Eintrag fuer Coolify).
  captureInfo("retention-sweep run", {
    source: LOG_SOURCE,
    metadata: { category: AUDIT_EVENT_TYPE, ...summary, policy },
  });

  return summary;
}

/**
 * Produktiver Store auf Basis des Service-Role-Clients. Haelt die gesamte
 * SQL/Storage-Logik; durch das Live-/Coolify-DB-Integration-Test (skip-guarded)
 * verifiziert.
 */
export function createRetentionStoreFromSupabase(
  admin: SupabaseClient,
): RetentionStore {
  return {
    async softDeleteExpiredRuns(softCutoffIso) {
      const { data, error } = await admin
        .from("email_bulk_run")
        .update({
          soft_delete_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .lt("created_at", softCutoffIso)
        .is("soft_delete_at", null)
        .select("id");
      if (error) {
        throw new Error(
          `retention-sweep: soft-delete UPDATE failed: ${error.message}`,
        );
      }
      return data?.length ?? 0;
    },

    async selectHardDeletableRuns(hardCutoffIso) {
      const { data, error } = await admin
        .from("email_bulk_run")
        .select("id, tenant_id")
        .lt("created_at", hardCutoffIso)
        .not("soft_delete_at", "is", null);
      if (error) {
        throw new Error(
          `retention-sweep: hard-deletable SELECT failed: ${error.message}`,
        );
      }
      return (data ?? []) as HardDeletableRun[];
    },

    isRunImported(bulkRunId) {
      return isRunImportedToHandbook(admin, bulkRunId);
    },

    async selectRunStoragePaths(bulkRunId) {
      const { data, error } = await admin
        .from("email_message")
        .select("raw_storage_path")
        .eq("bulk_run_id", bulkRunId)
        .not("raw_storage_path", "is", null);
      if (error) {
        throw new Error(
          `retention-sweep: storage-path SELECT failed for ${bulkRunId}: ${error.message}`,
        );
      }
      return (data ?? [])
        .map((r) => (r as { raw_storage_path: string | null }).raw_storage_path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);
    },

    deleteStorageObject(path) {
      return deleteStorageObject(admin, path);
    },

    async deleteRun(bulkRunId) {
      const { error } = await admin
        .from("email_bulk_run")
        .delete()
        .eq("id", bulkRunId);
      if (error) {
        throw new Error(
          `retention-sweep: run DELETE failed for ${bulkRunId}: ${error.message}`,
        );
      }
    },

    async writeAudit(entry) {
      const { error } = await admin.from("error_log").insert({
        level: "info",
        source: LOG_SOURCE,
        message: AUDIT_EVENT_TYPE,
        metadata: entry,
      });
      if (error) {
        throw new Error(
          `retention-sweep: audit error_log INSERT failed: ${error.message}`,
        );
      }
    },
  };
}
