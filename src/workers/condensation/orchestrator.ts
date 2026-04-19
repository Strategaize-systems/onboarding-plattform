// Orchestrator Module — runs the meta-assessment after the A+C loop.
// 1. Builds prompt from KU results + original answers
// 2. Calls Bedrock
// 3. Parses orchestrator output
// 4. Saves quality_report on block_checkpoint
// 5. Logs cost to ai_cost_ledger (feature='orchestrator')
// 6. Logs orchestrator step to ai_iterations_log

import { chatWithLLM } from "../../lib/llm";
import { buildOrchestratorPrompt } from "./orchestrator-prompt";
import { parseOrchestratorOutput } from "./parse-output";
import type { ClaimedJob } from "./claim-loop";
import type {
  AnalystDebriefItem,
  BlockAnswer,
  BlockDefinition,
  CallCost,
  OrchestratorOutput,
} from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Bedrock Claude pricing (eu-central-1, Sonnet)
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

interface OrchestratorParams {
  adminClient: ReturnType<typeof import("../../lib/supabase/admin").createAdminClient>;
  job: ClaimedJob;
  checkpointId: string;
  block: BlockDefinition;
  answers: BlockAnswer[];
  debriefItems: AnalystDebriefItem[];
}

interface OrchestratorResult {
  quality_report: OrchestratorOutput;
  cost: CallCost;
}

/**
 * Run the orchestrator assessment on completed KU results.
 * Saves quality_report to block_checkpoint and logs costs.
 */
export async function runOrchestratorAssessment(
  params: OrchestratorParams
): Promise<OrchestratorResult> {
  const { adminClient, job, checkpointId, block, answers, debriefItems } = params;

  console.log(`[orchestrator] Starting assessment for checkpoint ${checkpointId}`);

  // 1. Build prompt
  const prompt = buildOrchestratorPrompt({ block, answers, debriefItems });

  // 2. Call Bedrock
  const startTime = Date.now();
  const rawOutput = await chatWithLLM(
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    { temperature: 0.2, maxTokens: 4096 }
  );
  const duration = Date.now() - startTime;

  // 3. Parse output
  const { output, warnings } = parseOrchestratorOutput(rawOutput);

  if (warnings.length > 0) {
    console.log(`[orchestrator] Warnings:`, warnings);
  }

  // 4. Calculate cost
  const tokensIn = Math.ceil((prompt.system.length + prompt.user.length) / 4);
  const tokensOut = Math.ceil(rawOutput.length / 4);
  const cost: CallCost = {
    model_id: MODEL_ID,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    usd_cost: tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN,
    duration_ms: duration,
  };

  // 5. Save quality_report on block_checkpoint
  const { error: updateError } = await adminClient
    .from("block_checkpoint")
    .update({ quality_report: output })
    .eq("id", checkpointId);

  if (updateError) {
    throw new Error(`Failed to save quality_report: ${updateError.message}`);
  }

  console.log(
    `[orchestrator] quality_report saved (score=${output.overall_score}, ` +
      `recommendation=${output.recommendation})`
  );

  // 6. Log cost to ai_cost_ledger
  try {
    await adminClient.from("ai_cost_ledger").insert({
      tenant_id: job.tenant_id,
      job_id: job.id,
      model_id: cost.model_id,
      tokens_in: cost.tokens_in,
      tokens_out: cost.tokens_out,
      usd_cost: cost.usd_cost,
      duration_ms: cost.duration_ms,
      role: "orchestrator",
      feature: "orchestrator",
    });
  } catch (err) {
    console.error(`[orchestrator] Failed to log cost (non-fatal):`, err);
  }

  // 7. Log orchestrator step to ai_iterations_log
  try {
    await adminClient.from("ai_iterations_log").insert({
      job_id: job.id,
      iteration_number: 0, // orchestrator runs once, after all iterations
      role: "orchestrator",
      verdict: output.recommendation,
      findings_count: output.gap_questions.length,
      prompt_tokens: cost.tokens_in,
      completion_tokens: cost.tokens_out,
      duration_ms: cost.duration_ms,
      metadata: {
        overall_score: output.overall_score,
        coverage_ratio: output.coverage.coverage_ratio,
        evidence_score: output.evidence_quality.score,
        consistency_score: output.consistency.score,
        gap_count: output.gap_questions.length,
        recommendation: output.recommendation,
      },
    });
  } catch (err) {
    console.error(`[orchestrator] Failed to log iteration (non-fatal):`, err);
  }

  return { quality_report: output, cost };
}
