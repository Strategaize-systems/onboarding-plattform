// V9.1 SLC-V9.1-A MT-4 — Raw-EML Storage-Persist (Service-Role).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 13)
//
// Schreibt die Original-EML in den bestehenden `bulk-email`-Bucket unter
//   <tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml
// (Pfad relativ zum Bucket — V9-Konvention, tenant-prefixed fuer Defense-in-Depth).
//
// Pattern-Quelle: src/workers/bulk-email/handle-parse-job.ts (admin.storage.from('bulk-email')).

import type { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const STORAGE_BUCKET = "bulk-email";

/** Macht eine Message-ID pfadsicher (entfernt <>, ersetzt Sonderzeichen). */
function sanitizeMessageId(messageId: string): string {
  const cleaned = messageId
    .replace(/[<>]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
  return cleaned.length > 0 ? cleaned : "message";
}

/**
 * Baut den Storage-Pfad fuer eine Inbound-EML.
 * `dateIso` muss YYYY-MM-DD sein (Daily-Roll-Over-Anchor).
 */
export function buildRawStoragePath(
  tenantId: string,
  endpointId: string,
  dateIso: string,
  messageId: string,
): string {
  return `${tenantId}/forward-bucket/${endpointId}/${dateIso}/${sanitizeMessageId(messageId)}.eml`;
}

/** Schreibt die Raw-EML via service_role in den bulk-email-Bucket (upsert). */
export async function persistRawEml(
  admin: AdminClient,
  path: string,
  rawEml: Buffer,
): Promise<void> {
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, rawEml, {
    contentType: "message/rfc822",
    upsert: true,
  });
  if (error) {
    throw new Error(
      `email_inbound: storage upload failed for ${path}: ${error.message}`,
    );
  }
}
