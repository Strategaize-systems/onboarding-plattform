// Worker Handler: dialogue_extraction
// SLC-031 MT-2+3 (FEAT-020)
//
// Flow:
// 1. Load dialogue_session (transcript) + meeting_guide (topics)
// 2. Build prompt (System + User with transcript + guide)
// 3. Bedrock call (Claude Sonnet, temp 0.3)
// 4. Parse JSON output
// 5. Import KUs via rpc_bulk_import_knowledge_units (source='dialogue')
// 6. Save summary + gaps on dialogue_session
// 7. Log costs to ai_cost_ledger
// 8. Status → 'processed'
// 9. Mark ai_job complete

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import type { ClaimedJob } from "../condensation/claim-loop";
import type { MeetingGuideTopic } from "../../types/meeting-guide";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  type ExtractionOutput,
} from "./dialogue-extraction-prompt";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

const COST_PER_INPUT_TOKEN = 0.003 / 1000;
const COST_PER_OUTPUT_TOKEN = 0.015 / 1000;

interface ExtractionPayload {
  dialogue_session_id: string;
}

export async function handleExtractionJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(
    `[dialogue-extraction] Processing job ${job.id} for tenant ${job.tenant_id}`
  );

  const payload = job.payload as unknown as ExtractionPayload;
  const { dialogue_session_id } = payload;

  if (!dialogue_session_id) {
    throw new Error("Extraction job payload missing dialogue_session_id");
  }

  // 1. Load dialogue session
  const { data: session, error: sessionError } = await adminClient
    .from("dialogue_session")
    .select("id, tenant_id, capture_session_id, meeting_guide_id, transcript, status")
    .eq("id", dialogue_session_id)
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to load dialogue session: ${sessionError?.message ?? "not found"}`);
  }

  if (!session.transcript) {
    throw new Error("Dialogue session has no transcript — transcription must run first");
  }

  // Load meeting guide (may be null)
  let topics: MeetingGuideTopic[] = [];
  let meetingGoal: string | null = null;

  if (session.meeting_guide_id) {
    const { data: guide } = await adminClient
      .from("meeting_guide")
      .select("goal, topics")
      .eq("id", session.meeting_guide_id)
      .single();

    if (guide) {
      topics = (guide.topics as MeetingGuideTopic[]) || [];
      meetingGoal = guide.goal;
    }
  }

  // Load template name for context
  const { data: captureSession } = await adminClient
    .from("capture_session")
    .select("template_id")
    .eq("id", session.capture_session_id)
    .single();

  let templateName = "Onboarding";
  if (captureSession?.template_id) {
    const { data: template } = await adminClient
      .from("template")
      .select("name")
      .eq("id", captureSession.template_id)
      .single();
    if (template) templateName = template.name;
  }

  console.log(
    `[dialogue-extraction] Context: ${topics.length} topics, transcript ${session.transcript.length} chars`
  );

  // 2. Build prompt
  const systemPrompt = buildExtractionSystemPrompt();
  const userPrompt = buildExtractionUserPrompt({
    transcript: session.transcript,
    topics,
    meetingGoal,
    templateName,
  });

  // 3. Bedrock call
  console.log(`[dialogue-extraction] Calling Bedrock (model=${MODEL_ID})...`);
  const callStart = Date.now();

  const rawResponse = await chatWithLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 16384 }
  );

  const callDuration = Date.now() - callStart;
  console.log(
    `[dialogue-extraction] Bedrock response: ${rawResponse.length} chars in ${(callDuration / 1000).toFixed(1)}s`
  );

  // 4. Parse JSON output
  let extraction: ExtractionOutput;
  try {
    // Strip markdown code fences if present
    const cleaned = rawResponse
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    extraction = JSON.parse(cleaned);
  } catch (parseError) {
    throw new Error(
      `Failed to parse extraction output as JSON: ${(parseError as Error).message}\nRaw: ${rawResponse.substring(0, 500)}`
    );
  }

  // 5. Import KUs via rpc_bulk_import_knowledge_units
  const kuCount = extraction.knowledge_units?.length ?? 0;

  if (kuCount > 0) {
    // Find or create a checkpoint reference for dialogue KUs
    // For dialogue source, block_checkpoint_id is NULL (migration 063)
    const kuPayload = extraction.knowledge_units.map((ku) => ({
      tenant_id: session.tenant_id,
      capture_session_id: session.capture_session_id,
      block_checkpoint_id: null, // dialogue KUs have no checkpoint
      block_key: ku.block_key ?? "unassigned",
      unit_type: ku.unit_type,
      source: "dialogue",
      title: ku.title,
      body: ku.body,
      confidence: ku.confidence,
      evidence_refs: [],
    }));

    const { data: importResult, error: importError } = await adminClient.rpc(
      "rpc_bulk_import_knowledge_units",
      { p_units: kuPayload }
    );

    if (importError) {
      throw new Error(`Failed to import KUs: ${importError.message}`);
    }

    const insertedCount =
      (importResult as Record<string, unknown>)?.inserted_count ?? 0;
    console.log(
      `[dialogue-extraction] Imported ${insertedCount} knowledge units (source=dialogue)`
    );
  } else {
    console.log(`[dialogue-extraction] No knowledge units extracted`);
  }

  // 6. Save summary + gaps on dialogue_session
  const { error: saveError } = await adminClient.rpc(
    "rpc_save_dialogue_extraction",
    {
      p_dialogue_session_id: dialogue_session_id,
      p_summary: extraction.summary ?? { topics: [], overall: "" },
      p_gaps: extraction.gaps ?? [],
      p_extraction_model: MODEL_ID,
      p_extraction_cost_usd: 0, // will be updated below
    }
  );

  if (saveError) {
    throw new Error(`Failed to save extraction results: ${saveError.message}`);
  }

  // 7. Log costs
  const estimatedInputTokens = Math.ceil(
    (systemPrompt.length + userPrompt.length) / 4
  );
  const estimatedOutputTokens = Math.ceil(rawResponse.length / 4);
  const estimatedCost =
    estimatedInputTokens * COST_PER_INPUT_TOKEN +
    estimatedOutputTokens * COST_PER_OUTPUT_TOKEN;

  await adminClient.from("ai_cost_ledger").insert({
    tenant_id: session.tenant_id,
    job_id: job.id,
    model_id: MODEL_ID,
    tokens_in: estimatedInputTokens,
    tokens_out: estimatedOutputTokens,
    usd_cost: estimatedCost,
    duration_ms: callDuration,
    role: "dialogue_extractor",
    feature: "dialogue_extraction",
  });

  // Update cost on dialogue_session
  await adminClient
    .from("dialogue_session")
    .update({ extraction_cost_usd: estimatedCost })
    .eq("id", dialogue_session_id);

  // 8. Status → 'processed'
  const { error: statusError } = await adminClient
    .from("dialogue_session")
    .update({ status: "processed" })
    .eq("id", dialogue_session_id);

  if (statusError) {
    throw new Error(`Failed to update status to processed: ${statusError.message}`);
  }

  // 9. Mark ai_job complete
  const { error: completeError } = await adminClient.rpc(
    "rpc_complete_ai_job",
    { p_job_id: job.id }
  );

  if (completeError) {
    throw new Error(`Failed to complete job: ${completeError.message}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[dialogue-extraction] Job complete: session=${dialogue_session_id}, ` +
    `KUs=${kuCount}, gaps=${extraction.gaps?.length ?? 0}, ` +
    `cost=$${estimatedCost.toFixed(4)}, duration=${(totalDuration / 1000).toFixed(1)}s`
  );
}
