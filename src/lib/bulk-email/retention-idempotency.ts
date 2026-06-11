// V9.1 SLC-V9.1-C MT-1 — Idempotency-Check vs knowledge_unit (FEAT-078).
//
// Run-Level Verknuepfung (Resolution gegen as-built MIG-058 + handbook-import.ts):
// Der Handbook-Import schreibt KEINE email_message_id in knowledge_unit.metadata.
// `src/lib/bulk-email/handbook-import.ts` setzt
//   source   = 'email_bulk'
//   metadata = { source_type: 'email_bulk', bulk_run_id, pattern_id }
// Ein Pattern aggregiert N Emails eines Runs — die Import-Verknuepfung ist also
// run-granular, nicht message-granular. Die Retention-Sweep prueft daher pro
// email_bulk_run, ob mindestens EIN Pattern dieses Runs ins Handbuch importiert
// wurde. Falls ja, bleibt der gesamte Run (inkl. email_message-Rows) persistiert,
// auch ueber die Hard-Delete-Schwelle hinaus (R2 / AC-V9.1-C-4).

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True, wenn mindestens eine knowledge_unit-Row aus diesem email_bulk_run ins
 * Handbuch importiert wurde (1 SQL-Roundtrip, LIMIT 1). Wirft bei DB-Fehler.
 */
export async function isRunImportedToHandbook(
  admin: SupabaseClient,
  bulkRunId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("knowledge_unit")
    .select("id")
    .eq("source", "email_bulk")
    .eq("metadata->>bulk_run_id", bulkRunId)
    .limit(1);

  if (error) {
    throw new Error(
      `isRunImportedToHandbook: knowledge_unit SELECT failed for ` +
        `${bulkRunId}: ${error.message}`,
    );
  }

  return (data?.length ?? 0) > 0;
}
