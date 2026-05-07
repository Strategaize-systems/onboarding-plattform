// Worker Handler: walkthrough_map_subtopics — V5 Option 2 Stufe 3 (SLC-078 MT-3)
//
// Picks ai_jobs entries with job_type='walkthrough_map_subtopics', laedt die walkthrough_session,
// alle walkthrough_step-Rows der Session, das Template ueber capture_session.template_id.
// Baut den Subtopic-Tree aus blocks[].questions[].unterbereich (gefiltert auf sop_trigger=true
// mit Fallback auf alle Subtopics wenn Filter leer ist), ruft Bedrock (Sonnet, eu-central-1)
// mit dem subtopic_map-Prompt, validiert via Zod und persistiert pro Schritt eine Row in
// walkthrough_review_mapping.
//
// Bridge-Engine-Pattern in Reverse-Direction (DEC-091, FEAT-023): gleicher chatWithLLM-Aufruf,
// gleiche Token-Heuristik, gleicher ai_cost_ledger-Pfad. Reverse: Bridge-Engine spawnt
// Subtopic → Mitarbeiter-Aufgabe, V5-Stufe-3 mapped Schritt → Subtopic.
//
// Confidence-Threshold (DEC-084): ENV WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD, Default 0.7.
// LLM-confidence < threshold => subtopic_id auf NULL gesetzt (Unmapped-Bucket, DEC-085).
//
// Erwartete Eingangs-Status: 'mapping' (gesetzt vom Pipeline-Trigger nach Stufe 2).
// Status-Skip wenn != 'mapping'.
//
// N=0 Edge-Case: Wenn die Session keine walkthrough_step-Rows hat (Stufe 2 lieferte []),
// bleibt walkthrough_review_mapping leer, Pipeline advanced trotzdem mapping → pending_review
// (Berater bekommt leeren Tree-Hinweis im UI, DEC-090).
//
// Idempotency: bestehende walkthrough_review_mapping-Rows der Session werden vor Bulk-INSERT
// geloescht (Re-Run desselben Jobs ueberschreibt sauber). Soft-Delete fuer Berater-Edits ist
// SLC-079-Pfad und beruehrt diesen Worker nicht.
//
// Failure-Handling: try/catch → walkthrough_session.status='failed' + re-throw → claim-loop
// faehrt rpc_fail_ai_job. Cleanup-Cron (SLC-074) detektiert Stale-Sessions.

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { advanceWalkthroughPipeline } from "../../lib/walkthrough/pipeline-trigger";
import {
  buildSubtopicMapSystemPrompt,
  buildSubtopicMapUserMessage,
  type StepInput,
  type SubtopicTreeBlock,
} from "../../lib/ai/prompts/walkthrough/subtopic_map";
import {
  SubtopicMapArraySchema,
  type SubtopicMapItem,
} from "../../lib/ai/prompts/walkthrough/subtopic_map.schema";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";

interface MapPayload {
  walkthroughSessionId: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  status: string;
}

interface StepRow {
  id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
}

interface CaptureSessionRow {
  id: string;
  template_id: string;
}

interface TemplateRow {
  id: string;
  version: string;
  blocks: unknown;
}

interface TemplateBlockJson {
  key?: string;
  title?: Record<string, string> | string;
  questions?: TemplateQuestionJson[];
}

interface TemplateQuestionJson {
  unterbereich?: string;
  sop_trigger?: boolean;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Sonnet-4 Pricing (USD pro Token) — analog handle-extract-steps-job.ts
const COST_PER_INPUT_TOKEN = 0.003 / 1000;
const COST_PER_OUTPUT_TOKEN = 0.015 / 1000;

const LOG_SOURCE = "walkthrough_subtopic_mapping";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

function readConfidenceThreshold(): number {
  const raw = process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD;
  if (!raw) return DEFAULT_CONFIDENCE_THRESHOLD;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }
  return parsed;
}

/**
 * Baut den Subtopic-Tree fuer den LLM-Prompt aus dem Template-JSON.
 *
 * - Subtopic-Schicht = unique blocks[].questions[].unterbereich (DEC-085-Korrektur,
 *   blocks[].subtopics[]-Pfad existiert in der Realitaet nicht).
 * - Default-Filter: nur unterbereich-Werte, in denen mind. 1 Frage sop_trigger=true ist
 *   (= Prozess-Subtopics). Reduziert Prompt-Laenge fuer Templates mit ~50 Subtopics.
 * - Fallback: Wenn nach sop_trigger-Filter kein Subtopic mehr uebrig bleibt (z.B.
 *   sop_trigger nicht im Template gesetzt), nutzen wir alle unterbereich-Werte.
 * - Reihenfolge: Block-Reihenfolge wie im Template, Subtopics innerhalb des Blocks
 *   alphabetisch (Stabilitaet fuer Tests + Bedrock-Cache-Hits).
 */
export function buildSubtopicTree(blocks: unknown): SubtopicTreeBlock[] {
  if (!Array.isArray(blocks)) return [];

  const filteredTree: SubtopicTreeBlock[] = [];
  const fallbackTree: SubtopicTreeBlock[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock as TemplateBlockJson | null;
    if (!block || typeof block !== "object") continue;
    const blockKey = typeof block.key === "string" ? block.key : "?";
    const titleSource = block.title;
    let blockTitle = blockKey;
    if (typeof titleSource === "string" && titleSource.trim().length > 0) {
      blockTitle = titleSource;
    } else if (titleSource && typeof titleSource === "object") {
      const de = (titleSource as Record<string, string>).de;
      const en = (titleSource as Record<string, string>).en;
      blockTitle = de ?? en ?? blockKey;
    }

    const questions = Array.isArray(block.questions) ? block.questions : [];
    const filteredSet = new Set<string>();
    const allSet = new Set<string>();

    for (const rawQ of questions) {
      const q = rawQ as TemplateQuestionJson | null;
      if (!q || typeof q !== "object") continue;
      const ub = q.unterbereich;
      if (typeof ub !== "string" || ub.trim().length === 0) continue;
      const trimmed = ub.trim();
      allSet.add(trimmed);
      if (q.sop_trigger === true) filteredSet.add(trimmed);
    }

    if (filteredSet.size > 0) {
      filteredTree.push({
        block_key: blockKey,
        block_title: blockTitle,
        subtopic_ids: Array.from(filteredSet).sort(),
      });
    }
    if (allSet.size > 0) {
      fallbackTree.push({
        block_key: blockKey,
        block_title: blockTitle,
        subtopic_ids: Array.from(allSet).sort(),
      });
    }
  }

  const totalFiltered = filteredTree.reduce((acc, b) => acc + b.subtopic_ids.length, 0);
  return totalFiltered > 0 ? filteredTree : fallbackTree;
}

interface ParsedMappings {
  items: SubtopicMapItem[];
  rawOutput: string;
}

function parseMappingsFromBedrockOutput(rawOutput: string): ParsedMappings {
  const trimmed = (rawOutput ?? "").trim();
  if (!trimmed) {
    throw new Error(
      "walkthrough_map_subtopics: Bedrock returned empty output",
    );
  }

  // Defensive Codeblock-Fence-Stripping (analog SLC-077).
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
      `walkthrough_map_subtopics: JSON.parse failed: ${
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      } | rawHead=${jsonText.slice(0, 200)}`,
    );
  }

  const validation = SubtopicMapArraySchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `walkthrough_map_subtopics: Zod validation failed: ${validation.error.message}`,
    );
  }

  return { items: validation.data, rawOutput: jsonText };
}

export async function handleMapSubtopicsJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startMs = Date.now();
  const threshold = readConfidenceThreshold();

  const payload = job.payload as unknown as MapPayload;
  if (!payload || !isUuid(payload.walkthroughSessionId)) {
    throw new Error(
      "walkthrough_map_subtopics: payload.walkthroughSessionId missing or not a UUID",
    );
  }
  const sessionId = payload.walkthroughSessionId;

  // 1. Load walkthrough_session
  const { data: sessionRow, error: loadError } = await adminClient
    .from("walkthrough_session")
    .select("id, tenant_id, capture_session_id, status")
    .eq("id", sessionId)
    .single();
  if (loadError || !sessionRow) {
    throw new Error(
      `walkthrough_map_subtopics: walkthrough_session ${sessionId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const session = sessionRow as SessionRow;

  // 2. Status-Skip — erwartet 'mapping' (gesetzt vom Pipeline-Trigger nach Stufe 2).
  if (session.status !== "mapping") {
    captureWarning(
      `walkthrough_map_subtopics: skipping session ${sessionId} with status='${session.status}' (expected 'mapping')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, walkthroughSessionId: sessionId, status: session.status },
      },
    );
    await adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id });
    return;
  }

  try {
    // 3. Load walkthrough_step rows (active only, sortiert nach step_number)
    const { data: stepRows, error: stepLoadError } = await adminClient
      .from("walkthrough_step")
      .select("id, step_number, action, responsible, timeframe")
      .eq("walkthrough_session_id", session.id)
      .is("deleted_at", null)
      .order("step_number", { ascending: true });
    if (stepLoadError) {
      throw new Error(
        `walkthrough_map_subtopics: walkthrough_step lookup failed: ${stepLoadError.message}`,
      );
    }
    const steps = (stepRows ?? []) as StepRow[];

    // 4. Idempotency: bestehende Mappings der Session-Schritte wegloeschen, BEVOR irgendwas Neues
    //    angelegt wird. Bei N=0 wird nichts geloescht, bei N>0 wird sauber neu eingefuegt.
    if (steps.length > 0) {
      const stepIds = steps.map((s) => s.id);
      const { error: deleteError } = await adminClient
        .from("walkthrough_review_mapping")
        .delete()
        .in("walkthrough_step_id", stepIds);
      if (deleteError) {
        throw new Error(
          `walkthrough_map_subtopics: pre-INSERT cleanup DELETE failed: ${deleteError.message}`,
        );
      }
    }

    // 5. Load capture_session (fuer template_id) + template (fuer blocks + version)
    const { data: capRow, error: capLoadError } = await adminClient
      .from("capture_session")
      .select("id, template_id")
      .eq("id", session.capture_session_id)
      .single();
    if (capLoadError || !capRow) {
      throw new Error(
        `walkthrough_map_subtopics: capture_session ${session.capture_session_id} not found: ${
          capLoadError?.message ?? "no row"
        }`,
      );
    }
    const capture = capRow as CaptureSessionRow;

    const { data: templateRow, error: templateLoadError } = await adminClient
      .from("template")
      .select("id, version, blocks")
      .eq("id", capture.template_id)
      .single();
    if (templateLoadError || !templateRow) {
      throw new Error(
        `walkthrough_map_subtopics: template ${capture.template_id} not found: ${
          templateLoadError?.message ?? "no row"
        }`,
      );
    }
    const template = templateRow as TemplateRow;
    const subtopicTree = buildSubtopicTree(template.blocks);

    if (subtopicTree.length === 0) {
      throw new Error(
        `walkthrough_map_subtopics: template ${capture.template_id} liefert leeren Subtopic-Tree (keine unterbereich-Werte)`,
      );
    }

    // 6. N=0 Edge-Case: keine Schritte → direkt zu pending_review advancen, kein Bedrock-Call.
    if (steps.length === 0) {
      const advanceN0 = await advanceWalkthroughPipeline(adminClient, session.id);
      const { error: completeN0 } = await adminClient.rpc(
        "rpc_complete_ai_job",
        { p_job_id: job.id },
      );
      if (completeN0) {
        throw new Error(
          `walkthrough_map_subtopics: rpc_complete_ai_job failed (N=0): ${completeN0.message}`,
        );
      }
      captureInfo(
        `walkthrough_map_subtopics: session=${sessionId} N=0 (no steps), advanced ${advanceN0.fromStatus} → ${advanceN0.toStatus}`,
        {
          source: LOG_SOURCE,
          metadata: { jobId: job.id, walkthroughSessionId: sessionId, n: 0 },
        },
      );
      return;
    }

    // 7. Bedrock-Call (eu-central-1, Sonnet, temperature=0)
    const stepInputs: StepInput[] = steps.map((s) => ({
      step_id: s.id,
      step_number: s.step_number,
      action: s.action,
      responsible: s.responsible,
      timeframe: s.timeframe,
    }));

    const systemPrompt = buildSubtopicMapSystemPrompt();
    const userMessage = buildSubtopicMapUserMessage(stepInputs, subtopicTree);

    const callStart = Date.now();
    const rawOutput = await chatWithLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { temperature: 0, maxTokens: 8000 },
    );
    const callDurationMs = Date.now() - callStart;

    // 8. Parse + Zod-Validation
    const { items: llmItems, rawOutput: cleanedJson } = parseMappingsFromBedrockOutput(rawOutput);

    // Map LLM-Items by step_id fuer schnellen Lookup
    const llmByStepId = new Map<string, SubtopicMapItem>();
    for (const item of llmItems) llmByStepId.set(item.step_id, item);

    // 9. Validate subtopic_id gegen Tree (LLM kann gelegentlich Strings erfinden — auf NULL kippen)
    const validSubtopics = new Set<string>();
    for (const block of subtopicTree) {
      for (const id of block.subtopic_ids) validSubtopics.add(id);
    }

    let invalidSubtopicCount = 0;
    let belowThresholdCount = 0;
    let mappedCount = 0;
    let unmappedCount = 0;

    // 10. Build INSERT-Rows pro Step (auch fuer Steps die der LLM nicht im Output hat — Fallback NULL)
    const rows = steps.map((step) => {
      const item = llmByStepId.get(step.id);
      let subtopicId: string | null = null;
      let confidenceScore: number | null = null;
      let reasoning = "";

      if (item) {
        const llmSubtopic = item.subtopic_id;
        const llmConfidence = item.confidence_score;
        reasoning = item.reasoning;
        confidenceScore = llmConfidence;

        if (llmSubtopic !== null && !validSubtopics.has(llmSubtopic)) {
          invalidSubtopicCount += 1;
          subtopicId = null;
        } else if (llmSubtopic !== null && llmConfidence < threshold) {
          belowThresholdCount += 1;
          subtopicId = null;
        } else {
          subtopicId = llmSubtopic;
        }
      } else {
        // LLM hat diesen Step verschluckt → Unmapped, niedrige Confidence dokumentieren
        reasoning = "LLM-Output enthielt keinen Eintrag fuer diesen Schritt — Default: Unmapped-Bucket";
        confidenceScore = 0;
      }

      if (subtopicId === null) unmappedCount += 1;
      else mappedCount += 1;

      return {
        tenant_id: session.tenant_id,
        walkthrough_step_id: step.id,
        template_id: template.id,
        template_version: template.version,
        subtopic_id: subtopicId,
        confidence_score: confidenceScore,
        mapping_model: MODEL_ID,
        mapping_reasoning: reasoning,
        reviewer_corrected: false,
      };
    });

    // 11. Bulk-INSERT walkthrough_review_mapping
    const { error: insertError, count: insertCount } = await adminClient
      .from("walkthrough_review_mapping")
      .insert(rows, { count: "exact" });
    if (insertError) {
      throw new Error(
        `walkthrough_map_subtopics: walkthrough_review_mapping bulk-INSERT failed: ${insertError.message}`,
      );
    }

    // 12. Cost-Logging in ai_cost_ledger (role='walkthrough_subtopic_mapper' per MIG-088 erlaubt).
    //     Bridge-Engine-Pattern-Konsistenz: gleiche Token-Heuristik wie handle-bridge-job.ts +
    //     handle-extract-steps-job.ts.
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
      role: "walkthrough_subtopic_mapper",
      feature: "walkthrough_subtopic_mapping",
    });
    if (costError) {
      captureWarning(
        `walkthrough_map_subtopics: ai_cost_ledger INSERT failed (non-fatal): ${costError.message}`,
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

    // 13. Pipeline-Trigger: mapping → pending_review (kein Folge-Job).
    const advance = await advanceWalkthroughPipeline(adminClient, session.id);

    // 14. Mark ai_job complete
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `walkthrough_map_subtopics: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `walkthrough_map_subtopics: session=${sessionId} done in ${
        Date.now() - startMs
      }ms (steps=${steps.length}, mapped=${mappedCount}, unmapped=${unmappedCount}, invalid_subtopic=${invalidSubtopicCount}, below_threshold=${belowThresholdCount}, status ${
        advance.fromStatus
      } → ${advance.toStatus}, threshold=${threshold}, inserted=${insertCount ?? rows.length})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          steps: steps.length,
          mapped: mappedCount,
          unmapped: unmappedCount,
          invalidSubtopic: invalidSubtopicCount,
          belowThreshold: belowThresholdCount,
          tokensIn: estimatedInputTokens,
          tokensOut: estimatedOutputTokens,
          usdCost: estimatedCostUsd,
          callDurationMs,
          threshold,
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
