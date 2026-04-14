import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface FreeformConversation {
  id: string;
  run_id: string;
  tenant_id: string;
  created_by: string;
  conversation_number: number;
  messages: FreeformMessage[];
  status: "active" | "mapping_pending" | "mapped" | "closed";
  message_count: number;
  mapping_result: MappingEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface FreeformMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface MappingEntry {
  question_id: string;
  draft_text: string;
  confidence: "high" | "medium" | "low";
  source_summary: string;
}

export interface CatalogQuestion {
  id: string;
  frage_id: string;
  block: string;
  ebene: string;
  unterbereich: string;
  fragetext: string;
  position: number;
}

interface ProfileInfo {
  id: string;
  tenant_id: string;
  role: string;
}

// ============================================================
// Conversation CRUD
// ============================================================

/**
 * Load a conversation by ID. Verifies ownership.
 * Uses adminClient to bypass RLS (server-side only).
 */
export async function loadConversation(
  conversationId: string,
  userId: string
): Promise<FreeformConversation | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("freeform_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("created_by", userId)
    .single();

  if (error || !data) return null;
  return data as FreeformConversation;
}

/**
 * Create a new conversation for a run.
 * Automatically assigns the next conversation_number.
 */
export async function createConversation(
  runId: string,
  tenantId: string,
  userId: string
): Promise<FreeformConversation> {
  const adminClient = createAdminClient();

  // Get next conversation number
  const { data: existing } = await adminClient
    .from("freeform_conversations")
    .select("conversation_number")
    .eq("run_id", runId)
    .eq("created_by", userId)
    .order("conversation_number", { ascending: false })
    .limit(1);

  const nextNumber = existing && existing.length > 0
    ? existing[0].conversation_number + 1
    : 1;

  const { data, error } = await adminClient
    .from("freeform_conversations")
    .insert({
      run_id: runId,
      tenant_id: tenantId,
      created_by: userId,
      conversation_number: nextNumber,
      messages: [],
      status: "active",
      message_count: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data as FreeformConversation;
}

/**
 * Append user and assistant messages to a conversation.
 * Increments message_count by 2 (one pair).
 */
export async function appendMessages(
  conversationId: string,
  userMsg: string,
  assistantMsg: string
): Promise<{ messageCount: number }> {
  const adminClient = createAdminClient();

  // Load current messages
  const { data: conv, error: loadError } = await adminClient
    .from("freeform_conversations")
    .select("messages, message_count")
    .eq("id", conversationId)
    .single();

  if (loadError || !conv) throw new Error("Conversation not found");

  const now = new Date().toISOString();
  const currentMessages = (conv.messages as FreeformMessage[]) || [];
  const updatedMessages = [
    ...currentMessages,
    { role: "user" as const, text: userMsg, timestamp: now },
    { role: "assistant" as const, text: assistantMsg, timestamp: now },
  ];
  const newCount = (conv.message_count || 0) + 2;

  const { error: updateError } = await adminClient
    .from("freeform_conversations")
    .update({
      messages: updatedMessages,
      message_count: newCount,
      updated_at: now,
    })
    .eq("id", conversationId);

  if (updateError) throw new Error(`Failed to append messages: ${updateError.message}`);
  return { messageCount: newCount };
}

/**
 * Update conversation status.
 */
export async function updateConversationStatus(
  conversationId: string,
  status: FreeformConversation["status"]
): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("freeform_conversations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw new Error(`Failed to update status: ${error.message}`);
}

/**
 * Save mapping result to conversation.
 */
export async function saveMappingResult(
  conversationId: string,
  mappingResult: MappingEntry[]
): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("freeform_conversations")
    .update({
      mapping_result: mappingResult,
      status: "mapped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) throw new Error(`Failed to save mapping: ${error.message}`);
}

// ============================================================
// Question Catalog Loader
// ============================================================

/**
 * Load questions for a user, respecting block access for mirror respondents.
 * - mirror_respondent: only questions from assigned blocks
 * - tenant_admin / tenant_member: all questions for the run
 */
export async function loadQuestionsForUser(
  runId: string,
  profile: ProfileInfo
): Promise<CatalogQuestion[]> {
  const adminClient = createAdminClient();

  // Load run to get catalog_snapshot_id
  const { data: run } = await adminClient
    .from("runs")
    .select("catalog_snapshot_id")
    .eq("id", runId)
    .single();

  if (!run) throw new Error("Run not found");

  // Load all questions for this catalog
  const { data: questions, error } = await adminClient
    .from("questions")
    .select("id, frage_id, block, ebene, unterbereich, fragetext, position")
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .order("position", { ascending: true });

  if (error || !questions) throw new Error("Failed to load questions");

  // For mirror respondents: filter by assigned blocks
  if (profile.role === "mirror_respondent") {
    const { data: blockAccess } = await adminClient
      .from("member_block_access")
      .select("block")
      .eq("profile_id", profile.id)
      .eq("run_id", runId);

    if (blockAccess && blockAccess.length > 0) {
      const allowedBlocks = new Set(blockAccess.map((ba) => ba.block));
      return (questions as CatalogQuestion[]).filter((q) => allowedBlocks.has(q.block));
    }
    // No block access entries → return empty (no questions assigned)
    return [];
  }

  return questions as CatalogQuestion[];
}

// ============================================================
// Mapping Result Parser
// ============================================================

/**
 * Parse the LLM's mapping output (expected JSON array).
 * Handles edge cases: markdown code fences, trailing text, invalid JSON.
 */
export function parseMappingResult(llmOutput: string): MappingEntry[] {
  // Strip markdown code fences if present
  let cleaned = llmOutput.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }

  // Find JSON array boundaries
  const startIdx = cleaned.indexOf("[");
  const endIdx = cleaned.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }

  const jsonStr = cleaned.substring(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    // Validate and filter entries
    return parsed
      .filter(
        (entry: Record<string, unknown>) =>
          typeof entry.question_id === "string" &&
          typeof entry.draft_text === "string" &&
          typeof entry.confidence === "string" &&
          ["high", "medium", "low"].includes(entry.confidence as string)
      )
      .map((entry: Record<string, unknown>) => ({
        question_id: entry.question_id as string,
        draft_text: entry.draft_text as string,
        confidence: entry.confidence as "high" | "medium" | "low",
        source_summary: (entry.source_summary as string) || "",
      }));
  } catch {
    return [];
  }
}
