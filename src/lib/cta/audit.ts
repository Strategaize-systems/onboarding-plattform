// V8.1 SLC-163 MT-6 — error_log Audit-Wrappers fuer Strategaize-Freigabe-CTA.
//
// Pattern-Reuse aus src/lib/llm/v8-1-augmentation/audit.ts (SLC-161 MT-5).
// Fehler beim Audit-INSERT sind nicht-fatal — captureException via Logger und
// Fortfahren, damit Hot-Path (CTA-Klick) nicht durch Audit-Probleme abgebrochen
// wird. logger wird lazy importiert (Test-Bootstrap-Safety per
// feedback_vitest_split_pure_logic_from_db_adapter).

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * error_log.source-Wert fuer erfolgreichen CTA-Klick (Magic-Link oder
 * Web-Action). Founder-Audit-Sichtbarkeit via
 * SELECT * FROM error_log WHERE source = 'cta_strategaize_freigabe'.
 */
export const V8_1_CTA_TRIGGER_SOURCE = "cta_strategaize_freigabe" as const;

/** error_log.source-Wert fuer abgelehnten Magic-Link (Tampered/Expired/Malformed). */
export const V8_1_CTA_INVALID_TOKEN_SOURCE = "cta_invalid_token" as const;

/** error_log.source-Wert fuer idempotenten 2. Klick (Flag bereits true). */
export const V8_1_CTA_IDEMPOTENT_SKIP_SOURCE = "cta_idempotent_skip" as const;

/** error_log.source-Wert fuer StB-Notification-Skip wegen leerem contact_email. */
export const V8_1_STB_SKIPPED_NO_EMAIL_SOURCE =
  "stb_notification_skipped_no_email" as const;

export type CtaTriggerSource = "pdf_magic_link" | "web_action";

export interface RecordCtaTriggerParams {
  captureSessionId: string;
  source: CtaTriggerSource;
  bdSent: boolean;
  stbSent: boolean;
  stbSkipReason?: "no_email" | "smtp_fail";
}

export interface RecordCtaInvalidTokenParams {
  tokenExcerpt: string;
  reason: "invalid_signature" | "expired" | "malformed";
}

export interface RecordCtaIdempotentSkipParams {
  captureSessionId: string;
  source: CtaTriggerSource;
}

export interface RecordStbNotificationSkippedNoEmailParams {
  captureSessionId: string;
  partnerOrganizationId: string;
}

async function logAuditError(
  error: Error,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "v8-1-cta-audit", metadata });
  } catch {
    // Fallback: logger nicht verfuegbar (Test-Umgebung). Audit-Fehler silent.
  }
}

export async function recordCtaTrigger(
  client: SupabaseClient,
  params: RecordCtaTriggerParams,
): Promise<void> {
  const { error } = await client.from("error_log").insert({
    level: "info",
    source: V8_1_CTA_TRIGGER_SOURCE,
    message: `V8.1 CTA triggered for session ${params.captureSessionId} via ${params.source} (bd=${params.bdSent}, stb=${params.stbSent}${
      params.stbSkipReason ? `, stb_skip=${params.stbSkipReason}` : ""
    })`,
    metadata: {
      capture_session_id: params.captureSessionId,
      trigger_source: params.source,
      bd_sent: params.bdSent,
      stb_sent: params.stbSent,
      stb_skip_reason: params.stbSkipReason ?? null,
    },
  });
  if (error) {
    await logAuditError(
      new Error(`Failed v8.1 error_log INSERT (cta_trigger): ${error.message}`),
      { captureSessionId: params.captureSessionId, source: params.source },
    );
  }
}

export async function recordCtaInvalidToken(
  client: SupabaseClient,
  params: RecordCtaInvalidTokenParams,
): Promise<void> {
  const truncated = params.tokenExcerpt.slice(0, 64);
  const { error } = await client.from("error_log").insert({
    level: "warn",
    source: V8_1_CTA_INVALID_TOKEN_SOURCE,
    message: `V8.1 CTA invalid magic-link token (reason=${params.reason})`,
    metadata: {
      token_excerpt: truncated,
      reason: params.reason,
    },
  });
  if (error) {
    await logAuditError(
      new Error(
        `Failed v8.1 error_log INSERT (cta_invalid_token): ${error.message}`,
      ),
      { reason: params.reason },
    );
  }
}

export async function recordCtaIdempotentSkip(
  client: SupabaseClient,
  params: RecordCtaIdempotentSkipParams,
): Promise<void> {
  const { error } = await client.from("error_log").insert({
    level: "info",
    source: V8_1_CTA_IDEMPOTENT_SKIP_SOURCE,
    message: `V8.1 CTA idempotent skip for session ${params.captureSessionId} via ${params.source} (flag already true)`,
    metadata: {
      capture_session_id: params.captureSessionId,
      trigger_source: params.source,
    },
  });
  if (error) {
    await logAuditError(
      new Error(
        `Failed v8.1 error_log INSERT (cta_idempotent_skip): ${error.message}`,
      ),
      { captureSessionId: params.captureSessionId, source: params.source },
    );
  }
}

export async function recordStbNotificationSkippedNoEmail(
  client: SupabaseClient,
  params: RecordStbNotificationSkippedNoEmailParams,
): Promise<void> {
  const { error } = await client.from("error_log").insert({
    level: "info",
    source: V8_1_STB_SKIPPED_NO_EMAIL_SOURCE,
    message: `V8.1 StB-Notification skipped for session ${params.captureSessionId} — partner.contact_email empty`,
    metadata: {
      capture_session_id: params.captureSessionId,
      partner_organization_id: params.partnerOrganizationId,
    },
  });
  if (error) {
    await logAuditError(
      new Error(
        `Failed v8.1 error_log INSERT (stb_skipped_no_email): ${error.message}`,
      ),
      {
        captureSessionId: params.captureSessionId,
        partnerOrganizationId: params.partnerOrganizationId,
      },
    );
  }
}
