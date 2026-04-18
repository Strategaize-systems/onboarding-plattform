import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatWithLLM, getSystemPrompts, buildMemoryContext } from "@/lib/llm";

/**
 * POST /api/chat/block/generate-answer
 *
 * Takes chat history and generates a summary answer via Bedrock.
 * Analog to Blueprint generate-answer, adapted for capture sessions.
 *
 * Body: { sessionId, blockKey, questionId, chatMessages, currentDraft? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 403 });
  }

  let body: {
    sessionId: string;
    blockKey: string;
    questionId: string;
    chatMessages?: { role: string; text: string }[];
    currentDraft?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const { sessionId, blockKey, questionId, chatMessages, currentDraft } = body;

  if (!sessionId || !blockKey || !questionId) {
    return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });
  }

  // Verify session ownership
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Load template to get question text
  const { data: template } = await supabase
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  let questionText = "";
  let blockTitle = "";
  let questionEbene = "";
  let questionUnterbereich = "";
  if (template?.blocks) {
    const blocks = template.blocks as Array<{
      key: string;
      title: Record<string, string>;
      questions: Array<{ id: string; text: string; ebene?: string; unterbereich?: string }>;
    }>;
    const block = blocks.find((b) => b.key === blockKey);
    if (block) {
      blockTitle = block.title?.de ?? block.key;
      const question = block.questions.find((q) => q.id === questionId);
      if (question) {
        questionText = question.text;
        questionEbene = question.ebene ?? "";
        questionUnterbereich = question.unterbereich ?? "";
      }
    }
  }

  // Load session memory
  const adminClient = createAdminClient();
  const { data: memoryData } = await adminClient
    .from("session_memory")
    .select("memory_text")
    .eq("session_id", sessionId)
    .single();
  const memoryContext = buildMemoryContext(memoryData?.memory_text ?? "", "de");

  // Build LLM messages for summary generation
  const prompts = getSystemPrompts("de");
  const systemContent = `${prompts.zusammenfassung}${memoryContext ? `\n\n${memoryContext}` : ""}\n\nOriginalfrage: ${questionText}\nBlock: ${blockKey} — ${blockTitle}${questionUnterbereich ? ` / ${questionUnterbereich}` : ""}${questionEbene ? `\nTyp: ${questionEbene}` : ""}`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    ...((chatMessages ?? []).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }))),
  ];

  if (currentDraft) {
    messages.push({
      role: "user",
      content: `Mein bisheriger Entwurf der Antwort:\n\n${currentDraft}\n\nBitte überarbeite und verbessere diese Zusammenfassung basierend auf dem gesamten Gespräch.`,
    });
  } else {
    messages.push({
      role: "user",
      content: "Bitte fasse das bisherige Gespräch zu einer strukturierten Antwort auf die Originalfrage zusammen.",
    });
  }

  try {
    const generatedAnswer = await chatWithLLM(messages, {
      temperature: 0.3,
      maxTokens: 2048,
    });

    return NextResponse.json({ generatedAnswer });
  } catch (error) {
    console.error("[chat/block/generate-answer] Bedrock error:", error);
    return NextResponse.json(
      { error: "Zusammenfassung fehlgeschlagen" },
      { status: 502 }
    );
  }
}
