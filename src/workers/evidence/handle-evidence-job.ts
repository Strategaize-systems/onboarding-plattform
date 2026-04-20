// Evidence Extraction Job Handler
// 1. Load evidence_file metadata
// 2. Download from Supabase Storage
// 3. Extract text (PDF, DOCX, TXT, CSV, ZIP)
// 4. Chunk text (~700 tokens)
// 5. Map chunks to template questions via Bedrock
// 6. Persist chunks + mappings via RPC
// 7. Update file status
// 8. Log costs to ai_cost_ledger
// 9. Mark job complete

import { createAdminClient } from "../../lib/supabase/admin";
import { chatWithLLM } from "../../lib/llm";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import { extractText } from "./extract-text";
import { chunkText } from "./chunk-text";
import {
  buildMappingSystemPrompt,
  buildMappingUserPrompt,
  parseMappingResponse,
} from "./mapping-prompt";
import type {
  EvidenceJobPayload,
  EvidenceChunkInsert,
  TemplateQuestion,
  MappingSuggestion,
} from "./types";

const MODEL_ID =
  process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

// Bedrock Claude pricing (eu-central-1, Sonnet)
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

export async function handleEvidenceJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(
    `[evidence-job] Processing job ${job.id} for tenant ${job.tenant_id}`
  );

  // 1. Extract payload
  const payload = job.payload as unknown as EvidenceJobPayload;
  const { evidence_file_id, session_id } = payload;

  if (!evidence_file_id || !session_id) {
    throw new Error(
      "Evidence job payload missing required fields (evidence_file_id, session_id)"
    );
  }

  // 2. Load evidence_file metadata
  const { data: evidenceFile, error: fileError } = await adminClient
    .from("evidence_file")
    .select(
      "id, tenant_id, capture_session_id, block_key, storage_path, original_filename, mime_type"
    )
    .eq("id", evidence_file_id)
    .single();

  if (fileError || !evidenceFile) {
    throw new Error(
      `Evidence file ${evidence_file_id} not found: ${fileError?.message}`
    );
  }

  console.log(
    `[evidence-job] File: ${evidenceFile.original_filename} (${evidenceFile.mime_type})`
  );

  // Mark as extracting
  await adminClient.rpc("rpc_update_evidence_file_status", {
    p_file_id: evidence_file_id,
    p_status: "extracting",
  });

  try {
    // 3. Download from Supabase Storage
    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("evidence")
      .download(evidenceFile.storage_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message ?? "no data"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log(
      `[evidence-job] Downloaded ${buffer.length} bytes`
    );

    // 4. Extract text
    const rawText = await extractText(
      buffer,
      evidenceFile.mime_type,
      evidenceFile.original_filename
    );
    console.log(
      `[evidence-job] Extracted ${rawText.length} chars`
    );

    // 5. Chunk text
    const chunks = chunkText(rawText, 700);
    console.log(
      `[evidence-job] ${chunks.length} chunks created`
    );

    // 6. Load template questions for mapping
    const questions = await loadTemplateQuestions(adminClient, session_id);
    console.log(
      `[evidence-job] ${questions.length} template questions loaded`
    );

    // 7. Map chunks to questions via Bedrock
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;
    let totalDuration = 0;

    const chunkInserts: EvidenceChunkInsert[] = [];

    const systemPrompt = buildMappingSystemPrompt();

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      if (questions.length === 0) {
        // No questions to map against — store chunk without mappings
        chunkInserts.push({
          chunk_index: i,
          chunk_text: chunkContent,
          mapping_suggestion: null,
          mapping_status: "pending",
        });
        continue;
      }

      const userPrompt = buildMappingUserPrompt(chunkContent, questions);

      const callStart = Date.now();
      const rawResponse = await chatWithLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 2048 }
      );
      const callDuration = Date.now() - callStart;

      // Estimate tokens
      const inputTokens = Math.ceil(
        (systemPrompt.length + userPrompt.length) / 4
      );
      const outputTokens = Math.ceil(rawResponse.length / 4);
      const cost =
        inputTokens * COST_PER_INPUT_TOKEN +
        outputTokens * COST_PER_OUTPUT_TOKEN;

      totalTokensIn += inputTokens;
      totalTokensOut += outputTokens;
      totalCost += cost;
      totalDuration += callDuration;

      // Parse mapping response
      let suggestions: MappingSuggestion[] = [];
      try {
        suggestions = parseMappingResponse(rawResponse);
      } catch (parseErr) {
        console.warn(
          `[evidence-job] Failed to parse mapping for chunk ${i}: ${parseErr}`
        );
      }

      chunkInserts.push({
        chunk_index: i,
        chunk_text: chunkContent,
        mapping_suggestion: suggestions.length > 0 ? suggestions : null,
        mapping_status: suggestions.length > 0 ? "suggested" : "pending",
      });

      console.log(
        `[evidence-job] Chunk ${i + 1}/${chunks.length}: ${suggestions.length} mappings (${callDuration}ms)`
      );
    }

    // 8. Persist chunks via RPC
    const { data: insertCount, error: insertError } = await adminClient.rpc(
      "rpc_create_evidence_chunks",
      {
        p_file_id: evidence_file_id,
        p_tenant_id: evidenceFile.tenant_id,
        p_chunks: chunkInserts,
      }
    );

    if (insertError) {
      throw new Error(
        `Failed to insert evidence chunks: ${insertError.message}`
      );
    }

    console.log(
      `[evidence-job] ${insertCount} chunks persisted`
    );

    // 9. Update file status to extracted
    await adminClient.rpc("rpc_update_evidence_file_status", {
      p_file_id: evidence_file_id,
      p_status: "extracted",
    });

    // 10. Log costs to ai_cost_ledger
    if (totalCost > 0) {
      try {
        await adminClient.from("ai_cost_ledger").insert({
          tenant_id: job.tenant_id,
          job_id: job.id,
          model_id: MODEL_ID,
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          usd_cost: totalCost,
          duration_ms: totalDuration,
          role: "evidence_mapper",
          feature: "evidence_mapping",
        });
      } catch (costErr) {
        captureException(costErr, {
          source: "evidence-job",
          metadata: { jobId: job.id, action: "log-costs" },
        });
      }
    }

    // 11. Mark job as completed
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id }
    );

    if (completeError) {
      throw new Error(
        `Failed to complete evidence job: ${completeError.message}`
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `[evidence-job] Job ${job.id} completed in ${totalTime}ms ` +
        `(${chunks.length} chunks, ${chunkInserts.filter((c) => c.mapping_suggestion).length} with mappings, ~$${totalCost.toFixed(4)})`
    );
  } catch (err) {
    // Mark file as failed
    try {
      await adminClient.rpc("rpc_update_evidence_file_status", {
        p_file_id: evidence_file_id,
        p_status: "failed",
        p_error: err instanceof Error ? err.message : String(err),
      });
    } catch (statusErr) {
      captureException(statusErr, {
        source: "evidence-job",
        metadata: { jobId: job.id, action: "update-status-failed" },
      });
    }

    throw err; // Re-throw so claim-loop marks job as failed
  }
}

/**
 * Load all template questions for the session's template.
 * Flattens blocks[].questions[] into a flat array with block_key.
 */
async function loadTemplateQuestions(
  adminClient: ReturnType<typeof createAdminClient>,
  sessionId: string
): Promise<TemplateQuestion[]> {
  // Load session → template
  const { data: session } = await adminClient
    .from("capture_session")
    .select("template_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    console.warn(
      `[evidence-job] Session ${sessionId} not found — no questions to map`
    );
    return [];
  }

  const { data: template } = await adminClient
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  if (!template?.blocks) {
    return [];
  }

  const blocks = template.blocks as Array<{
    key: string;
    questions?: Array<{
      id: string;
      text?: string | Record<string, string>;
    }>;
  }>;

  const questions: TemplateQuestion[] = [];

  for (const block of blocks) {
    if (!block.questions) continue;

    for (const q of block.questions) {
      const text =
        typeof q.text === "object"
          ? q.text.de ?? q.text.en ?? ""
          : q.text ?? "";

      if (text) {
        questions.push({
          id: q.id,
          block_key: block.key,
          text,
        });
      }
    }
  }

  return questions;
}
