// V8 SLC-148 MT-6 — V8 Mandanten-Report deterministic pipeline.
//
// Triggered when `template.metadata.usage_kind === "mandanten_report_teaser_v1"`
// (Migration 102 seed). Unlike the V6.3 light-pipeline, this branch runs
// ENTIRELY synchronous — no Bedrock, no LLM, no cost-ledger — so it can be
// called directly from the Server-Action `finalizeMandantenReport` and also
// from the worker dispatcher for queued jobs.
//
// Steps:
//   1. computeModuleScores  — Average reife_skala_5 answers per module m1..m9
//   2. computeSui           — Weighted total (m1..m8 + m9*2) -> 0..100
//   3. classifySui          — strukturluecke | teil_reife | tragbar
//   4. mapAllModuleScoresToStufen — Per-module stufe 1..5
//   5. aggregateHausaufgaben — M0 nein/teilweise -> HausaufgabeItem[]
//   6. aggregateReflexion   — M10 non-empty answers -> ReflexionItem[]
//   7. selectThreeHebel     — Top-3 lowest-score modules + unsere_empfehlung
//
// Writes:
//   - capture_session.metadata.v8_report_snapshot = full V8ReportSnapshot
//     (fetch-merge-write to preserve other future metadata keys per
//     DEC-163-erweiterung 2026-05-29)
//   - block_checkpoint row (checkpoint_type='auto_final') for V6.3-pattern
//     traceability (non-fatal on failure — snapshot already on metadata)
//   - error_log info on success, error on failure
//
// Notably absent:
//   - NO ai_jobs INSERT (per [[feedback-synchronous-llm-no-ai-jobs-insert]] —
//     deterministic synchronous code needs no async job tracking)
//   - NO ai_cost_ledger (no LLM tokens)
//   - NO rpc_finalize_partner_diagnostic equivalent (different snapshot model)
//
// Spec: slices/SLC-148-template-daten-sui-score-engine.md MT-6
// Reuse: V6.3 light-pipeline.ts (logging shape + dispatcher pattern)

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "../../lib/logger";
import {
  aggregateHausaufgaben,
  aggregateReflexion,
  classifySui,
  computeModuleScores,
  computeSui,
  mapAllModuleScoresToStufen,
  selectThreeHebel,
} from "../../lib/diagnose/sui-engine";
import type {
  Answer,
  ModulKey,
  V8ReportSnapshot,
  V8Template,
} from "../../lib/diagnose/types";

/** Session input shape — parallels LightPipelineSession. */
export interface V8PipelineSession {
  id: string;
  tenant_id: string;
  template_id: string;
  owner_user_id: string;
  answers: Record<string, string>;
}

/** Template input shape — parallels LightPipelineTemplate. */
export interface V8PipelineTemplate {
  id: string;
  version: string;
  blocks: unknown;
  metadata: unknown;
}

/** Result of the V8 pipeline. */
export interface V8PipelineResult {
  capture_session_id: string;
  snapshot: V8ReportSnapshot;
  duration_ms: number;
}

const V8_BLOCK_KEY = "v8_mandanten_report";
const MODUL_KEYS: ModulKey[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
];

/**
 * Run the V8 Mandanten-Report pipeline for a finalized capture_session.
 *
 * @throws if score-compute or snapshot-UPDATE fails. capture_session.status
 *         is NOT changed by this function — callers (Server-Action or worker)
 *         are responsible for status transitions.
 */
export async function runV8MandantenReportPipeline(params: {
  session: V8PipelineSession;
  template: V8PipelineTemplate;
  adminClient: SupabaseClient;
  jobId?: string;
}): Promise<V8PipelineResult> {
  const { session, template, adminClient, jobId } = params;
  const startTime = Date.now();

  const v8Template: V8Template = {
    slug: "exit-readiness-teaser-v1",
    version: 1,
    name: "",
    description: "",
    blocks: template.blocks as V8Template["blocks"],
    metadata: template.metadata as V8Template["metadata"],
  };

  const answers = answersRecordToArray(session.answers);

  let snapshot: V8ReportSnapshot;
  try {
    const moduleScores = computeModuleScores(answers, v8Template);
    const sui = computeSui(moduleScores);
    const classification = classifySui(sui);
    const stufenMapping = mapAllModuleScoresToStufen(moduleScores);
    const hausaufgaben = aggregateHausaufgaben(answers, v8Template);
    const reflexionen = aggregateReflexion(answers, v8Template);
    const modulNames = extractModulNames(v8Template);
    const hebel = selectThreeHebel(
      moduleScores,
      v8Template.metadata.stufen_lookup,
      modulNames,
    );
    snapshot = {
      schemaVersion: 1,
      finalizedAt: new Date().toISOString(),
      moduleScores,
      sui,
      classification,
      stufenMapping,
      hausaufgaben,
      reflexionen,
      hebel,
    };
  } catch (err) {
    await logFailure(adminClient, session, "v8_pipeline_compute_failed", err);
    throw err;
  }

  // Fetch-merge-write: preserve any other future metadata keys. V8.0 is the
  // first writer so this is currently a no-op merge — written this way to
  // remain forward-compat for V9+ metadata keys.
  const { data: existing, error: fetchError } = await adminClient
    .from("capture_session")
    .select("metadata")
    .eq("id", session.id)
    .single();
  if (fetchError) {
    await logFailure(adminClient, session, "v8_metadata_fetch_failed", fetchError);
    throw new Error(
      `V8 metadata fetch failed for session ${session.id}: ${fetchError.message}`,
    );
  }

  const currentMetadata =
    (existing?.metadata as Record<string, unknown> | null) ?? {};
  const mergedMetadata = {
    ...currentMetadata,
    v8_report_snapshot: snapshot,
  };

  const { error: updateError } = await adminClient
    .from("capture_session")
    .update({
      metadata: mergedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  if (updateError) {
    await logFailure(adminClient, session, "v8_snapshot_write_failed", updateError);
    throw new Error(
      `V8 snapshot UPDATE failed for session ${session.id}: ${updateError.message}`,
    );
  }

  // block_checkpoint INSERT — V6.3-pattern reuse for traceability.
  // Non-fatal: snapshot already persisted on capture_session.metadata.
  const checkpointContent = { snapshot };
  const contentHash = createHash("sha256")
    .update(JSON.stringify(checkpointContent))
    .digest("hex");
  const { error: checkpointError } = await adminClient
    .from("block_checkpoint")
    .insert({
      tenant_id: session.tenant_id,
      capture_session_id: session.id,
      block_key: V8_BLOCK_KEY,
      checkpoint_type: "auto_final",
      content: checkpointContent,
      content_hash: contentHash,
      created_by: session.owner_user_id,
    });
  if (checkpointError) {
    captureException(
      new Error(
        `V8 block_checkpoint INSERT failed: ${checkpointError.message}`,
      ),
      {
        source: "v8-pipeline",
        metadata: { jobId, sessionId: session.id },
      },
    );
  }

  const totalDuration = Date.now() - startTime;
  const { error: logError } = await adminClient.from("error_log").insert({
    level: "info",
    source: "v8_mandanten_report_finalized",
    message:
      `V8 Mandanten-Report finalized for session ${session.id}: ` +
      `sui=${snapshot.sui.toFixed(1)} (${snapshot.classification.kind}), ` +
      `${snapshot.hausaufgaben.length} hausaufgaben, ` +
      `${snapshot.hebel.length} hebel, ${totalDuration}ms`,
    metadata: {
      session_id: session.id,
      tenant_id: session.tenant_id,
      template_id: template.id,
      template_version: template.version,
      sui: snapshot.sui,
      classification_kind: snapshot.classification.kind,
      duration_ms: totalDuration,
      job_id: jobId ?? null,
    },
  });
  if (logError) {
    captureException(
      new Error(
        `V8 success error_log INSERT failed: ${logError.message}`,
      ),
      { source: "v8-pipeline", metadata: { jobId } },
    );
  }

  return {
    capture_session_id: session.id,
    snapshot,
    duration_ms: totalDuration,
  };
}

function answersRecordToArray(answers: Record<string, string>): Answer[] {
  return Object.entries(answers).map(([frage_id, value]) => ({
    frage_id,
    value,
  }));
}

function extractModulNames(template: V8Template): Record<ModulKey, string> {
  const result = {} as Record<ModulKey, string>;
  for (const block of template.blocks) {
    const lowerId = block.modul_id.toLowerCase() as ModulKey;
    if (MODUL_KEYS.includes(lowerId)) {
      // First match per modul wins. M1..M9 have two block-entries each
      // (hygiene/reife/reflexion split is on M0/M10), but for m1..m9 the
      // reife_skala_5 block carries the canonical name.
      if (!result[lowerId]) {
        result[lowerId] = block.name;
      }
    }
  }
  return result;
}

async function logFailure(
  adminClient: SupabaseClient,
  session: V8PipelineSession,
  reason: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const { error: logError } = await adminClient.from("error_log").insert({
    level: "error",
    source: "v8_mandanten_report_failed",
    message: `V8 Mandanten-Report failed for session ${session.id}: ${reason} — ${message}`,
    stack,
    metadata: {
      session_id: session.id,
      tenant_id: session.tenant_id,
      reason,
    },
  });
  if (logError) {
    captureException(
      new Error(
        `V8 failure error_log INSERT failed: ${logError.message}`,
      ),
      { source: "v8-pipeline", metadata: { sessionId: session.id } },
    );
  }
}
