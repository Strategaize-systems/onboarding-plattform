"use server";

import { createClient } from "@/lib/supabase/server";

interface AnswerGapResult {
  success: boolean;
  recondenseTriggered?: boolean;
  jobId?: string;
  error?: string;
}

/**
 * Answer a gap question and trigger re-condensation if all required gaps are answered.
 *
 * Flow:
 * 1. Auth + tenant check
 * 2. Answer the gap question via RPC
 * 3. Check if all required gaps for this checkpoint are answered
 * 4. If yes: enqueue recondense_with_gaps job
 */
export async function answerGapQuestion(
  gapId: string,
  answerText: string
): Promise<AnswerGapResult> {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht authentifiziert" };
  }

  // 2. Answer the gap question
  const { data: answerResult, error: answerError } = await supabase.rpc(
    "rpc_answer_gap_question",
    { p_gap_id: gapId, p_answer_text: answerText }
  );

  if (answerError) {
    return { success: false, error: `Antwort fehlgeschlagen: ${answerError.message}` };
  }

  const result = answerResult as { updated: boolean; reason?: string };
  if (!result.updated) {
    return { success: false, error: `Gap bereits bearbeitet: ${result.reason}` };
  }

  // 3. Load the gap question to get checkpoint context
  const { data: gap } = await supabase
    .from("gap_question")
    .select("block_checkpoint_id, capture_session_id")
    .eq("id", gapId)
    .single();

  if (!gap) {
    return { success: true, recondenseTriggered: false };
  }

  // 4. Check if all required gaps for this checkpoint are answered
  const { data: pendingGaps } = await supabase
    .from("gap_question")
    .select("id")
    .eq("block_checkpoint_id", gap.block_checkpoint_id)
    .eq("priority", "required")
    .eq("status", "pending");

  if (pendingGaps && pendingGaps.length > 0) {
    // Still pending required gaps — don't trigger yet
    return { success: true, recondenseTriggered: false };
  }

  // 5. All required gaps answered — collect answered gap IDs and trigger recondense
  const { data: answeredGaps } = await supabase
    .from("gap_question")
    .select("id")
    .eq("block_checkpoint_id", gap.block_checkpoint_id)
    .eq("status", "answered");

  const answeredIds = (answeredGaps || []).map((g) => g.id);

  if (answeredIds.length === 0) {
    return { success: true, recondenseTriggered: false };
  }

  const { data: jobResult, error: jobError } = await supabase.rpc(
    "rpc_enqueue_recondense_job",
    {
      p_checkpoint_id: gap.block_checkpoint_id,
      p_gap_question_ids: answeredIds,
    }
  );

  if (jobError) {
    console.error("answerGapQuestion: recondense enqueue failed:", jobError);
    return { success: true, recondenseTriggered: false, error: jobError.message };
  }

  const jobData = jobResult as { job_id: string };

  return {
    success: true,
    recondenseTriggered: true,
    jobId: jobData.job_id,
  };
}

/**
 * Skip a gap question (mark as skipped, no re-condensation trigger).
 */
export async function skipGapQuestion(gapId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht authentifiziert" };
  }

  const { error } = await supabase
    .from("gap_question")
    .update({ status: "skipped" })
    .eq("id", gapId)
    .eq("status", "pending");

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
