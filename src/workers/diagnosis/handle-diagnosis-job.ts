// Diagnosis Generation Job Handler
// Generates a structured diagnosis from Knowledge Units via Bedrock.
// 1. Load block checkpoint + KUs + template (diagnosis_schema + diagnosis_prompt)
// 2. Build diagnosis prompt
// 3. Bedrock call (temperature 0.3, maxTokens 8192)
// 4. Parse + validate JSON output
// 5. Persist via rpc_create_diagnosis
// 6. Log costs to ai_cost_ledger (feature='diagnosis')
// 7. Mark job as completed

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import {
  buildDiagnosisSystemPrompt,
  buildDiagnosisUserPrompt,
} from "./diagnosis-prompt";
import type {
  DiagnosisContent,
  DiagnosisSchema,
  DiagnosisPromptConfig,
  DiagnosisSubtopic,
} from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Bedrock Claude pricing (eu-central-1, Sonnet)
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

export async function handleDiagnosisJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(
    `[diagnosis-job] Processing job ${job.id} for tenant ${job.tenant_id}`
  );

  // 1. Extract payload
  const checkpointId = job.payload.block_checkpoint_id as string;
  const blockKey = job.payload.block_key as string;
  const sessionId = job.payload.session_id as string;

  if (!checkpointId || !blockKey || !sessionId) {
    throw new Error(
      "Diagnosis job payload missing required fields (block_checkpoint_id, block_key, session_id)"
    );
  }

  // 2. Load checkpoint for quality_report
  const { data: checkpoint, error: cpError } = await adminClient
    .from("block_checkpoint")
    .select("quality_report")
    .eq("id", checkpointId)
    .single();

  if (cpError) {
    throw new Error(
      `Failed to load checkpoint ${checkpointId}: ${cpError.message}`
    );
  }

  // 3. Load Knowledge Units for this block
  const { data: knowledgeUnits, error: kuError } = await adminClient
    .from("knowledge_unit")
    .select("title, body, unit_type, confidence")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .in("status", ["proposed", "accepted", "edited"])
    .order("created_at", { ascending: true });

  if (kuError) {
    throw new Error(`Failed to load KUs: ${kuError.message}`);
  }

  if (!knowledgeUnits || knowledgeUnits.length === 0) {
    throw new Error(
      `No knowledge units found for block ${blockKey} — cannot generate diagnosis`
    );
  }

  console.log(
    `[diagnosis-job] ${knowledgeUnits.length} KUs loaded for block ${blockKey}`
  );

  // 4. Load template for diagnosis_schema + diagnosis_prompt + block title
  const { data: session } = await adminClient
    .from("capture_session")
    .select("template_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const { data: template } = await adminClient
    .from("template")
    .select("blocks, diagnosis_schema, diagnosis_prompt")
    .eq("id", session.template_id)
    .single();

  if (!template) {
    throw new Error(`Template for session ${sessionId} not found`);
  }

  const diagnosisSchema = template.diagnosis_schema as DiagnosisSchema | null;
  const diagnosisPromptConfig = template.diagnosis_prompt as DiagnosisPromptConfig | null;

  if (!diagnosisSchema) {
    throw new Error(
      `Template has no diagnosis_schema — cannot generate diagnosis`
    );
  }

  const blockSchema = diagnosisSchema.blocks[blockKey];
  if (!blockSchema || !blockSchema.subtopics || blockSchema.subtopics.length === 0) {
    throw new Error(
      `No subtopics defined for block ${blockKey} in diagnosis_schema`
    );
  }

  // Get block title
  const blocks = (template.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string> | string;
  }>;
  const blockDef = blocks.find((b) => b.key === blockKey);
  const blockTitle =
    typeof blockDef?.title === "object"
      ? blockDef.title.de ?? blockDef.title.en ?? blockKey
      : blockDef?.title ?? blockKey;

  // 5. Build prompts
  const systemPrompt = buildDiagnosisSystemPrompt(diagnosisPromptConfig);
  const userPrompt = buildDiagnosisUserPrompt({
    blockKey,
    blockTitle,
    subtopics: blockSchema.subtopics,
    knowledgeUnits,
    qualityReport: checkpoint?.quality_report as
      | { overall_score?: string | number; recommendation?: string }
      | null,
    diagnosisPromptConfig,
  });

  // 6. Bedrock call
  console.log(`[diagnosis-job] Calling Bedrock for diagnosis generation...`);
  const callStart = Date.now();

  const rawResponse = await chatWithLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 8192 }
  );

  const callDuration = Date.now() - callStart;

  // Estimate token counts (rough: 4 chars per token)
  const estimatedInputTokens = Math.ceil(
    (systemPrompt.length + userPrompt.length) / 4
  );
  const estimatedOutputTokens = Math.ceil(rawResponse.length / 4);
  const estimatedCost =
    estimatedInputTokens * COST_PER_INPUT_TOKEN +
    estimatedOutputTokens * COST_PER_OUTPUT_TOKEN;

  console.log(
    `[diagnosis-job] Bedrock responded in ${callDuration}ms ` +
      `(~${estimatedInputTokens} in, ~${estimatedOutputTokens} out, ~$${estimatedCost.toFixed(4)})`
  );

  // 7. Parse JSON output
  const diagnosisContent = parseDiagnosisOutput(
    rawResponse,
    blockKey,
    blockTitle,
    blockSchema.subtopics.map((st) => st.key)
  );

  // 8. Persist via RPC
  const { data: createResult, error: createError } = await adminClient.rpc(
    "rpc_create_diagnosis",
    {
      p_session_id: sessionId,
      p_block_key: blockKey,
      p_checkpoint_id: checkpointId,
      p_content: diagnosisContent,
      p_model: MODEL_ID,
      p_cost: estimatedCost,
    }
  );

  if (createError) {
    throw new Error(`Failed to create diagnosis: ${createError.message}`);
  }

  const diagnosisId = (createResult as { diagnosis_id?: string })?.diagnosis_id;
  console.log(`[diagnosis-job] Diagnosis created: ${diagnosisId}`);

  // 9. Log costs to ai_cost_ledger
  try {
    await adminClient.from("ai_cost_ledger").insert({
      tenant_id: job.tenant_id,
      job_id: job.id,
      model_id: MODEL_ID,
      tokens_in: estimatedInputTokens,
      tokens_out: estimatedOutputTokens,
      usd_cost: estimatedCost,
      duration_ms: callDuration,
      role: "diagnosis_generator",
      feature: "diagnosis",
    });
  } catch (costErr) {
    captureException(costErr, {
      source: "diagnosis-job",
      metadata: { jobId: job.id, action: "log-costs" },
    });
  }

  // 10. Mark job as completed
  const { error: completeError } = await adminClient.rpc(
    "rpc_complete_ai_job",
    { p_job_id: job.id }
  );

  if (completeError) {
    throw new Error(
      `Failed to complete diagnosis job: ${completeError.message}`
    );
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[diagnosis-job] Job ${job.id} completed in ${totalDuration}ms ` +
      `(${diagnosisContent.subtopics.length} subtopics, ~$${estimatedCost.toFixed(4)})`
  );
}

/**
 * Parse diagnosis JSON from LLM response.
 * Handles markdown code fences, validates required structure.
 */
function parseDiagnosisOutput(
  raw: string,
  blockKey: string,
  blockTitle: string,
  expectedSubtopicKeys: string[]
): DiagnosisContent {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Validate top-level structure
  if (!Array.isArray(parsed.subtopics)) {
    throw new Error("Diagnosis output missing 'subtopics' array");
  }

  // Normalize subtopics
  const subtopics: DiagnosisSubtopic[] = parsed.subtopics.map(
    (st: Record<string, unknown>) => ({
      key: String(st.key || ""),
      name: String(st.name || ""),
      fields: normalizeFields(st.fields as Record<string, unknown> | undefined),
    })
  );

  // Warn if subtopics don't match expected keys (not a hard error — LLM may reorder)
  const receivedKeys = new Set(subtopics.map((st) => st.key));
  const missingKeys = expectedSubtopicKeys.filter((k) => !receivedKeys.has(k));
  if (missingKeys.length > 0) {
    console.warn(
      `[diagnosis-job] Warning: Missing subtopics in output: ${missingKeys.join(", ")}`
    );
  }

  return {
    block_key: parsed.block_key || blockKey,
    block_title: parsed.block_title || blockTitle,
    subtopics,
  };
}

/**
 * Normalize field values — ensure correct types for enum/number fields.
 */
function normalizeFields(
  fields: Record<string, unknown> | undefined
): Record<string, string | number | null> {
  if (!fields) return {};

  const result: Record<string, string | number | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (typeof value === "number") {
      result[key] = value;
    } else {
      result[key] = String(value);
    }
  }

  // Ensure numeric fields are actually numbers
  for (const numKey of ["reifegrad", "risiko", "hebel"]) {
    if (result[numKey] !== null && result[numKey] !== undefined) {
      const num = Number(result[numKey]);
      result[numKey] = isNaN(num) ? null : Math.max(0, Math.min(10, num));
    }
  }

  return result;
}
