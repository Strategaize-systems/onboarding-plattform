import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError, getTenantLocale } from "@/lib/api-utils";
import { freeformChatSchema } from "@/lib/validations";
import {
  chatWithLLM,
  FREIFORM_PROMPTS,
  SOFT_LIMIT_INJECTION,
  buildCompactCatalog,
  buildOwnerContext,
  buildMirrorContext,
  buildMemoryContext,
  updateRunMemory,
  type LLMLocale,
  type OwnerProfileData,
  type MirrorProfileData,
} from "@/lib/llm";
import {
  loadConversation,
  createConversation,
  appendMessages,
  loadQuestionsForUser,
} from "@/lib/freeform";
import { createAdminClient } from "@/lib/supabase/admin";

const SOFT_LIMIT_THRESHOLD = 28;

// POST /api/tenant/runs/[runId]/freeform/chat
// Send a user message in free-form mode and get an LLM response
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile, user } = auth;
  const { runId } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = freeformChatSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { message, conversationId } = parsed.data;

  // Load run — verify exists and not locked
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, tenant_id, catalog_snapshot_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.status === "locked") {
    return errorResponse("FORBIDDEN", "Run is locked — no further input allowed", 403);
  }

  // Load or create conversation
  let conversation;
  if (conversationId) {
    conversation = await loadConversation(conversationId, user!.id);
    if (!conversation) {
      return errorResponse("NOT_FOUND", "Conversation not found", 404);
    }
    if (conversation.run_id !== runId) {
      return errorResponse("FORBIDDEN", "Conversation does not belong to this run", 403);
    }
    if (conversation.status !== "active") {
      return errorResponse("FORBIDDEN", "Conversation is not active", 403);
    }
  } else {
    conversation = await createConversation(runId, profile!.tenant_id, user!.id);
  }

  // Load tenant locale
  const locale = (await getTenantLocale(supabase, profile!.tenant_id)) as LLMLocale;

  // Load questions for catalog context
  const questions = await loadQuestionsForUser(runId, {
    id: profile!.id,
    tenant_id: profile!.tenant_id,
    role: profile!.role,
  });

  // Load profile context (owner vs mirror)
  const adminClient = createAdminClient();
  let profileContext = "";
  if (profile!.role === "mirror_respondent") {
    const { data: mirrorProfileData } = await adminClient
      .from("mirror_profiles")
      .select("*")
      .eq("profile_id", profile!.id)
      .single();
    profileContext = buildMirrorContext(mirrorProfileData as MirrorProfileData | null, locale);
  } else {
    const { data: ownerProfileData } = await supabase
      .from("owner_profiles")
      .select("*")
      .eq("tenant_id", profile!.tenant_id)
      .single();
    profileContext = buildOwnerContext(ownerProfileData as OwnerProfileData | null, locale);
  }

  // Load run memory
  const { data: memoryData } = await adminClient
    .from("run_memory")
    .select("memory_text")
    .eq("run_id", runId)
    .single();
  const currentMemory = memoryData?.memory_text ?? "";
  const memoryContext = buildMemoryContext(currentMemory, locale);

  // Build system prompt
  const systemParts = [FREIFORM_PROMPTS[locale]];
  if (profileContext) systemParts.push(profileContext);
  if (memoryContext) systemParts.push(memoryContext);
  systemParts.push(buildCompactCatalog(questions, locale));

  // Inject soft-limit warning if approaching message limit
  const currentCount = conversation.message_count;
  if (currentCount >= SOFT_LIMIT_THRESHOLD) {
    systemParts.push(SOFT_LIMIT_INJECTION[locale]);
  }

  // Build LLM messages: system + conversation history + new user message
  const messages = [
    { role: "system" as const, content: systemParts.join("\n\n") },
    ...conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const response = await chatWithLLM(messages, {
      temperature: 0.7,
      maxTokens: 512,
    });

    // Persist messages
    const { messageCount } = await appendMessages(conversation.id, message, response);

    // Async memory update (fire-and-forget, DEC-024)
    const chatSummary = `Freeform Chat\n${locale === "de" ? "Nutzer" : locale === "nl" ? "Gebruiker" : "User"}: ${message}\nKI: ${response.substring(0, 300)}`;
    updateRunMemory(runId, currentMemory, chatSummary, locale);

    return NextResponse.json({
      response,
      conversationId: conversation.id,
      messageCount,
      softLimitReached: messageCount >= SOFT_LIMIT_THRESHOLD,
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/freeform/chat", metadata: { runId } });
    return errorResponse(
      "INTERNAL_ERROR",
      `LLM-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      500
    );
  }
}
