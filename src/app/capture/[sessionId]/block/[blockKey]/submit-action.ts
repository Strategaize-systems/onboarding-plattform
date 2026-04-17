"use server";

import { createClient } from "@/lib/supabase/server";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface SubmitBlockResult {
  checkpointId?: string;
  jobId?: string | null;
  deduplicated?: boolean;
  error?: string;
}

/**
 * Submit a block: creates a versioned block_checkpoint and enqueues
 * a condensation job. Uses rpc_create_block_checkpoint for atomicity.
 *
 * Content snapshot includes:
 *   - answers: all answers for this block (stripped of block prefix)
 *   - chat_context: KI-Chat conversation for this block
 *   - block_key + template_version for traceability
 */
export async function submitBlock(
  sessionId: string,
  blockKey: string,
  chatMessages: ChatMessage[]
): Promise<SubmitBlockResult> {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  // 2. Profile + Tenant
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "Profil nicht gefunden" };
  }

  // 3. Load session (answers + template_version)
  const { data: session, error: sessionError } = await supabase
    .from("capture_session")
    .select("id, tenant_id, answers, template_version")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { error: "Session nicht gefunden" };
  }

  if (session.tenant_id !== profile.tenant_id) {
    return { error: "Kein Zugriff" };
  }

  // 4. Extract answers for this block only
  const allAnswers = (session.answers as Record<string, string>) ?? {};
  const blockPrefix = `${blockKey}.`;
  const blockAnswers: Record<string, string> = {};

  for (const [key, value] of Object.entries(allAnswers)) {
    if (key.startsWith(blockPrefix)) {
      // Strip block prefix: "A.q1" → "q1"
      blockAnswers[key.slice(blockPrefix.length)] = value;
    }
  }

  // 5. Build checkpoint content
  const content = {
    answers: blockAnswers,
    chat_context: chatMessages.length > 0 ? chatMessages : null,
    block_key: blockKey,
    template_version: session.template_version,
  };

  // 6. Call RPC (atomic: checkpoint + job enqueue + hash + dedup)
  const { data, error: rpcError } = await supabase.rpc(
    "rpc_create_block_checkpoint",
    {
      p_session_id: sessionId,
      p_block_key: blockKey,
      p_checkpoint_type: "questionnaire_submit",
      p_content: content,
    }
  );

  if (rpcError) {
    console.error("submitBlock RPC error:", rpcError);
    return { error: `Einreichung fehlgeschlagen: ${rpcError.message}` };
  }

  const result = data as {
    checkpoint_id: string;
    job_id: string | null;
    deduplicated: boolean;
  };

  return {
    checkpointId: result.checkpoint_id,
    jobId: result.job_id,
    deduplicated: result.deduplicated,
  };
}
