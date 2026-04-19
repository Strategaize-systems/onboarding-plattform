// SOP Generation Job Handler
// Generates a Standard Operating Procedure from Knowledge Units via Bedrock.
// 1. Load block checkpoint + KUs + template.sop_prompt
// 2. Build SOP prompt
// 3. Bedrock call
// 4. Parse + validate JSON output
// 5. Persist via rpc_create_sop
// 6. Log costs to ai_cost_ledger (feature='sop')
// 7. Mark job as completed

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import { buildSopSystemPrompt, buildSopUserPrompt } from "./sop-prompt";
import type { SopContent, SopPromptConfig } from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Bedrock Claude pricing (eu-central-1, Sonnet)
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

export async function handleSopJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(`[sop-job] Processing job ${job.id} for tenant ${job.tenant_id}`);

  // 1. Extract payload
  const checkpointId = job.payload.block_checkpoint_id as string;
  const blockKey = job.payload.block_key as string;
  const sessionId = job.payload.session_id as string;

  if (!checkpointId || !blockKey || !sessionId) {
    throw new Error(
      "SOP job payload missing required fields (block_checkpoint_id, block_key, session_id)"
    );
  }

  // 2. Load checkpoint for quality_report
  const { data: checkpoint, error: cpError } = await adminClient
    .from("block_checkpoint")
    .select("quality_report")
    .eq("id", checkpointId)
    .single();

  if (cpError) {
    throw new Error(`Failed to load checkpoint ${checkpointId}: ${cpError.message}`);
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
    throw new Error(`No knowledge units found for block ${blockKey} — cannot generate SOP`);
  }

  console.log(`[sop-job] ${knowledgeUnits.length} KUs loaded for block ${blockKey}`);

  // 4. Load template for sop_prompt + block title
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
    .select("blocks, sop_prompt")
    .eq("id", session.template_id)
    .single();

  const blocks = (template?.blocks ?? []) as Array<{
    key: string;
    title: Record<string, string> | string;
  }>;
  const blockDef = blocks.find((b) => b.key === blockKey);
  const blockTitle =
    typeof blockDef?.title === "object"
      ? blockDef.title.de ?? blockDef.title.en ?? blockKey
      : blockDef?.title ?? blockKey;

  const sopPromptConfig = template?.sop_prompt as SopPromptConfig | null;

  // 5. Build prompts
  const systemPrompt = buildSopSystemPrompt(sopPromptConfig);
  const userPrompt = buildSopUserPrompt({
    blockKey,
    blockTitle,
    knowledgeUnits,
    qualityReport: checkpoint?.quality_report as
      | { overall_score?: string | number; recommendation?: string }
      | null,
    sopPromptConfig: sopPromptConfig,
  });

  // 6. Bedrock call
  console.log(`[sop-job] Calling Bedrock for SOP generation...`);
  const callStart = Date.now();

  const rawResponse = await chatWithLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.4, maxTokens: 4096 }
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
    `[sop-job] Bedrock responded in ${callDuration}ms ` +
      `(~${estimatedInputTokens} in, ~${estimatedOutputTokens} out, ~$${estimatedCost.toFixed(4)})`
  );

  // 7. Parse JSON output
  const sopContent = parseSopOutput(rawResponse);

  // 8. Persist via RPC
  const { data: createResult, error: createError } = await adminClient.rpc(
    "rpc_create_sop",
    {
      p_session_id: sessionId,
      p_block_key: blockKey,
      p_checkpoint_id: checkpointId,
      p_content: sopContent,
      p_model: MODEL_ID,
      p_cost: estimatedCost,
    }
  );

  if (createError) {
    throw new Error(`Failed to create SOP: ${createError.message}`);
  }

  const sopId = (createResult as { sop_id?: string })?.sop_id;
  console.log(`[sop-job] SOP created: ${sopId}`);

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
      role: "sop_generator",
      feature: "sop",
    });
  } catch (costErr) {
    captureException(costErr, {
      source: "sop-job",
      metadata: { jobId: job.id, action: "log-costs" },
    });
  }

  // 10. Mark job as completed
  const { error: completeError } = await adminClient.rpc("rpc_complete_ai_job", {
    p_job_id: job.id,
  });

  if (completeError) {
    throw new Error(`Failed to complete SOP job: ${completeError.message}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[sop-job] Job ${job.id} completed in ${totalDuration}ms ` +
      `(${sopContent.steps.length} steps, ~$${estimatedCost.toFixed(4)})`
  );
}

/**
 * Parse SOP JSON from LLM response.
 * Handles markdown code fences and validates required fields.
 */
function parseSopOutput(raw: string): SopContent {
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

  // Validate required fields
  if (!parsed.title || typeof parsed.title !== "string") {
    throw new Error("SOP output missing 'title'");
  }
  if (!parsed.objective || typeof parsed.objective !== "string") {
    throw new Error("SOP output missing 'objective'");
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("SOP output missing or empty 'steps'");
  }

  return {
    title: parsed.title,
    objective: parsed.objective,
    prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites : [],
    steps: parsed.steps.map((s: Record<string, unknown>, i: number) => ({
      number: typeof s.number === "number" ? s.number : i + 1,
      action: String(s.action || ""),
      responsible: String(s.responsible || ""),
      timeframe: String(s.timeframe || ""),
      success_criterion: String(s.success_criterion || ""),
      dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
    })),
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    fallbacks: Array.isArray(parsed.fallbacks) ? parsed.fallbacks : [],
  };
}
