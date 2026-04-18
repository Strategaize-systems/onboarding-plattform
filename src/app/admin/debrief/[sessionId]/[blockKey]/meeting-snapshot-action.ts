"use server";

import { createClient } from "@/lib/supabase/server";
import { isSessionComplete } from "@/lib/capture/session-completion";

export async function createMeetingSnapshot(
  sessionId: string,
  blockKey: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    return { error: "Nur strategaize_admin kann Meeting-Snapshots erstellen" };
  }

  // Load all KUs for this block in their current state
  const { data: knowledgeUnits, error: kuError } = await supabase
    .from("knowledge_unit")
    .select(
      "id, unit_type, source, title, body, confidence, evidence_refs, status, created_at, updated_at"
    )
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: true });

  if (kuError) {
    return { error: `Fehler beim Laden der KUs: ${kuError.message}` };
  }

  if (!knowledgeUnits || knowledgeUnits.length === 0) {
    return { error: "Keine Knowledge Units vorhanden — Snapshot nicht moeglich" };
  }

  // Build snapshot content
  const content = {
    kus: knowledgeUnits,
    finalized_by: user.id,
    finalized_at: new Date().toISOString(),
    version: "1.0",
  };

  // Create checkpoint via existing RPC
  const { data: checkpointResult, error: cpError } = await supabase.rpc(
    "rpc_create_block_checkpoint",
    {
      p_session_id: sessionId,
      p_block_key: blockKey,
      p_checkpoint_type: "meeting_final",
      p_content: content,
    }
  );

  if (cpError) {
    return { error: `Checkpoint-Fehler: ${cpError.message}` };
  }

  // Check if ALL blocks are now finalized → update session status
  const { data: session } = await supabase
    .from("capture_session")
    .select("template_id")
    .eq("id", sessionId)
    .single();

  if (session) {
    const { data: template } = await supabase
      .from("template")
      .select("blocks")
      .eq("id", session.template_id)
      .single();

    const templateBlocks = (template?.blocks ?? []) as Array<{ key: string }>;

    // Load all checkpoints for this session
    const { data: allCheckpoints } = await supabase
      .from("block_checkpoint")
      .select("block_key, checkpoint_type")
      .eq("capture_session_id", sessionId);

    if (
      isSessionComplete(templateBlocks, allCheckpoints ?? [])
    ) {
      // All blocks finalized → update session status
      await supabase
        .from("capture_session")
        .update({ status: "finalized" })
        .eq("id", sessionId);
    }
  }

  return {
    checkpointId: checkpointResult?.checkpoint_id,
    deduplicated: checkpointResult?.deduplicated ?? false,
  };
}
