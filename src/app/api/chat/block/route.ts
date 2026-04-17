import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatWithLLM, getSystemPrompts } from "@/lib/llm";

/**
 * POST /api/chat/block
 *
 * Per-block KI-Chat for the questionnaire. Sends user message + context
 * to Bedrock (Claude Sonnet, eu-central-1) and returns assistant response.
 *
 * Body: { sessionId, blockKey, questionId, message, chatHistory }
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
    message: string;
    chatHistory?: { role: "user" | "assistant"; text: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const { sessionId, blockKey, questionId, message, chatHistory = [] } = body;

  if (!sessionId || !blockKey || !questionId || !message?.trim()) {
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

  // Load template to get question text for context
  const { data: template } = await supabase
    .from("template")
    .select("blocks")
    .eq("id", session.template_id)
    .single();

  let questionText = "";
  let blockTitle = "";
  if (template?.blocks) {
    const blocks = template.blocks as Array<{
      key: string;
      title: Record<string, string>;
      questions: Array<{ id: string; text: string }>;
    }>;
    const block = blocks.find((b) => b.key === blockKey);
    if (block) {
      blockTitle = block.title?.de ?? block.key;
      const question = block.questions.find((q) => q.id === questionId);
      if (question) {
        questionText = question.text;
      }
    }
  }

  // Build system prompt with question context
  const prompts = getSystemPrompts("de");
  const systemPrompt = `${prompts.rückfrage}

AKTUELLE FRAGE:
Block ${blockKey} — ${blockTitle}
Frage: "${questionText}"

Beantworte Rückfragen zu dieser spezifischen Frage. Hilf dem Teilnehmer, eine vollständige und konkrete Antwort zu formulieren.`;

  // Build conversation messages for LLM
  const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add chat history
  for (const msg of chatHistory) {
    llmMessages.push({
      role: msg.role,
      content: msg.text,
    });
  }

  // Add current user message
  llmMessages.push({ role: "user", content: message });

  try {
    const response = await chatWithLLM(llmMessages, {
      temperature: 0.7,
      maxTokens: 512,
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error("[chat/block] Bedrock error:", error);
    return NextResponse.json(
      { error: "KI-Antwort fehlgeschlagen" },
      { status: 502 }
    );
  }
}
