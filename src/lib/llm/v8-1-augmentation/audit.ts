// V8.1 LLM-Augmentation — Audit-Trail Wrappers
//
// Slice: SLC-161 MT-5
// Spec: slices/SLC-161-llm-augmentation-backend.md
// Migration 105: ai_cost_ledger.role akzeptiert 'v8_1_augmentation' (CHECK-Extension)
//
// Pattern-Reuse aus src/workers/condensation/light-pipeline.ts (adminClient.from(...).insert).
// Fehler beim Audit-INSERT sind nicht-fatal — captureException + Fortfahren, damit
// der Hot-Path (Render) nicht durch Logging-Probleme abgebrochen wird.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LlmCallAuditEntry,
  CacheHitAuditEntry,
  TonalityDriftAuditEntry,
} from "./types";

// Lazy-import logger to avoid pulling supabase-admin at module-load.
// Pattern aus src/lib/llm.ts updateRunMemory: `const { captureException } = await import("@/lib/logger")`.
// Verhindert Test-Bootstrap-Failure wenn SUPABASE_URL nicht gesetzt ist
// (siehe feedback_vitest_split_pure_logic_from_db_adapter.md).
async function logAuditError(
  error: Error,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "v8-1-augmentation-audit", metadata });
  } catch {
    // Fallback: logger nicht verfuegbar (Test-Umgebung ohne SUPABASE_URL).
    // Audit-Fehler werden silent — augment.ts wirft auch sonst nicht.
  }
}

/**
 * ai_cost_ledger.role-Wert fuer V8.1-Augmentation-Calls.
 * MUSS via Migration 105 im CHECK-Constraint freigeschaltet sein.
 */
export const V8_1_AI_COST_LEDGER_ROLE = "v8_1_augmentation" as const;

/**
 * error_log.source-Wert fuer Cache-Hit-Audit-Events.
 * (V1.1-error_log nutzt `source` als Category-Aequivalent.)
 */
export const V8_1_CACHE_HIT_SOURCE = "v8_1_llm_cache_hit" as const;

/**
 * error_log.source-Wert fuer Tonality-Drift-Audit-Events.
 */
export const V8_1_TONALITY_DRIFT_SOURCE = "v8_1_llm_tonality_drift" as const;

/**
 * error_log.source-Wert fuer normale (success oder fail) LLM-Calls.
 * Genutzt fuer Audit-Trail jenseits von ai_cost_ledger (z.B. failed calls
 * mit success_flag=false fuer Founder-Sichtbarkeit).
 */
export const V8_1_LLM_CALL_SOURCE = "v8_1_llm_call" as const;

/**
 * Schreibt einen ai_cost_ledger-Entry pro Bedrock-Call (sync oder failed).
 * job_id ist null (V8.1 nutzt KEIN ai_jobs — siehe DEC-174 sync-render).
 * tenant_id MUSS vom Caller (augment.ts) aus capture_session.tenant_id geliefert werden.
 *
 * Bei success=false (Bedrock-Error, Tonality-Drift, Word-Count-Exceed, Cost-Cap)
 * wird der Entry trotzdem geschrieben — usd_cost reflektiert eventuelle Teil-Cost.
 *
 * Modul-Name wird zusaetzlich in error_log mit V8_1_LLM_CALL_SOURCE geloggt
 * (ai_cost_ledger hat kein modul_name-Feld).
 */
export async function recordLlmCall(
  adminClient: SupabaseClient,
  entry: LlmCallAuditEntry
): Promise<void> {
  const { error: costError } = await adminClient.from("ai_cost_ledger").insert({
    tenant_id: entry.tenantId,
    job_id: null,
    model_id: entry.modelId,
    tokens_in: entry.tokensIn,
    tokens_out: entry.tokensOut,
    usd_cost: entry.costUsd,
    duration_ms: entry.latencyMs,
    iteration: 1,
    role: V8_1_AI_COST_LEDGER_ROLE,
  });

  if (costError) {
    await logAuditError(
      new Error(`Failed v8.1 ai_cost_ledger INSERT: ${costError.message}`),
      { tenantId: entry.tenantId, modulName: entry.modulName }
    );
  }

  const { error: logError } = await adminClient.from("error_log").insert({
    level: entry.success ? "info" : "warn",
    source: V8_1_LLM_CALL_SOURCE,
    message: entry.success
      ? `V8.1 LLM augment success: ${entry.modulName} (${entry.tokensIn}/${entry.tokensOut} tokens, $${entry.costUsd.toFixed(4)}, ${entry.latencyMs}ms)`
      : `V8.1 LLM augment failed: ${entry.modulName} (${entry.latencyMs}ms)`,
    metadata: {
      tenant_id: entry.tenantId,
      model_id: entry.modelId,
      modul_name: entry.modulName,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      cost_usd: entry.costUsd,
      latency_ms: entry.latencyMs,
      success: entry.success,
    },
  });

  if (logError) {
    await logAuditError(
      new Error(`Failed v8.1 error_log INSERT (llm_call): ${logError.message}`),
      { tenantId: entry.tenantId, modulName: entry.modulName }
    );
  }
}

/**
 * Schreibt einen error_log-Entry beim Cache-Hit (zero-cost Audit-Trail).
 * Zero-Cost weil kein Bedrock-Call. Sichtbar fuer Founder im Audit-Dashboard
 * via SELECT * FROM error_log WHERE source='v8_1_llm_cache_hit'.
 */
export async function recordCacheHit(
  adminClient: SupabaseClient,
  entry: CacheHitAuditEntry
): Promise<void> {
  const { error: logError } = await adminClient.from("error_log").insert({
    level: "info",
    source: V8_1_CACHE_HIT_SOURCE,
    message: `V8.1 LLM cache hit for session ${entry.captureSessionId} (model=${entry.modelId}, prompt=${entry.promptVersion})`,
    metadata: {
      capture_session_id: entry.captureSessionId,
      model_id: entry.modelId,
      prompt_version: entry.promptVersion,
    },
  });

  if (logError) {
    await logAuditError(
      new Error(`Failed v8.1 error_log INSERT (cache_hit): ${logError.message}`),
      { captureSessionId: entry.captureSessionId }
    );
  }
}

/**
 * Schreibt einen error_log-Entry bei Tonality-Drift (LLM-Output verstoesst Blacklist).
 * Fuer Founder-Forensik zur Pattern-Erweiterung (z.B. neue Wir-Voice-Verletzung).
 * driftSnippet ist auf 200 Zeichen begrenzt, damit error_log nicht ueberlaeuft.
 */
export async function recordTonalityDrift(
  adminClient: SupabaseClient,
  entry: TonalityDriftAuditEntry
): Promise<void> {
  const truncatedSnippet = entry.driftSnippet.slice(0, 200);

  const { error: logError } = await adminClient.from("error_log").insert({
    level: "warn",
    source: V8_1_TONALITY_DRIFT_SOURCE,
    message: `V8.1 LLM tonality drift detected for ${entry.modulName} (session ${entry.captureSessionId})`,
    metadata: {
      capture_session_id: entry.captureSessionId,
      modul_name: entry.modulName,
      drift_snippet: truncatedSnippet,
    },
  });

  if (logError) {
    await logAuditError(
      new Error(`Failed v8.1 error_log INSERT (tonality_drift): ${logError.message}`),
      { captureSessionId: entry.captureSessionId }
    );
  }
}
