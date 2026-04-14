import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError, getTenantLocale } from "@/lib/api-utils";
import { freeformMappingSchema } from "@/lib/validations";
import {
  chatWithLLM,
  MAPPING_PROMPTS,
  buildFullCatalog,
  type LLMLocale,
} from "@/lib/llm";
import {
  loadConversation,
  updateConversationStatus,
  saveMappingResult,
  loadQuestionsForUser,
  parseMappingResult,
  type CatalogQuestion,
} from "@/lib/freeform";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/tenant/runs/[runId]/freeform/map
// Map a free-form conversation to structured questions with neutralized drafts
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

  const parsed = freeformMappingSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { conversationId } = parsed.data;

  // Load conversation — verify ownership and status
  const conversation = await loadConversation(conversationId, user!.id);
  if (!conversation) {
    return errorResponse("NOT_FOUND", "Conversation not found", 404);
  }
  if (conversation.run_id !== runId) {
    return errorResponse("FORBIDDEN", "Conversation does not belong to this run", 403);
  }
  if (conversation.status !== "active" && conversation.status !== "mapping_pending") {
    return errorResponse("FORBIDDEN", "Conversation cannot be mapped in current status", 403);
  }

  // Set status to mapping_pending
  await updateConversationStatus(conversationId, "mapping_pending");

  // Load tenant locale
  const locale = (await getTenantLocale(supabase, profile!.tenant_id)) as LLMLocale;

  // Load questions for full catalog
  const questions = await loadQuestionsForUser(runId, {
    id: profile!.id,
    tenant_id: profile!.tenant_id,
    role: profile!.role,
  });

  // Load existing answers for context
  // v_current_answers.question_id is a UUID, but mapping uses frage_id (e.g. "F-BP-001")
  // → resolve UUID → frage_id via the already-loaded questions
  const adminClient = createAdminClient();
  const { data: currentAnswers } = await adminClient
    .from("v_current_answers")
    .select("question_id, answer_text")
    .eq("run_id", runId);

  const uuidToFrageId = new Map(questions.map((q) => [q.id, q.frage_id]));
  const existingAnswerMap = new Map(
    (currentAnswers ?? [])
      .map((a: { question_id: string; answer_text: string }) => {
        const frageId = uuidToFrageId.get(a.question_id);
        return frageId ? [frageId, a.answer_text] as const : null;
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );

  // Build existing answers context for the LLM
  const existingAnswersLabel = locale === "de"
    ? "Bereits vorhandene Antworten (nur zur Information — nicht überschreiben, es sei denn das Gespräch liefert bessere Informationen):"
    : locale === "nl"
      ? "Reeds bestaande antwoorden (alleen ter informatie — niet overschrijven tenzij het gesprek betere informatie levert):"
      : "Existing answers (for reference only — do not overwrite unless the conversation provides better information):";

  let existingAnswersContext = "";
  if (existingAnswerMap.size > 0) {
    const answerLines = [...existingAnswerMap.entries()]
      .map(([qId, text]) => `[${qId}]: ${text.substring(0, 200)}`)
      .join("\n");
    existingAnswersContext = `\n\n${existingAnswersLabel}\n${answerLines}`;
  }

  // Build conversation transcript for the LLM
  const transcriptLabel = locale === "de" ? "Gesprächsverlauf:" : locale === "nl" ? "Gespreksverloop:" : "Conversation transcript:";
  const transcript = conversation.messages
    .map((m) => `${m.role === "user" ? "Teilnehmer" : "Berater"}: ${m.text}`)
    .join("\n\n");

  // Build LLM messages
  const systemContent = [
    MAPPING_PROMPTS[locale],
    buildFullCatalog(questions, locale),
    existingAnswersContext,
  ].filter(Boolean).join("\n\n");

  const messages = [
    { role: "system" as const, content: systemContent },
    { role: "user" as const, content: `${transcriptLabel}\n\n${transcript}` },
  ];

  try {
    const llmOutput = await chatWithLLM(messages, {
      temperature: 0.3,
      maxTokens: 4096,
    });

    // Parse mapping result
    const mappings = parseMappingResult(llmOutput);

    // Save mapping result and set status to mapped
    await saveMappingResult(conversationId, mappings);

    // Build question lookup for response enrichment
    const questionMap = new Map<string, CatalogQuestion>(
      questions.map((q) => [q.frage_id, q])
    );

    // Enrich response with question text and existing answer info
    const enrichedMappings = mappings.map((m) => {
      const q = questionMap.get(m.question_id);
      return {
        questionId: m.question_id,
        questionText: q?.fragetext ?? "",
        block: q?.block ?? "",
        draftText: m.draft_text,
        confidence: m.confidence,
        hasExistingAnswer: existingAnswerMap.has(m.question_id),
      };
    });

    // Identify unmapped questions
    const mappedIds = new Set(mappings.map((m) => m.question_id));
    const unmappedQuestions = questions
      .filter((q) => !mappedIds.has(q.frage_id))
      .map((q) => ({
        questionId: q.frage_id,
        questionText: q.fragetext,
        block: q.block,
      }));

    return NextResponse.json({
      mappings: enrichedMappings,
      unmappedQuestions,
      conversationId,
    });
  } catch (error) {
    // Revert status on failure
    await updateConversationStatus(conversationId, "active");

    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/freeform/map", metadata: { runId, conversationId } });
    return errorResponse(
      "INTERNAL_ERROR",
      `Mapping-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      500
    );
  }
}
