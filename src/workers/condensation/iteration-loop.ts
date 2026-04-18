// Iteration Loop — Orchestrates Analyst→Challenger iterations
// Ported from OS blueprint-loop SKILL.md convergence logic.
// Runs 2-8 iterations until ACCEPTED or max reached.

import { chatWithLLM } from "../../lib/llm";
import { buildAnalystPrompt } from "./analyst-prompt";
import { buildChallengerPrompt } from "./challenger-prompt";
import { parseAnalystOutput, parseChallengerOutput } from "./parse-output";
import type {
  AnalystOutput,
  BlockAnswer,
  BlockDefinition,
  CallCost,
  ChallengerOutput,
  ChallengerVerdict,
  CondensationResult,
  IterationResult,
} from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Bedrock Claude pricing (eu-central-1, Sonnet)
// Input: $3/MTok, Output: $15/MTok
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

interface IterationLoopParams {
  blockKey: string;
  block: BlockDefinition;
  answers: BlockAnswer[];
  knownQuestionIds: string[];
  minIterations?: number;
  maxIterations?: number;
  onIterationComplete?: (result: IterationResult) => Promise<void>;
}

/**
 * Run the Analyst→Challenger iteration loop.
 * Returns the final condensation result with all iteration data.
 */
export async function runIterationLoop(
  params: IterationLoopParams
): Promise<CondensationResult> {
  const {
    blockKey,
    block,
    answers,
    knownQuestionIds,
    minIterations = parseInt(process.env.AI_MIN_ITERATIONS || "2", 10),
    maxIterations = parseInt(process.env.AI_MAX_ITERATIONS || "8", 10),
    onIterationComplete,
  } = params;

  const iterationLog: IterationResult[] = [];
  let lastAnalystOutput: AnalystOutput | null = null;
  let lastChallengerOutput: ChallengerOutput | null = null;
  let finalVerdict: ChallengerVerdict | "MAX_ITERATIONS_REACHED" = "NEEDS_REVISION";
  const totalCost: CallCost = {
    model_id: MODEL_ID,
    tokens_in: 0,
    tokens_out: 0,
    usd_cost: 0,
    duration_ms: 0,
  };

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`[iteration-loop] Starting iteration ${iteration}/${maxIterations}`);

    // --- Step A: Analyst ---
    const analystStart = Date.now();
    const analystPrompt = buildAnalystPrompt({
      block,
      answers,
      iteration,
      challengerFeedback: lastChallengerOutput ?? undefined,
    });

    const analystRaw = await chatWithLLM(
      [
        { role: "system", content: analystPrompt.system },
        { role: "user", content: analystPrompt.user },
      ],
      { temperature: 0.3, maxTokens: 8192 }
    );

    const analystDuration = Date.now() - analystStart;
    const analystTokensEst = estimateTokens(analystPrompt.system + analystPrompt.user, analystRaw);
    const analystCost = buildCost(analystTokensEst, analystDuration);

    // Parse analyst output
    const { output: analystOutput, warnings: analystWarnings } =
      parseAnalystOutput(analystRaw, blockKey, knownQuestionIds);

    if (analystWarnings.length > 0) {
      console.log(`[iteration-loop] Analyst warnings (iter ${iteration}):`, analystWarnings);
    }

    lastAnalystOutput = analystOutput;

    // --- Step B: Challenger ---
    const challengerStart = Date.now();
    const challengerPrompt = buildChallengerPrompt({
      block,
      answers,
      analystOutput,
      iteration,
    });

    const challengerRaw = await chatWithLLM(
      [
        { role: "system", content: challengerPrompt.system },
        { role: "user", content: challengerPrompt.user },
      ],
      { temperature: 0.3, maxTokens: 4096 }
    );

    const challengerDuration = Date.now() - challengerStart;
    const challengerTokensEst = estimateTokens(
      challengerPrompt.system + challengerPrompt.user,
      challengerRaw
    );
    const challengerCost = buildCost(challengerTokensEst, challengerDuration);

    // Parse challenger output
    const { output: challengerOutput, warnings: challengerWarnings } =
      parseChallengerOutput(challengerRaw);

    if (challengerWarnings.length > 0) {
      console.log(`[iteration-loop] Challenger warnings (iter ${iteration}):`, challengerWarnings);
    }

    lastChallengerOutput = challengerOutput;

    // Build iteration result
    const iterResult: IterationResult = {
      iteration,
      analyst_output: analystOutput,
      challenger_output: challengerOutput,
      analyst_cost: analystCost,
      challenger_cost: challengerCost,
      verdict: challengerOutput.verdict,
    };

    iterationLog.push(iterResult);

    // Accumulate costs
    totalCost.tokens_in += analystCost.tokens_in + challengerCost.tokens_in;
    totalCost.tokens_out += analystCost.tokens_out + challengerCost.tokens_out;
    totalCost.usd_cost += analystCost.usd_cost + challengerCost.usd_cost;
    totalCost.duration_ms += analystCost.duration_ms + challengerCost.duration_ms;

    // Callback for logging
    if (onIterationComplete) {
      await onIterationComplete(iterResult);
    }

    console.log(
      `[iteration-loop] Iteration ${iteration}: verdict=${challengerOutput.verdict}, ` +
        `findings=${challengerOutput.statistics.total_findings} ` +
        `(critical=${challengerOutput.statistics.critical}, major=${challengerOutput.statistics.major})`
    );

    // --- Step C: Convergence Check ---
    if (iteration < minIterations) {
      console.log(`[iteration-loop] Below min iterations (${minIterations}), continuing`);
      continue;
    }

    if (
      challengerOutput.verdict === "ACCEPTED" ||
      challengerOutput.verdict === "ACCEPTED_WITH_NOTES"
    ) {
      finalVerdict = challengerOutput.verdict;
      console.log(`[iteration-loop] Converged at iteration ${iteration}: ${finalVerdict}`);
      break;
    }

    if (iteration === maxIterations) {
      finalVerdict = "MAX_ITERATIONS_REACHED";
      console.log(`[iteration-loop] Max iterations reached (${maxIterations}), using best result`);
    }
  }

  return {
    block_key: blockKey,
    total_iterations: iterationLog.length,
    final_verdict: finalVerdict,
    debrief_items: lastAnalystOutput?.debrief_items ?? [],
    ko_assessment: lastAnalystOutput?.ko_assessment ?? [],
    sop_gaps: lastAnalystOutput?.sop_gaps ?? [],
    cross_block_observations: lastAnalystOutput?.cross_block_observations ?? [],
    iteration_log: iterationLog,
    total_cost: totalCost,
  };
}

/**
 * Rough token estimation based on character count.
 * ~4 chars per token for German text.
 * Used for cost tracking; actual token counts come from Bedrock usage metadata.
 */
function estimateTokens(
  input: string,
  output: string
): { input: number; output: number } {
  return {
    input: Math.ceil(input.length / 4),
    output: Math.ceil(output.length / 4),
  };
}

function buildCost(
  tokens: { input: number; output: number },
  durationMs: number
): CallCost {
  return {
    model_id: MODEL_ID,
    tokens_in: tokens.input,
    tokens_out: tokens.output,
    usd_cost:
      tokens.input * COST_PER_INPUT_TOKEN +
      tokens.output * COST_PER_OUTPUT_TOKEN,
    duration_ms: durationMs,
  };
}
