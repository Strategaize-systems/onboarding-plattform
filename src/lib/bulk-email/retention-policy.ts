// V9.1 SLC-V9.1-C MT-1 — Retention-Policy (FEAT-078).
//
// Pure-Function: liest Soft/Hard-Delete-Schwellen (in Tagen) aus ENV mit Defaults
// 60/90 (DEC-198 90-Tage-Retention, DEC-199 Soft-vor-Hard). softDeleteDays muss
// strikt kleiner als hardDeleteDays sein, sonst wuerde die Hard-Delete-Phase Rows
// erfassen, die noch nicht soft-deleted sind.
//
// Run-Level (vgl. retention-idempotency.ts Header): die Retention-Spalten
// (retention_until, soft_delete_at) leben auf email_bulk_run; email_message
// haengt per FK ON DELETE CASCADE dran (MIG-058). Die Schwellen werden gegen
// email_bulk_run.created_at gerechnet.

export interface RetentionPolicy {
  softDeleteDays: number;
  hardDeleteDays: number;
}

export const DEFAULT_SOFT_DELETE_DAYS = 60;
export const DEFAULT_HARD_DELETE_DAYS = 90;

/**
 * Resolved Retention-Policy aus ENV `V91_RETENTION_SOFT_DELETE_DAYS` +
 * `V91_RETENTION_HARD_DELETE_DAYS`, Defaults 60/90. Nicht-numerische oder
 * nicht-positive Werte fallen auf den jeweiligen Default zurueck. Wirft, wenn
 * softDeleteDays >= hardDeleteDays (invalide Policy).
 */
export function getRetentionPolicy(
  env: Record<string, string | undefined> = process.env,
): RetentionPolicy {
  const softDeleteDays = parsePositiveInt(
    env.V91_RETENTION_SOFT_DELETE_DAYS,
    DEFAULT_SOFT_DELETE_DAYS,
  );
  const hardDeleteDays = parsePositiveInt(
    env.V91_RETENTION_HARD_DELETE_DAYS,
    DEFAULT_HARD_DELETE_DAYS,
  );

  if (softDeleteDays >= hardDeleteDays) {
    throw new Error(
      `Invalid retention policy: softDeleteDays (${softDeleteDays}) must be < ` +
        `hardDeleteDays (${hardDeleteDays}).`,
    );
  }

  return { softDeleteDays, hardDeleteDays };
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
