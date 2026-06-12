// V9.1 SLC-V9.1-C MT-1 — Storage-Object-Delete (FEAT-078).
//
// Loescht ein einzelnes Original-EML-Objekt aus dem `bulk-email`-Bucket via
// Service-Role-Client (`admin.storage.from(...).remove([path])`). Supabase
// `.remove()` ist bei fehlendem Objekt idempotent (kein Fehler) — andere Fehler
// (Permission, Timeout) werfen wir, damit die aufrufende Hard-Delete-Phase den
// Run behaelt und im naechsten Sweep-Lauf erneut versucht (R3-Mitigation).

import type { SupabaseClient } from "@supabase/supabase-js";

export const BULK_EMAIL_BUCKET = "bulk-email";

/**
 * Loescht das Storage-Objekt unter `path` aus dem `bulk-email`-Bucket.
 * Object-Not-Found ist silent-OK (idempotent). Echte Fehler werfen.
 */
export async function deleteStorageObject(
  admin: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await admin.storage.from(BULK_EMAIL_BUCKET).remove([path]);
  if (error) {
    throw new Error(
      `deleteStorageObject: remove('${path}') failed: ${error.message}`,
    );
  }
}
