// V9.1 SLC-V9.1-A MT-4 — email_validation_reject_log Insert-Helper.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4)
//
// Best-effort Audit-Trail aller Reject-Pfade (HMAC bis Allowlist). Ein Fehler beim
// reject_log-INSERT darf die Webhook-Response NICHT blockieren — daher swallow+log.

import { captureWarning } from "../logger";
import type { createAdminClient } from "../supabase/admin";
import type { RejectReason } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RejectLogInput {
  rejectLayer: RejectReason;
  tenantId?: string | null;
  endpointId?: string | null;
  senderDomain?: string | null;
  senderFullEmail?: string | null;
  subjectSnippet?: string | null;
  rawStoragePath?: string | null;
}

export async function insertRejectLog(
  admin: AdminClient,
  input: RejectLogInput,
): Promise<void> {
  const { error } = await admin.from("email_validation_reject_log").insert({
    tenant_id: input.tenantId ?? null,
    endpoint_id: input.endpointId ?? null,
    reject_layer: input.rejectLayer,
    sender_domain: input.senderDomain ?? null,
    sender_full_email: input.senderFullEmail ?? null,
    subject_snippet: input.subjectSnippet
      ? input.subjectSnippet.slice(0, 200)
      : null,
    raw_storage_path: input.rawStoragePath ?? null,
  });
  if (error) {
    captureWarning(
      `email_inbound: reject_log INSERT failed (${input.rejectLayer}): ${error.message}`,
      { source: "email_inbound", metadata: { rejectLayer: input.rejectLayer } },
    );
  }
}
