// Worker Handler: walkthrough_extract_steps — V5 Option 2 Stufe 2 (SLC-077 MT-3)
//
// Picks ai_jobs entries with job_type='walkthrough_extract_steps', laedt die walkthrough_session,
// die redacted-KU (source='walkthrough_transcript_redacted', evidence_refs.walkthrough_session_id),
// ruft Bedrock (Sonnet, eu-central-1) mit dem step_extract-Prompt, validiert via Zod, persistiert
// pro extrahiertem Schritt eine Row in walkthrough_step und triggert die naechste Pipeline-Stufe.
//
// Erwartete Eingangs-Status: 'extracting' (gesetzt von advanceWalkthroughPipeline am Ende der Stufe 1).
// Status-Skip wenn != 'extracting'.
//
// Idempotency: vor Bulk-INSERT werden bestehende walkthrough_step-Rows fuer diese Session geloescht
// (Slice-Spec R3 — UNIQUE-Conflict bei Re-Run desselben Jobs).
//
// Edge-Case N=0: Wenn Bedrock leeres Array zurueckgibt, erfolgt KEIN INSERT in walkthrough_step.
// Pipeline-Trigger fuehrt trotzdem extracting → mapping aus (SLC-078 Mapping-Worker handelt N=0).
//
// Failure-Handling: try/catch → walkthrough_session.status='failed', re-throw — claim-loop
// faehrt rpc_fail_ai_job auf den ai_job. Cleanup-Cron in SLC-074 detektiert Stale-Sessions.
//
// transcript_offset_start/_end werden deterministisch aus dem redacted-Body via indexOf berechnet
// (LLM-Offset-Schaetzungen sind unzuverlaessig). Wenn der Snippet nicht im Body gefunden wird:
// offsets bleiben NULL (transcript_snippet ist trotzdem persistiert fuer Audit).

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { advanceWalkthroughPipeline } from "../../lib/walkthrough/pipeline-trigger";
import {
  buildStepExtractSystemPrompt,
  buildStepExtractUserMessage,
} from "../../lib/ai/prompts/walkthrough/step_extract";
import {
  StepExtractArraySchema,
  type StepExtractItem,
} from "../../lib/ai/prompts/walkthrough/step_extract.schema";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";

interface ExtractPayload {
  walkthroughSessionId: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  recorded_by_user_id: string;
  status: string;
}

interface RedactedKuRow {
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

// Sonnet-4 Pricing (USD pro Token) — analog handle-redact-pii-job.ts
const COST_PER_INPUT_TOKEN = 0.003 / 1000;
const COST_PER_OUTPUT_TOKEN = 0.015 / 1000;

const LOG_SOURCE = "walkthrough_step_extraction";

interface ParsedSteps {
  items: StepExtractItem[];
  rawOutput: string;
}

function parseStepsFromBedrockOutput(rawOutput: string): ParsedSteps {
  const trimmed = (rawOutput ?? "").trim();
  if (!trimmed) {
    throw new Error(
      "walkthrough_extract_steps: Bedrock returned empty output",
    );
  }

  // Defensive: falls Bedrock doch einen Markdown-Codeblock liefert, abschneiden.
  let jsonText = trimmed;
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseErr) {
    throw new Error(
      `walkthrough_extract_steps: JSON.parse failed: ${
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      } | rawHead=${jsonText.slice(0, 200)}`,
    );
  }

  const validation = StepExtractArraySchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `walkthrough_extract_steps: Zod validation failed: ${validation.error.message}`,
    );
  }

  return { items: validation.data, rawOutput: jsonText };
}

interface OffsetPair {
  start: number | null;
  end: number | null;
}

function locateOffsets(body: string, snippet: string): OffsetPair {
  if (!snippet) return { start: null, end: null };
  const idx = body.indexOf(snippet);
  if (idx === -1) {
    // Fallback: erste 60 Zeichen des Snippets versuchen (LLM kann minimal abweichen)
    const head = snippet.slice(0, 60).trim();
    if (head.length >= 12) {
      const headIdx = body.indexOf(head);
      if (headIdx !== -1) {
        return { start: headIdx, end: headIdx + head.length };
      }
    }
    return { start: null, end: null };
  }
  return { start: idx, end: idx + snippet.length };
}

export async function handleExtractStepsJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startMs = Date.now();

  const payload = job.payload as unknown as ExtractPayload;
  if (!payload || !isUuid(payload.walkthroughSessionId)) {
    throw new Error(
      "walkthrough_extract_steps: payload.walkthroughSessionId missing or not a UUID",
    );
  }
  const sessionId = payload.walkthroughSessionId;

  // 1. Load walkthrough_session
  const { data: sessionRow, error: loadError } = await adminClient
    .from("walkthrough_session")
    .select("id, tenant_id, recorded_by_user_id, status")
    .eq("id", sessionId)
    .single();
  if (loadError || !sessionRow) {
    throw new Error(
      `walkthrough_extract_steps: walkthrough_session ${sessionId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const session = sessionRow as SessionRow;

  // 2. Status-Skip — erwartet 'extracting' (gesetzt vom Pipeline-Trigger nach Stufe 1).
  if (session.status !== "extracting") {
    captureWarning(
      `walkthrough_extract_steps: skipping session ${sessionId} with status='${session.status}' (expected 'extracting')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, walkthroughSessionId: sessionId, status: session.status },
      },
    );
    await adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id });
    return;
  }

  try {
    // 3. Load redacted-KU (source='walkthrough_transcript_redacted', evidence_refs.walkthrough_session_id)
    const { data: kuRow, error: kuLoadError } = await adminClient
      .from("knowledge_unit")
      .select("id, body")
      .eq("source", "walkthrough_transcript_redacted")
      .eq("evidence_refs->>walkthrough_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (kuLoadError) {
      throw new Error(
        `walkthrough_extract_steps: redacted KU lookup failed: ${kuLoadError.message}`,
      );
    }
    if (!kuRow) {
      throw new Error(
        `walkthrough_extract_steps: keine redacted KU fuer session ${sessionId} gefunden (source='walkthrough_transcript_redacted')`,
      );
    }
    const redactedKu = kuRow as RedactedKuRow;
    if (!redactedKu.body || redactedKu.body.trim().length === 0) {
      throw new Error(
        `walkthrough_extract_steps: redacted KU ${redactedKu.id} hat keinen body`,
      );
    }

    // 4. Bedrock-Call (eu-central-1, Sonnet, temperature=0 fuer Determinismus)
    const systemPrompt = buildStepExtractSystemPrompt();
    const userMessage = buildStepExtractUserMessage(redactedKu.body);

    const callStart = Date.now();
    const rawOutput = await chatWithLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { temperature: 0, maxTokens: 8000 },
    );
    const callDurationMs = Date.now() - callStart;

    // 5. Parse + Zod-Validation
    const { items, rawOutput: cleanedJson } = parseStepsFromBedrockOutput(rawOutput);

    // 6. Idempotency: bestehende walkthrough_step-Rows fuer diese Session loeschen.
    //    UNIQUE (walkthrough_session_id, step_number) wuerde sonst beim Re-Run kollidieren.
    //    Soft-Delete via deleted_at ist die Berater-Edit-Spur (SLC-079) — Worker-Re-Run
    //    soll alte Worker-Rows hart loeschen, nicht soft-deleten.
    const { error: deleteError } = await adminClient
      .from("walkthrough_step")
      .delete()
      .eq("walkthrough_session_id", session.id);
    if (deleteError) {
      throw new Error(
        `walkthrough_extract_steps: pre-INSERT cleanup DELETE failed: ${deleteError.message}`,
      );
    }

    // 7. Bulk-INSERT (nur wenn N > 0). step_number 1..N erzwingen, auch wenn LLM-Output abweicht.
    let insertedCount = 0;
    if (items.length > 0) {
      const rows = items.map((item, idx) => {
        const offsets = locateOffsets(redactedKu.body, item.transcript_snippet);
        return {
          tenant_id: session.tenant_id,
          walkthrough_session_id: session.id,
          step_number: idx + 1,
          action: item.action,
          responsible: item.responsible ?? null,
          timeframe: item.timeframe ?? null,
          success_criterion: item.success_criterion ?? null,
          dependencies: item.dependencies ?? null,
          transcript_snippet: item.transcript_snippet,
          transcript_offset_start: offsets.start,
          transcript_offset_end: offsets.end,
        };
      });

      const { error: insertError, count } = await adminClient
        .from("walkthrough_step")
        .insert(rows, { count: "exact" });
      if (insertError) {
        throw new Error(
          `walkthrough_extract_steps: walkthrough_step bulk-INSERT failed: ${insertError.message}`,
        );
      }
      insertedCount = count ?? rows.length;
    }

    // 8. Cost-Logging in ai_cost_ledger (Token-Heuristik wie handle-redact-pii-job.ts).
    //    role='walkthrough_step_extractor' wurde in Migration 088 explizit erlaubt — kein
    //    Schema-Drift-Risiko (RPT-183 Lessons via IMP-371).
    const estimatedInputTokens = Math.ceil(
      (systemPrompt.length + userMessage.length) / 4,
    );
    const estimatedOutputTokens = Math.ceil(cleanedJson.length / 4);
    const estimatedCostUsd =
      estimatedInputTokens * COST_PER_INPUT_TOKEN +
      estimatedOutputTokens * COST_PER_OUTPUT_TOKEN;

    const { error: costError } = await adminClient.from("ai_cost_ledger").insert({
      tenant_id: session.tenant_id,
      job_id: job.id,
      model_id: MODEL_ID,
      tokens_in: estimatedInputTokens,
      tokens_out: estimatedOutputTokens,
      usd_cost: estimatedCostUsd,
      duration_ms: callDurationMs,
      role: "walkthrough_step_extractor",
      feature: "walkthrough_step_extraction",
    });
    if (costError) {
      captureWarning(
        `walkthrough_extract_steps: ai_cost_ledger INSERT failed (non-fatal): ${costError.message}`,
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

    // 9. Pipeline-Trigger: extracting → mapping + enqueue walkthrough_map_subtopics.
    //    Stufe-3-Handler kommt mit SLC-078; bis dahin bleibt der enqueueed Job pending.
    const advance = await advanceWalkthroughPipeline(adminClient, session.id);

    // 10. Mark ai_job complete
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `walkthrough_extract_steps: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `walkthrough_extract_steps: session=${sessionId} done in ${
        Date.now() - startMs
      }ms (input=${redactedKu.body.length} chars, steps=${insertedCount}, status ${
        advance.fromStatus
      } → ${advance.toStatus}, next-job=${advance.enqueuedJobType ?? "none"})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          inputChars: redactedKu.body.length,
          stepsExtracted: insertedCount,
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
