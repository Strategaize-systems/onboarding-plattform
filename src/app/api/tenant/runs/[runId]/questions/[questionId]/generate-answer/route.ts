import { NextResponse } from "next/server";
import { requireTenant, errorResponse, getTenantLocale } from "@/lib/api-utils";
import { chatWithLLM, getSystemPrompts, buildOwnerContext, buildMemoryContext, type OwnerProfileData } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/tenant/runs/[runId]/questions/[questionId]/generate-answer
// Takes chat history, generates a summary via local LLM (Ollama/Qwen)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile } = auth;
  const { runId, questionId } = await params;

  let body: { chatMessages?: { role: string; text: string }[]; currentDraft?: string } = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const { chatMessages, currentDraft } = body;

  // Fetch the question text for context
  const { data: question } = await supabase
    .from("questions")
    .select("fragetext, block, unterbereich, ebene")
    .eq("id", questionId)
    .single();

  if (!question) {
    return errorResponse("NOT_FOUND", "Question not found", 404);
  }

  // Load tenant language for localized prompts
  const locale = await getTenantLocale(supabase, profile!.tenant_id);
  const prompts = getSystemPrompts(locale);

  // Load owner profile for personalized context (V2.2)
  const { data: ownerProfileData } = await supabase
    .from("owner_profiles")
    .select("*")
    .eq("tenant_id", profile!.tenant_id)
    .single();
  const ownerContext = buildOwnerContext(ownerProfileData as OwnerProfileData | null, locale);

  // Load run memory for session continuity (V2.2)
  const adminClient = createAdminClient();
  const { data: memoryData } = await adminClient
    .from("run_memory")
    .select("memory_text")
    .eq("run_id", runId)
    .single();
  const memoryContext = buildMemoryContext(memoryData?.memory_text ?? "", locale);

  // Load evidence context
  let evidenceContext = "";
  const { data: evidenceLinks } = await supabase
    .from("evidence_links")
    .select("evidence_item_id")
    .eq("link_type", "question")
    .eq("link_id", questionId);

  if (evidenceLinks && evidenceLinks.length > 0) {
    const { data: evidenceItems } = await supabase
      .from("evidence_items")
      .select("file_name, extracted_text, note_text, label")
      .in("id", evidenceLinks.map((l) => l.evidence_item_id));

    const texts = (evidenceItems ?? [])
      .filter((e) => e.extracted_text || e.note_text)
      .map((e) => `[${e.label}${e.file_name ? ` — ${e.file_name}` : ""}]: ${e.extracted_text || e.note_text}`)
      .join("\n\n");

    if (texts) {
      const evidenceLabel = locale === "en" ? "Uploaded documents/evidence:" : locale === "nl" ? "Geüploade documenten/bewijzen:" : "Hochgeladene Dokumente/Nachweise:";
      evidenceContext = `\n\n${evidenceLabel}\n${texts}`;
    }
  }

  // Build LLM messages for summary generation
  const messages = [
    {
      role: "system" as const,
      content: `${prompts.zusammenfassung}${ownerContext ? `\n\n${ownerContext}` : ""}${memoryContext ? `\n\n${memoryContext}` : ""}\n\n${locale === "de" ? "Originalfrage" : locale === "nl" ? "Oorspronkelijke vraag" : "Original question"}: ${question.fragetext}\nBlock: ${question.block} / ${question.unterbereich}\n${locale === "de" ? "Typ" : "Type"}: ${question.ebene}${evidenceContext}`,
    },
    ...((chatMessages ?? []).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }))),
  ];

  const userPrompts = {
    de: {
      withDraft: (draft: string) => `Mein bisheriger Entwurf der Antwort:\n\n${draft}\n\nBitte überarbeite und verbessere diese Zusammenfassung basierend auf dem gesamten Gespräch.`,
      noDraft: "Bitte fasse das bisherige Gespräch zu einer strukturierten Antwort auf die Originalfrage zusammen.",
    },
    en: {
      withDraft: (draft: string) => `My current draft answer:\n\n${draft}\n\nPlease revise and improve this summary based on the entire conversation.`,
      noDraft: "Please summarize the conversation so far into a structured answer to the original question.",
    },
    nl: {
      withDraft: (draft: string) => `Mijn huidige conceptantwoord:\n\n${draft}\n\nHerzie en verbeter deze samenvatting op basis van het gehele gesprek.`,
      noDraft: "Vat het gesprek tot nu toe samen in een gestructureerd antwoord op de oorspronkelijke vraag.",
    },
  };
  const loc = (locale in userPrompts ? locale : "de") as keyof typeof userPrompts;

  if (currentDraft) {
    messages.push({
      role: "user" as const,
      content: userPrompts[loc].withDraft(currentDraft),
    });
  } else {
    messages.push({
      role: "user" as const,
      content: userPrompts[loc].noDraft,
    });
  }

  try {
    const generatedAnswer = await chatWithLLM(messages, {
      temperature: 0.3, // Lower temperature for more focused summaries
      maxTokens: 2048,
    });

    return NextResponse.json({
      generatedAnswer,
      model: process.env.LLM_MODEL || "claude-sonnet-4.6",
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/generate-answer", metadata: { runId, questionId } });
    return errorResponse(
      "INTERNAL_ERROR",
      `LLM-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      500
    );
  }
}
