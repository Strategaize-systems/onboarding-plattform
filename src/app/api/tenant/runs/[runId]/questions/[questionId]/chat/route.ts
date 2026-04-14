import { NextResponse } from "next/server";
import { requireTenant, errorResponse, getTenantLocale } from "@/lib/api-utils";
import { chatWithLLM, getSystemPrompts, buildOwnerContext, buildMirrorContext, buildMemoryContext, updateRunMemory, type OwnerProfileData, type MirrorProfileData } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/tenant/runs/[runId]/questions/[questionId]/chat
// Send a user message and get an LLM follow-up response
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile } = auth;
  const { runId, questionId } = await params;

  let body: { message: string; chatHistory?: { role: string; text: string }[] } = { message: "" };
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  if (!body.message?.trim()) {
    return errorResponse("VALIDATION_ERROR", "Message is required", 400);
  }

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

  // Load profile for personalized context (V2.2 owner / V3.1 mirror)
  let profileContext = "";
  if (profile!.role === "mirror_respondent") {
    const adminClient2 = createAdminClient();
    const { data: mirrorProfileData } = await adminClient2
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

  // Load run memory for session continuity (V2.2)
  const adminClient = createAdminClient();
  const { data: memoryData } = await adminClient
    .from("run_memory")
    .select("memory_text")
    .eq("run_id", runId)
    .single();
  const currentMemory = memoryData?.memory_text ?? "";
  const memoryContext = buildMemoryContext(currentMemory, locale);

  // Load evidence context for this question (if any documents have extracted text)
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
      const evidenceLabel = locale === "en" ? "The user has uploaded the following documents/evidence for this question:" : locale === "nl" ? "De gebruiker heeft de volgende documenten/bewijzen voor deze vraag geüpload:" : "Der Nutzer hat folgende Dokumente/Nachweise zu dieser Frage hochgeladen:";
      evidenceContext = `\n\n${evidenceLabel}\n${texts}`;
    }
  }

  // Build LLM messages: Persona + Profile + Memory + Question + Evidence
  const systemParts = [prompts.rückfrage];
  if (profileContext) systemParts.push(profileContext);
  if (memoryContext) systemParts.push(memoryContext);

  const questionLabel = locale === "de" ? "Die aktuelle Frage lautet" : locale === "nl" ? "De huidige vraag is" : "The current question is";
  const typeLabel = locale === "de" ? "Typ" : "Type";
  systemParts.push(`${questionLabel}: "${question.fragetext}"\nBlock: ${question.block} / ${question.unterbereich}\n${typeLabel}: ${question.ebene}${evidenceContext}`);

  const messages = [
    {
      role: "system" as const,
      content: systemParts.join("\n\n"),
    },
    // Include chat history for context
    ...((body.chatHistory ?? []).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }))),
    // Add the new user message
    {
      role: "user" as const,
      content: body.message,
    },
  ];

  try {
    const response = await chatWithLLM(messages, {
      temperature: 0.7,
      maxTokens: 512,
    });

    // Async memory update (fire-and-forget, DEC-024)
    const chatSummary = `${locale === "de" ? "Frage" : locale === "nl" ? "Vraag" : "Question"}: ${question.fragetext}\nBlock: ${question.block}\n${locale === "de" ? "Nutzer" : locale === "nl" ? "Gebruiker" : "User"}: ${body.message}\nKI: ${response.substring(0, 300)}`;
    updateRunMemory(runId, currentMemory, chatSummary, locale);

    return NextResponse.json({
      response,
      model: process.env.LLM_MODEL || "claude-sonnet-4.6",
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/chat", metadata: { questionId } });
    return errorResponse(
      "INTERNAL_ERROR",
      `LLM-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      500
    );
  }
}
