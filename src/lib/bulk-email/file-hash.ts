// SLC-165 MT-3: deterministic SHA256 file-hash for bulk-email duplicate detection.
// Backs the UNIQUE(tenant_id, file_hash) constraint on email_bulk_run (MIG-051).

import { createHash } from "node:crypto";

/**
 * Compute the SHA-256 hex digest of an uploaded bulk-email file.
 *
 * Used to short-circuit re-uploads of the same .mbox/.eml content per tenant
 * (`SELECT email_bulk_run WHERE tenant_id = $1 AND file_hash = $2`).
 *
 * Determinism guarantee: the same bytes always produce the same 64-char hex
 * digest, regardless of how the buffer was constructed.
 */
export function computeFileHash(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}
