"use server";

import { createClient } from "@/lib/supabase/server";

interface TriggerSopResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

/**
 * Trigger SOP generation for a block.
 * Enqueues an ai_job of type 'sop_generation'.
 * Only strategaize_admin can trigger this.
 */
export async function triggerSopGeneration(
  sessionId: string,
  blockKey: string,
  checkpointId: string
): Promise<TriggerSopResult> {
  const supabase = await createClient();

  // 1. Auth — must be strategaize_admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    return { success: false, error: "Nur strategaize_admin kann SOPs generieren" };
  }

  // 2. Verify checkpoint exists and get tenant_id
  const { data: checkpoint, error: cpError } = await supabase
    .from("block_checkpoint")
    .select("id, capture_session_id, tenant_id")
    .eq("id", checkpointId)
    .single();

  if (cpError || !checkpoint) {
    return { success: false, error: "Checkpoint nicht gefunden" };
  }

  if (checkpoint.capture_session_id !== sessionId) {
    return { success: false, error: "Checkpoint gehoert nicht zur Session" };
  }

  // 3. Enqueue ai_job
  const { data: jobData, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({
      tenant_id: checkpoint.tenant_id,
      job_type: "sop_generation",
      payload: {
        block_checkpoint_id: checkpointId,
        block_key: blockKey,
        session_id: sessionId,
      },
      status: "pending",
    })
    .select("id")
    .single();

  if (jobError) {
    return { success: false, error: `Job-Enqueue fehlgeschlagen: ${jobError.message}` };
  }

  return {
    success: true,
    jobId: jobData.id,
  };
}
