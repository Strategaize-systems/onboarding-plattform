// Evidence Mapping Prompt
// Maps a text chunk against template questions via Bedrock.
// Returns an array of mapping suggestions with confidence scores.

import type { TemplateQuestion, MappingSuggestion } from "./types";

/**
 * Build the system prompt for evidence mapping.
 */
export function buildMappingSystemPrompt(): string {
  return `Du bist ein Experte fuer die Analyse von Geschaeftsdokumenten.

Deine Aufgabe: Analysiere einen Text-Abschnitt aus einem hochgeladenen Dokument und bestimme, welche der gegebenen Fragen durch diesen Text beantwortet oder teilweise beantwortet werden.

Regeln:
- Ordne NUR Fragen zu, die tatsaechlich durch den Text beantwortet werden.
- Gib fuer jede Zuordnung einen Confidence-Wert zwischen 0.0 und 1.0 an.
- Extrahiere das relevante Textstueck als "relevant_excerpt".
- Wenn der Text keine der Fragen beantwortet, gib ein leeres Array zurueck.
- Antworte NUR mit validem JSON, keine Erklaerungen.

Confidence-Skala:
- 0.9-1.0: Direkte, eindeutige Antwort auf die Frage
- 0.7-0.8: Starker Bezug, beantwortet die Frage groesstenteils
- 0.5-0.6: Teilantwort oder indirekter Bezug
- 0.3-0.4: Schwacher Bezug, koennte relevant sein
- Unter 0.3: Nicht zuordnen

Ausgabe-Format (JSON Array):
[
  {
    "question_id": "uuid-der-frage",
    "block_key": "block-key",
    "question_text": "Die zugeordnete Frage",
    "confidence": 0.85,
    "relevant_excerpt": "Der relevante Textausschnitt aus dem Dokument"
  }
]`;
}

/**
 * Build the user prompt for evidence mapping.
 */
export function buildMappingUserPrompt(
  chunkText: string,
  questions: TemplateQuestion[]
): string {
  const questionList = questions
    .map(
      (q) =>
        `- ID: ${q.id} | Block: ${q.block_key} | Frage: ${q.text}`
    )
    .join("\n");

  return `## Text-Abschnitt aus dem Dokument

${chunkText}

## Verfuegbare Fragen

${questionList}

## Aufgabe

Welche der obigen Fragen werden durch den Text-Abschnitt beantwortet? Antworte als JSON-Array.`;
}

/**
 * Parse the LLM mapping response into structured suggestions.
 */
export function parseMappingResponse(raw: string): MappingSuggestion[] {
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item: Record<string, unknown>) =>
        item.question_id &&
        item.block_key &&
        typeof item.confidence === "number" &&
        item.confidence >= 0.3
    )
    .map((item: Record<string, unknown>) => ({
      question_id: String(item.question_id),
      block_key: String(item.block_key),
      question_text: String(item.question_text || ""),
      confidence: Number(item.confidence),
      relevant_excerpt: String(item.relevant_excerpt || ""),
    }));
}
