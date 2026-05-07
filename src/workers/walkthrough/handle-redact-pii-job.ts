// Worker Handler: walkthrough_redact_pii — V5 Option 2 Stufe 1 (SLC-076 MT-4)
//
// Picks ai_jobs entries with job_type='walkthrough_redact_pii', laedt die walkthrough_session,
// das Original-Transkript-KU (source='walkthrough_transcript'), ruft Bedrock (Sonnet, eu-central-1)
// mit dem pii_redact-Prompt, persistiert den redacted-Text als neuen knowledge_unit-Eintrag mit
// source='walkthrough_transcript_redacted' und triggert die naechste Pipeline-Stufe.
//
// Erwartete Eingangs-Status: 'redacting' (gesetzt vom MT-5-Patch im Whisper-Worker).
// Status-Skip wenn != 'redacting'.
//
// Failure-Handling: try/catch → walkthrough_session.status='failed', re-throw — claim-loop
// faehrt rpc_fail_ai_job auf den ai_job. Cleanup-Cron in SLC-074 detektiert Stale-Sessions.

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { advanceWalkthroughPipeline } from "../../lib/walkthrough/pipeline-trigger";
import {
  buildPiiRedactSystemPrompt,
  buildPiiRedactUserMessage,
} from "../../lib/ai/prompts/walkthrough/pii_redact";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";

interface RedactPayload {
  walkthroughSessionId: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  recorded_by_user_id: string;
  transcript_knowledge_unit_id: string | null;
  status: string;
}

interface KnowledgeUnitRow {
  id: string;
  body: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Sonnet-4 Pricing (USD pro Token)
const COST_PER_INPUT_TOKEN = 0.003 / 1000;
const COST_PER_OUTPUT_TOKEN = 0.015 / 1000;

const LOG_SOURCE = "walkthrough_pii_redaction";

export async function handleRedactPiiJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startMs = Date.now();

  const payload = job.payload as unknown as RedactPayload;
  if (!payload || !isUuid(payload.walkthroughSessionId)) {
    throw new Error(
      "walkthrough_redact_pii: payload.walkthroughSessionId missing or not a UUID",
    );
  }
  const sessionId = payload.walkthroughSessionId;

  // 1. Load walkthrough_session
  const { data: sessionRow, error: loadError } = await adminClient
    .from("walkthrough_session")
    .select(
      "id, tenant_id, capture_session_id, recorded_by_user_id, transcript_knowledge_unit_id, status",
    )
    .eq("id", sessionId)
    .single();
  if (loadError || !sessionRow) {
    throw new Error(
      `walkthrough_redact_pii: walkthrough_session ${sessionId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const session = sessionRow as SessionRow;

  // 2. Status-Skip — erwartet 'redacting' (gesetzt vom Whisper-Worker-Trigger).
  if (session.status !== "redacting") {
    captureWarning(
      `walkthrough_redact_pii: skipping session ${sessionId} with status='${session.status}' (expected 'redacting')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, walkthroughSessionId: sessionId, status: session.status },
      },
    );
    await adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id });
    return;
  }

  try {
    if (!session.transcript_knowledge_unit_id) {
      throw new Error(
        `walkthrough_redact_pii: session ${sessionId} hat keine transcript_knowledge_unit_id`,
      );
    }

    // 3. Load Original-Transkript-KU
    const { data: kuRow, error: kuLoadError } = await adminClient
      .from("knowledge_unit")
      .select("id, body")
      .eq("id", session.transcript_knowledge_unit_id)
      .single();
    if (kuLoadError || !kuRow) {
      throw new Error(
        `walkthrough_redact_pii: knowledge_unit ${session.transcript_knowledge_unit_id} not found: ${
          kuLoadError?.message ?? "no row"
        }`,
      );
    }
    const originalKu = kuRow as KnowledgeUnitRow;
    if (!originalKu.body || originalKu.body.trim().length === 0) {
      throw new Error(
        `walkthrough_redact_pii: original KU ${originalKu.id} hat keinen body`,
      );
    }

    // 4. Bedrock-Call (eu-central-1, Sonnet, temperature=0 fuer Determinismus)
    const systemPrompt = buildPiiRedactSystemPrompt();
    const userMessage = buildPiiRedactUserMessage(originalKu.body);

    const callStart = Date.now();
    const redactedText = await chatWithLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { temperature: 0, maxTokens: 8000 },
    );
    const callDurationMs = Date.now() - callStart;

    const trimmed = (redactedText ?? "").trim();
    if (!trimmed) {
      throw new Error(
        "walkthrough_redact_pii: Bedrock returned empty redacted text",
      );
    }

    // 5. INSERT redacted-KU
    const titleSource = trimmed.replace(/\s+/g, " ").trim();
    const title =
      titleSource.length > 80
        ? `${titleSource.slice(0, 77).trimEnd()}...`
        : titleSource || "Walkthrough-Transkript (PII-redacted)";

    const { data: redactedRow, error: insertError } = await adminClient
      .from("knowledge_unit")
      .insert({
        tenant_id: session.tenant_id,
        capture_session_id: session.capture_session_id,
        block_checkpoint_id: null,
        block_key: "unassigned",
        source: "walkthrough_transcript_redacted",
        unit_type: "observation",
        confidence: "medium",
        title,
        body: trimmed,
        evidence_refs: {
          original_knowledge_unit_id: originalKu.id,
          walkthrough_session_id: session.id,
          recorded_by_user_id: session.recorded_by_user_id,
        },
        updated_by: session.recorded_by_user_id,
      })
      .select("id")
      .single();
    if (insertError || !redactedRow) {
      throw new Error(
        `walkthrough_redact_pii: redacted knowledge_unit INSERT failed: ${
          insertError?.message ?? "no row"
        }`,
      );
    }

    // 6. Cost-Logging in ai_cost_ledger (Token-Heuristik wie dialogue_extraction)
    const estimatedInputTokens = Math.ceil(
      (systemPrompt.length + userMessage.length) / 4,
    );
    const estimatedOutputTokens = Math.ceil(trimmed.length / 4);
    const estimatedCostUsd =
      estimatedInputTokens * COST_PER_INPUT_TOKEN +
      estimatedOutputTokens * COST_PER_OUTPUT_TOKEN;

    // Cost-Logging: error-Handling explizit, damit ein CHECK-Fehler oder RLS-Fehler nicht silent
    // verschluckt wird (RPT-183 — pre-MIG-088 schluckte der INSERT mit role='walkthrough_pii_redactor'
    // den CHECK-Violation-Error). Cost-Tracking ist nice-to-have, KEIN Pipeline-Blocker — wir loggen
    // das Problem, lassen aber den restlichen Erfolgspfad weiterlaufen.
    const { error: costError } = await adminClient.from("ai_cost_ledger").insert({
      tenant_id: session.tenant_id,
      job_id: job.id,
      model_id: MODEL_ID,
      tokens_in: estimatedInputTokens,
      tokens_out: estimatedOutputTokens,
      usd_cost: estimatedCostUsd,
      duration_ms: callDurationMs,
      role: "walkthrough_pii_redactor",
      feature: "walkthrough_pii_redaction",
    });
    if (costError) {
      captureWarning(
        `walkthrough_redact_pii: ai_cost_ledger INSERT failed (non-fatal): ${costError.message}`,
        {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            walkthroughSessionId: sessionId,
            costErrorCode: (costError as { code?: string }).code,
          },
        },
      );
    }

    // 7. Pipeline-Trigger: redacting → extracting + enqueue walkthrough_extract_steps
    //    Stufe-2-Handler kommt mit SLC-077; bis dahin bleibt der enqueueed Job pending.
    const advance = await advanceWalkthroughPipeline(adminClient, session.id);

    // 8. Mark ai_job complete
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `walkthrough_redact_pii: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `walkthrough_redact_pii: session=${sessionId} done in ${
        Date.now() - startMs
      }ms (input=${originalKu.body.length} chars, output=${trimmed.length} chars, status ${
        advance.fromStatus
      } → ${advance.toStatus}, next-job=${advance.enqueuedJobType ?? "none"})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          inputChars: originalKu.body.length,
          outputChars: trimmed.length,
          tokensIn: estimatedInputTokens,
          tokensOut: estimatedOutputTokens,
          usdCost: estimatedCostUsd,
          callDurationMs,
        },
      },
    );
  } catch (err) {
    // Best-effort: status='failed' + re-throw → claim-loop fails the ai_job.
    try {
      await adminClient
        .from("walkthrough_session")
        .update({ status: "failed" })
        .eq("id", sessionId);
    } catch (statusFailErr) {
      captureException(statusFailErr, {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          phase: "set-status-failed",
        },
      });
    }
    captureException(err, {
      source: LOG_SOURCE,
      metadata: {
        jobId: job.id,
        walkthroughSessionId: sessionId,
      },
    });
    throw err;
  }
}
