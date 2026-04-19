// Complete Job Handler — Orchestrates the condensation pipeline for one job.
// 1. Load block checkpoint + template
// 2. Extract answers + block definition
// 3. Run iteration loop (Analyst→Challenger)
// 4. Persist Knowledge Units via RPC
// 5. Embed Knowledge Units for semantic search (fire-and-forget)
// 6. Run orchestrator assessment (quality report + gap detection)
// 7. Log costs and iterations
// 8. Mark job as completed

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "./claim-loop";
import { runIterationLoop } from "./iteration-loop";
import { embedKnowledgeUnits } from "./embed-knowledge-units";
import { runOrchestratorAssessment } from "./orchestrator";
import type {
  BlockAnswer,
  BlockDefinition,
  IterationResult,
} from "./types";

/**
 * Handle a single knowledge_unit_condensation job.
 * Called by the claim loop after successfully claiming a job.
 */
export async function handleCondensationJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(`[handle-job] Processing job ${job.id} for tenant ${job.tenant_id}`);

  // 1. Load block checkpoint
  const checkpointId = job.payload.block_checkpoint_id as string;
  if (!checkpointId) {
    throw new Error("Job payload missing block_checkpoint_id");
  }

  const { data: checkpoint, error: cpError } = await adminClient
    .from("block_checkpoint")
    .select("id, tenant_id, capture_session_id, block_key, content, checkpoint_type")
    .eq("id", checkpointId)
    .single();

  if (cpError || !checkpoint) {
    throw new Error(`Failed to load checkpoint ${checkpointId}: ${cpError?.message}`);
  }

  console.log(`[handle-job] Checkpoint loaded: block=${checkpoint.block_key}, session=${checkpoint.capture_session_id}`);

  // 2. Load template for this session
  const { data: session, error: sessError } = await adminClient
    .from("capture_session")
    .select("template_id, template_version")
    .eq("id", checkpoint.capture_session_id)
    .single();

  if (sessError || !session) {
    throw new Error(`Failed to load session ${checkpoint.capture_session_id}: ${sessError?.message}`);
  }

  const { data: template, error: tmplError } = await adminClient
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  if (tmplError || !template) {
    throw new Error(`Failed to load template ${session.template_id}: ${tmplError?.message}`);
  }

  // 3. Extract block definition and answers
  const blocks = template.blocks as Array<Record<string, unknown>>;
  const blockDef = blocks.find(
    (b) => (b.key as string) === checkpoint.block_key
  );

  if (!blockDef) {
    throw new Error(`Block "${checkpoint.block_key}" not found in template`);
  }

  const block: BlockDefinition = {
    key: blockDef.key as string,
    title: (blockDef.title as string) || checkpoint.block_key,
    description: blockDef.description as string | undefined,
    questions: Array.isArray(blockDef.questions)
      ? (blockDef.questions as Array<Record<string, unknown>>).map((q) => ({
          id: String(q.id || ""),
          text: String(q.text || q.fragetext || ""),
          subtopic: q.subtopic
            ? String(q.subtopic)
            : q.unterbereich
              ? String(q.unterbereich)
              : undefined,
          flags: Array.isArray(q.flags) ? (q.flags as string[]) : undefined,
        }))
      : [],
  };

  // Extract answers from checkpoint content
  const content = checkpoint.content as Record<string, unknown>;
  const answers = extractAnswers(content, block);

  const knownQuestionIds = block.questions.map((q) => q.id);

  console.log(
    `[handle-job] Block ${block.key}: ${block.questions.length} questions, ` +
      `${answers.length} answers with content`
  );

  // 4. Run iteration loop
  const result = await runIterationLoop({
    blockKey: checkpoint.block_key,
    block,
    answers,
    knownQuestionIds,
    onIterationComplete: async (iterResult: IterationResult) => {
      // Log each iteration to ai_iterations_log
      await logIteration(adminClient, job.id, iterResult);
    },
  });

  console.log(
    `[handle-job] Loop completed: ${result.total_iterations} iterations, ` +
      `verdict=${result.final_verdict}, ${result.debrief_items.length} items`
  );

  // 5. Persist Knowledge Units via RPC
  if (result.debrief_items.length > 0) {
    const kuPayload = result.debrief_items.map((item) => ({
      tenant_id: checkpoint.tenant_id,
      capture_session_id: checkpoint.capture_session_id,
      block_checkpoint_id: checkpoint.id,
      block_key: checkpoint.block_key,
      unit_type: item.unit_type,
      source: "ai_draft",
      title: item.title,
      body: buildKuBody(item),
      confidence: item.confidence,
      evidence_refs: item.evidence_refs,
    }));

    const { data: importResult, error: importError } = await adminClient.rpc(
      "rpc_bulk_import_knowledge_units",
      { p_units: kuPayload }
    );

    if (importError) {
      throw new Error(`Failed to import KUs: ${importError.message}`);
    }

    const importedIds = ((importResult as Record<string, unknown>)?.ids as string[]) || [];
    console.log(
      `[handle-job] Imported ${(importResult as Record<string, unknown>)?.inserted_count || 0} knowledge units`
    );

    // 5b. Embed KUs for semantic search (fire-and-forget)
    if (importedIds.length > 0) {
      embedKnowledgeUnits(importedIds, job.tenant_id, job.id).catch((err) => {
        captureException(err, {
          source: "handle-job",
          metadata: { jobId: job.id, action: "embed-knowledge-units" },
        });
      });
    }
  }

  // 6. Run orchestrator assessment
  try {
    const orchestratorResult = await runOrchestratorAssessment({
      adminClient,
      job,
      checkpointId: checkpoint.id,
      block,
      answers,
      debriefItems: result.debrief_items,
    });

    console.log(
      `[handle-job] Orchestrator: score=${orchestratorResult.quality_report.overall_score}, ` +
        `recommendation=${orchestratorResult.quality_report.recommendation}, ` +
        `gaps=${orchestratorResult.quality_report.gap_questions.length}`
    );
  } catch (err) {
    // Orchestrator failure is non-fatal — KUs are already persisted
    captureException(err, {
      source: "handle-job",
      metadata: { jobId: job.id, action: "orchestrator-assessment" },
    });
    console.error(`[handle-job] Orchestrator failed (non-fatal): ${err}`);
  }

  // 7. Log costs
  await logCosts(adminClient, job, result);

  // 8. Mark job as completed
  const { error: completeError } = await adminClient.rpc("rpc_complete_ai_job", {
    p_job_id: job.id,
  });

  if (completeError) {
    throw new Error(`Failed to complete job: ${completeError.message}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[handle-job] Job ${job.id} completed in ${totalDuration}ms ` +
      `(${result.total_iterations} iterations, ` +
      `${result.debrief_items.length} KUs, ` +
      `$${result.total_cost.usd_cost.toFixed(4)})`
  );
}

/**
 * Extract answers from checkpoint content.
 * Supports both flat format {questionId: answerText} and structured format.
 */
function extractAnswers(
  content: Record<string, unknown>,
  block: BlockDefinition
): BlockAnswer[] {
  const answers: BlockAnswer[] = [];

  // Try structured format: { answers: [{question_id, answer_text}] }
  if (Array.isArray(content.answers)) {
    for (const a of content.answers as Array<Record<string, unknown>>) {
      const questionId = String(a.question_id || a.questionId || "");
      const answerText = String(a.answer_text || a.answerText || a.text || "");
      if (questionId && answerText.trim()) {
        const question = block.questions.find((q) => q.id === questionId);
        answers.push({
          question_id: questionId,
          question_text: question?.text || "",
          answer_text: answerText,
          subtopic: question?.subtopic,
          block_key: block.key,
        });
      }
    }
    return answers;
  }

  // Try flat format: {questionId: answerText} or nested in a block key
  const flatData = (content[block.key] as Record<string, unknown>) || content;
  for (const question of block.questions) {
    const answerText = flatData[question.id];
    if (typeof answerText === "string" && answerText.trim()) {
      answers.push({
        question_id: question.id,
        question_text: question.text,
        answer_text: answerText,
        subtopic: question.subtopic,
        block_key: block.key,
      });
    }
  }

  return answers;
}

/**
 * Build the KU body text from a debrief item.
 * Includes current_state, target_state, scores, and recommendation.
 */
function buildKuBody(item: {
  current_state: string;
  target_state: string;
  body: string;
  maturity: number;
  risk: number;
  leverage: number;
  priority: string;
  traffic_light: string;
  recommendation: string;
  next_step: string;
  owner: string;
  effort: string;
}): string {
  const lines: string[] = [];

  if (item.body) {
    lines.push(item.body);
    lines.push("");
  }

  lines.push(`**Ist-Zustand:** ${item.current_state}`);
  lines.push(`**Soll-Zustand:** ${item.target_state}`);
  lines.push("");
  lines.push(
    `**Scores:** Maturity ${item.maturity}/10 | Risk ${item.risk}/10 | Leverage ${item.leverage}/10`
  );
  lines.push(
    `**Priorität:** ${item.priority} | **Ampel:** ${item.traffic_light} | **Aufwand:** ${item.effort}`
  );
  lines.push("");
  lines.push(`**Empfehlung:** ${item.recommendation}`);
  lines.push(`**Nächster Schritt:** ${item.next_step}`);
  lines.push(`**Verantwortlich:** ${item.owner}`);

  return lines.join("\n");
}

/**
 * Log iteration data to ai_iterations_log.
 */
async function logIteration(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string,
  iterResult: IterationResult
): Promise<void> {
  try {
    // Log analyst step
    await adminClient.from("ai_iterations_log").insert({
      job_id: jobId,
      iteration_number: iterResult.iteration,
      role: "analyst",
      prompt_tokens: iterResult.analyst_cost.tokens_in,
      completion_tokens: iterResult.analyst_cost.tokens_out,
      duration_ms: iterResult.analyst_cost.duration_ms,
      subtopic_coverage: iterResult.analyst_output.debrief_items.length,
      metadata: {
        items_count: iterResult.analyst_output.debrief_items.length,
        ko_count: iterResult.analyst_output.ko_assessment.length,
      },
    });

    // Log challenger step
    await adminClient.from("ai_iterations_log").insert({
      job_id: jobId,
      iteration_number: iterResult.iteration,
      role: "challenger",
      verdict: iterResult.verdict,
      findings_count: iterResult.challenger_output.statistics.total_findings,
      prompt_tokens: iterResult.challenger_cost.tokens_in,
      completion_tokens: iterResult.challenger_cost.tokens_out,
      duration_ms: iterResult.challenger_cost.duration_ms,
      subtopic_coverage: parseInt(
        iterResult.challenger_output.statistics.subtopic_coverage.split("/")[0] || "0",
        10
      ),
      metadata: {
        critical: iterResult.challenger_output.statistics.critical,
        major: iterResult.challenger_output.statistics.major,
        minor: iterResult.challenger_output.statistics.minor,
      },
    });
  } catch (err) {
    captureException(err, {
      source: "handle-job",
      metadata: { jobId, iteration: iterResult.iteration, action: "log-iteration" },
    });
  }
}

/**
 * Log total costs to ai_cost_ledger.
 */
async function logCosts(
  adminClient: ReturnType<typeof createAdminClient>,
  job: ClaimedJob,
  result: { iteration_log: IterationResult[]; total_cost: { model_id: string } }
): Promise<void> {
  try {
    const costEntries = result.iteration_log.flatMap((iter) => [
      {
        tenant_id: job.tenant_id,
        job_id: job.id,
        model_id: iter.analyst_cost.model_id,
        tokens_in: iter.analyst_cost.tokens_in,
        tokens_out: iter.analyst_cost.tokens_out,
        usd_cost: iter.analyst_cost.usd_cost,
        duration_ms: iter.analyst_cost.duration_ms,
        iteration: iter.iteration,
        role: "analyst",
      },
      {
        tenant_id: job.tenant_id,
        job_id: job.id,
        model_id: iter.challenger_cost.model_id,
        tokens_in: iter.challenger_cost.tokens_in,
        tokens_out: iter.challenger_cost.tokens_out,
        usd_cost: iter.challenger_cost.usd_cost,
        duration_ms: iter.challenger_cost.duration_ms,
        iteration: iter.iteration,
        role: "challenger",
      },
    ]);

    const { error } = await adminClient.from("ai_cost_ledger").insert(costEntries);
    if (error) {
      captureException(new Error(`Failed to log costs: ${error.message}`), {
        source: "handle-job",
        metadata: { jobId: job.id },
      });
    }
  } catch (err) {
    captureException(err, {
      source: "handle-job",
      metadata: { jobId: job.id, action: "log-costs" },
    });
  }
}
