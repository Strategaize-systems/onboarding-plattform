import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatWithLLM } from "@/lib/llm";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

/**
 * POST /api/meeting-guide/suggest
 * Generates topic suggestions for a meeting guide based on template context.
 * Input: { capture_session_id }
 * Output: { topics: MeetingGuideTopic[] }
 */
export async function POST(request: Request) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { profile, supabase } = auth;

  let body: { capture_session_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  if (!body.capture_session_id) {
    return errorResponse("VALIDATION_ERROR", "capture_session_id is required", 400);
  }

  // Load capture session (RLS ensures tenant isolation)
  const { data: session, error: sessionError } = await supabase
    .from("capture_session")
    .select("id, template_id, answers")
    .eq("id", body.capture_session_id)
    .single();

  if (sessionError || !session) {
    return errorResponse("NOT_FOUND", "Capture Session nicht gefunden", 404);
  }

  // Load template with blocks and questions (via admin client for full access)
  const adminClient = createAdminClient();
  const { data: template, error: templateError } = await adminClient
    .from("template")
    .select("id, name, slug, blocks, version")
    .eq("id", session.template_id)
    .single();

  if (templateError || !template) {
    return errorResponse("NOT_FOUND", "Template nicht gefunden", 404);
  }

  // Build context for LLM
  const blocks = template.blocks as Array<{
    key: string;
    title: string;
    questions: Array<{ key: string; question: string }>;
  }>;

  const blockContext = blocks
    .map(
      (b) =>
        `Block "${b.title}" (key: ${b.key}):\n` +
        b.questions.map((q) => `  - ${q.question}`).join("\n")
    )
    .join("\n\n");

  // Include existing answers if available
  let answersContext = "";
  if (session.answers && typeof session.answers === "object") {
    const answers = session.answers as Record<string, Record<string, string>>;
    const answeredBlocks = Object.entries(answers)
      .filter(([, blockAnswers]) => Object.keys(blockAnswers).length > 0)
      .map(
        ([blockKey, blockAnswers]) =>
          `Block ${blockKey}:\n` +
          Object.entries(blockAnswers)
            .map(([qKey, answer]) => `  ${qKey}: ${answer}`)
            .join("\n")
      );
    if (answeredBlocks.length > 0) {
      answersContext = `\n\nBereits vorhandene Antworten aus dem Fragebogen:\n${answeredBlocks.join("\n\n")}`;
    }
  }

  const systemPrompt = `Du bist ein erfahrener Wissensmanager, der strukturierte Gespraechsleitfaeden fuer Interviews erstellt.
Du erhaelst einen Template-Kontext mit Bloecken und Fragen. Deine Aufgabe: Schlage 5-8 Gespraechsthemen vor,
die als Leitfaden fuer ein strukturiertes Interview dienen. Jedes Thema soll:
- einen klaren Titel haben
- eine kurze Beschreibung (1-2 Saetze)
- 2-3 konkrete Leitfragen enthalten
- einem Template-Block zugeordnet sein (block_key)

Antworte ausschliesslich als JSON-Array im folgenden Format:
[
  {
    "key": "topic-1",
    "title": "Thementitel",
    "description": "Kurze Beschreibung",
    "questions": ["Frage 1?", "Frage 2?"],
    "block_key": "A",
    "order": 1
  }
]`;

  const userPrompt = `Template: ${template.name} (${template.slug})

Template-Bloecke und Fragen:
${blockContext}${answersContext}

Erstelle 5-8 Gespraechsthemen als JSON-Array.`;

  try {
    const llmResponse = await chatWithLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 4096 }
    );

    // Parse JSON from LLM response (may be wrapped in markdown code block)
    const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return errorResponse(
        "LLM_ERROR",
        "KI-Antwort konnte nicht als JSON geparst werden",
        500
      );
    }

    const topics: MeetingGuideTopic[] = JSON.parse(jsonMatch[0]);

    // Log cost to ai_cost_ledger (column names match 035 + 040 schema)
    await adminClient.from("ai_cost_ledger").insert({
      tenant_id: profile!.tenant_id,
      feature: "meeting_guide_suggest",
      model_id: process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0",
      tokens_in: 0,
      tokens_out: 0,
      usd_cost: 0.03,
      duration_ms: 0,
    });

    return NextResponse.json({ topics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM error";
    return errorResponse("LLM_ERROR", `KI-Vorschlag fehlgeschlagen: ${message}`, 500);
  }
}
