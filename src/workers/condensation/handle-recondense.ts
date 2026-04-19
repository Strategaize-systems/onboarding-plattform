// Re-Condensation Job Handler — processes recondense_with_gaps jobs.
// 1. Load original checkpoint + gap answers
// 2. Build extended input (original answers + gap answers)
// 3. Run A+C loop with extended input
// 4. Create new block_checkpoint (type=backspelling_recondense)
// 5. Import new KUs + embed
// 6. Run orchestrator
// 7. If further gaps AND round < 2: create new gap_questions
// 8. If round >= 2: log meeting_agenda recommendation
// 9. Mark original gap_questions as recondensed

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
 * Handle a recondense_with_gaps job.
 * Re-runs A+C+Orchestrator with original answers + gap answers as extended input.
 */
export async function handleRecondenseJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();
  const payload = job.payload;

  const originalCheckpointId = payload.block_checkpoint_id as string;
  const gapQuestionIds = (payload.gap_question_ids as string[]) || [];

  console.log(
    `[handle-recondense] Processing job ${job.id}: checkpoint=${originalCheckpointId}, ` +
      `gaps=${gapQuestionIds.length}`
  );

  // 1. Load original checkpoint
  const { data: checkpoint, error: cpError } = await adminClient
    .from("block_checkpoint")
    .select("id, tenant_id, capture_session_id, block_key, content, created_by")
    .eq("id", originalCheckpointId)
    .single();

  if (cpError || !checkpoint) {
    throw new Error(`Failed to load checkpoint ${originalCheckpointId}: ${cpError?.message}`);
  }

  // 2. Load template
  const { data: session } = await adminClient
    .from("capture_session")
    .select("template_id, template_version")
    .eq("id", checkpoint.capture_session_id)
    .single();

  if (!session) {
    throw new Error(`Failed to load session ${checkpoint.capture_session_id}`);
  }

  const { data: template } = await adminClient
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  if (!template) {
    throw new Error(`Failed to load template ${session.template_id}`);
  }

  // 3. Extract block definition
  const blocks = template.blocks as Array<Record<string, unknown>>;
  const blockDef = blocks.find((b) => (b.key as string) === checkpoint.block_key);
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

  // 4. Extract original answers
  const content = checkpoint.content as Record<string, unknown>;
  const originalAnswers = extractOriginalAnswers(content, block);

  // 5. Load gap answers
  const { data: gapQuestions } = await adminClient
    .from("gap_question")
    .select("id, question_text, answer_text, subtopic, backspelling_round")
    .in("id", gapQuestionIds)
    .eq("status", "answered");

  const currentRound = gapQuestions?.[0]?.backspelling_round ?? 1;

  // Build extended answers: original + gap answers as synthetic Q&A
  const gapAnswers: BlockAnswer[] = (gapQuestions || []).map((g) => ({
    question_id: `gap_${g.id.substring(0, 8)}`,
    question_text: g.question_text,
    answer_text: g.answer_text || "",
    subtopic: g.subtopic || undefined,
    block_key: block.key,
  }));

  const allAnswers = [...originalAnswers, ...gapAnswers];
  const knownQuestionIds = [
    ...block.questions.map((q) => q.id),
    ...gapAnswers.map((g) => g.question_id),
  ];

  console.log(
    `[handle-recondense] Block ${block.key}: ${originalAnswers.length} original + ` +
      `${gapAnswers.length} gap answers, round=${currentRound}`
  );

  // 6. Run A+C loop with extended input
  const result = await runIterationLoop({
    blockKey: checkpoint.block_key,
    block,
    answers: allAnswers,
    knownQuestionIds,
    onIterationComplete: async (iterResult: IterationResult) => {
      await logIteration(adminClient, job.id, iterResult);
    },
  });

  console.log(
    `[handle-recondense] Loop completed: ${result.total_iterations} iterations, ` +
      `${result.debrief_items.length} items`
  );

  // 7. Create new block_checkpoint (backspelling_recondense)
  const recondenseContent = {
    ...content,
    gap_answers: (gapQuestions || []).map((g) => ({
      gap_id: g.id,
      question: g.question_text,
      answer: g.answer_text,
      subtopic: g.subtopic,
    })),
    backspelling_round: currentRound,
  };

  const contentHash = simpleHash(JSON.stringify(recondenseContent));

  const { data: newCheckpoint, error: cpCreateError } = await adminClient
    .from("block_checkpoint")
    .insert({
      tenant_id: checkpoint.tenant_id,
      capture_session_id: checkpoint.capture_session_id,
      block_key: checkpoint.block_key,
      checkpoint_type: "backspelling_recondense",
      content: recondenseContent,
      content_hash: contentHash,
      created_by: checkpoint.created_by as string,
    })
    .select("id")
    .single();

  if (cpCreateError || !newCheckpoint) {
    throw new Error(`Failed to create recondense checkpoint: ${cpCreateError?.message}`);
  }

  console.log(`[handle-recondense] New checkpoint created: ${newCheckpoint.id}`);

  // 8. Import KUs on new checkpoint
  if (result.debrief_items.length > 0) {
    const kuPayload = result.debrief_items.map((item) => ({
      tenant_id: checkpoint.tenant_id,
      capture_session_id: checkpoint.capture_session_id,
      block_checkpoint_id: newCheckpoint.id,
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
      throw new Error(`Failed to import recondensed KUs: ${importError.message}`);
    }

    const importedIds = ((importResult as Record<string, unknown>)?.ids as string[]) || [];
    if (importedIds.length > 0) {
      embedKnowledgeUnits(importedIds, job.tenant_id, job.id).catch((err) => {
        captureException(err, {
          source: "handle-recondense",
          metadata: { jobId: job.id, action: "embed-knowledge-units" },
        });
      });
    }
  }

  // 9. Run orchestrator on new checkpoint
  try {
    const orchestratorResult = await runOrchestratorAssessment({
      adminClient,
      job,
      checkpointId: newCheckpoint.id,
      block,
      answers: allAnswers,
      debriefItems: result.debrief_items,
    });

    // 9b. Handle gap questions from re-assessment
    const newGaps = orchestratorResult.quality_report.gap_questions;
    if (newGaps.length > 0 && currentRound < 2) {
      // Round < 2: create new gaps for another backspelling round
      const gapsPayload = newGaps.map((g) => ({
        question_text: g.question_text,
        context: g.context,
        subtopic: g.subtopic,
        priority: g.priority,
        related_ku_title: g.related_ku_title || null,
      }));

      await adminClient.rpc("rpc_create_gap_questions", {
        p_checkpoint_id: newCheckpoint.id,
        p_gaps: gapsPayload,
      });

      console.log(
        `[handle-recondense] Round ${currentRound} → ${newGaps.length} new gaps created ` +
          `(round ${currentRound + 1} available)`
      );
    } else if (newGaps.length > 0 && currentRound >= 2) {
      // Round >= 2: max reached, remaining gaps become meeting agenda
      console.log(
        `[handle-recondense] Round ${currentRound} reached max. ` +
          `${newGaps.length} remaining gaps → meeting agenda`
      );
    }
  } catch (err) {
    captureException(err, {
      source: "handle-recondense",
      metadata: { jobId: job.id, action: "orchestrator-assessment" },
    });
  }

  // 10. Mark original gap questions as recondensed
  if (gapQuestionIds.length > 0) {
    await adminClient
      .from("gap_question")
      .update({ status: "recondensed" })
      .in("id", gapQuestionIds);
  }

  // 11. Log costs
  await logCosts(adminClient, job, result);

  // 12. Mark job as completed
  const { error: completeError } = await adminClient.rpc("rpc_complete_ai_job", {
    p_job_id: job.id,
  });

  if (completeError) {
    throw new Error(`Failed to complete job: ${completeError.message}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[handle-recondense] Job ${job.id} completed in ${totalDuration}ms ` +
      `(round=${currentRound}, ${result.debrief_items.length} KUs)`
  );
}

// --- Helper functions (shared patterns from handle-job.ts) ---

function extractOriginalAnswers(
  content: Record<string, unknown>,
  block: BlockDefinition
): BlockAnswer[] {
  const answers: BlockAnswer[] = [];

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
    lines.push(item.body, "");
  }
  lines.push(`**Ist-Zustand:** ${item.current_state}`);
  lines.push(`**Soll-Zustand:** ${item.target_state}`);
  lines.push("");
  lines.push(`**Scores:** Maturity ${item.maturity}/10 | Risk ${item.risk}/10 | Leverage ${item.leverage}/10`);
  lines.push(`**Priorität:** ${item.priority} | **Ampel:** ${item.traffic_light} | **Aufwand:** ${item.effort}`);
  lines.push("");
  lines.push(`**Empfehlung:** ${item.recommendation}`);
  lines.push(`**Nächster Schritt:** ${item.next_step}`);
  lines.push(`**Verantwortlich:** ${item.owner}`);
  return lines.join("\n");
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function logIteration(
  adminClient: ReturnType<typeof import("../../lib/supabase/admin").createAdminClient>,
  jobId: string,
  iterResult: IterationResult
): Promise<void> {
  try {
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
      source: "handle-recondense",
      metadata: { jobId, iteration: iterResult.iteration },
    });
  }
}

async function logCosts(
  adminClient: ReturnType<typeof import("../../lib/supabase/admin").createAdminClient>,
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
        feature: "recondense",
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
        feature: "recondense",
      },
    ]);

    await adminClient.from("ai_cost_ledger").insert(costEntries);
  } catch (err) {
    captureException(err, {
      source: "handle-recondense",
      metadata: { jobId: job.id, action: "log-costs" },
    });
  }
}
