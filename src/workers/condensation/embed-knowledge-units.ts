// Post-creation embedding of Knowledge Units
// After the condensation pipeline creates KUs, this module embeds them
// as knowledge_chunks for future semantic search (SLC-009, Cross-Block, etc.)
// Fire-and-forget: embedding failures don't block job completion.

import { createAdminClient } from "../../lib/supabase/admin";
import { getEmbeddingProvider } from "../../lib/ai/embeddings";
import { captureException, captureInfo } from "../../lib/logger";

interface KnowledgeUnitForEmbedding {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  block_checkpoint_id: string;
  block_key: string;
  title: string;
  body: string;
  unit_type: string;
  confidence: string;
}

/**
 * Embed newly created Knowledge Units as knowledge_chunks.
 * Each KU becomes one chunk (KU body is already condensed, no further chunking needed).
 * Fire-and-forget — errors are logged but don't throw.
 */
export async function embedKnowledgeUnits(
  kuIds: string[],
  tenantId: string,
  jobId: string
): Promise<void> {
  if (kuIds.length === 0) return;

  const adminClient = createAdminClient();

  try {
    // Load the created KUs
    const { data: kus, error } = await adminClient
      .from("knowledge_unit")
      .select("id, tenant_id, capture_session_id, block_checkpoint_id, block_key, title, body, unit_type, confidence")
      .in("id", kuIds);

    if (error || !kus || kus.length === 0) {
      captureException(new Error(`Failed to load KUs for embedding: ${error?.message}`), {
        source: "embed-knowledge-units",
        metadata: { jobId, kuIds },
      });
      return;
    }

    const provider = getEmbeddingProvider();

    // Build texts for embedding: title + body combined
    const texts = (kus as KnowledgeUnitForEmbedding[]).map(
      (ku) => `${ku.title}\n\n${ku.body}`
    );

    // Generate embeddings in batch
    const embeddings = await provider.embedBatch(texts);

    // Build chunk rows
    const chunks = (kus as KnowledgeUnitForEmbedding[]).map((ku, idx) => ({
      tenant_id: ku.tenant_id,
      source_type: "knowledge_unit",
      source_id: ku.id,
      chunk_index: 0, // 1 chunk per KU (already condensed)
      chunk_text: texts[idx],
      embedding: JSON.stringify(embeddings[idx]),
      metadata: JSON.stringify({
        title: ku.title,
        block_key: ku.block_key,
        unit_type: ku.unit_type,
        confidence: ku.confidence,
        capture_session_id: ku.capture_session_id,
        block_checkpoint_id: ku.block_checkpoint_id,
        job_id: jobId,
      }),
      embedding_model: provider.modelId(),
      status: "active",
    }));

    // Upsert chunks (idempotent via unique constraint on source_type + source_id + chunk_index)
    const { error: insertError } = await adminClient
      .from("knowledge_chunks")
      .upsert(chunks, {
        onConflict: "source_type,source_id,chunk_index",
      });

    if (insertError) {
      captureException(new Error(`Failed to insert knowledge_chunks: ${insertError.message}`), {
        source: "embed-knowledge-units",
        metadata: { jobId, chunkCount: chunks.length },
      });
      return;
    }

    // Log cost to ai_cost_ledger
    const totalTokens = texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
    await adminClient.from("ai_cost_ledger").insert({
      tenant_id: tenantId,
      job_id: jobId,
      model_id: provider.modelId(),
      tokens_in: totalTokens,
      tokens_out: 0,
      usd_cost: totalTokens * 0.00002, // Titan V2: $0.02/MTok
      duration_ms: 0,
      role: "embedding" as string,
    });

    captureInfo(
      `Embedded ${chunks.length} KUs (${totalTokens} tokens, model=${provider.modelId()})`,
      { source: "embed-knowledge-units", metadata: { jobId, count: chunks.length } }
    );
  } catch (err) {
    // Fire-and-forget: log but don't throw
    captureException(err, {
      source: "embed-knowledge-units",
      metadata: { jobId, kuCount: kuIds.length },
    });
  }
}
