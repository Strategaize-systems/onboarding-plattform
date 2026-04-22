// Prompt-Builder for Dialogue Extraction
// SLC-031 MT-1 (FEAT-020)
//
// Builds System + User prompt for Bedrock Claude to analyze a meeting transcript
// against a Meeting Guide structure. Output: KUs per topic, summary, gaps.

import type { MeetingGuideTopic } from "../../types/meeting-guide";

export interface ExtractionPromptInput {
  transcript: string;
  topics: MeetingGuideTopic[];
  meetingGoal: string | null;
  templateName: string;
}

export interface ExtractionOutputKU {
  topic_key: string;
  block_key: string | null;
  unit_type: "finding" | "risk" | "action" | "observation";
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
}

export interface ExtractionOutputTopicSummary {
  key: string;
  title: string;
  highlights: string[];
  decisions: string[];
  open_points: string[];
}

export interface ExtractionOutputGap {
  topic_key: string;
  topic_title: string;
  reason: string;
}

export interface ExtractionOutput {
  knowledge_units: ExtractionOutputKU[];
  summary: {
    topics: ExtractionOutputTopicSummary[];
    overall: string;
  };
  gaps: ExtractionOutputGap[];
}

export function buildExtractionSystemPrompt(): string {
  return `Du bist ein erfahrener Knowledge-Analyst, der Meeting-Transkripte strukturiert auswertet.

Deine Aufgabe:
1. Analysiere das Transkript gegen die vorgegebenen Meeting-Guide-Themen.
2. Extrahiere pro Thema 1-3 Knowledge Units (strukturierte Erkenntnisse).
3. Erstelle eine Meeting-Zusammenfassung pro Thema und insgesamt.
4. Identifiziere Themen, die nicht oder nur oberflächlich besprochen wurden (Gaps).

Regeln:
- Arbeite ausschließlich mit dem, was im Transkript steht. Erfinde keine Inhalte.
- Ordne jede Knowledge Unit dem block_key des zugehörigen Meeting-Guide-Themas zu.
- Wenn ein Thema keinen block_key hat, setze block_key auf null.
- Bewerte die Konfidenz basierend auf der Gesprächstiefe: "high" = ausführlich besprochen mit konkreten Details, "medium" = besprochen aber ohne volle Tiefe, "low" = nur oberflächlich erwähnt.
- Antworte ausschließlich mit validem JSON im vorgegebenen Format. Kein Markdown, kein Fließtext.`;
}

export function buildExtractionUserPrompt(input: ExtractionPromptInput): string {
  const topicsSection = input.topics
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const questions = t.questions.length > 0
        ? `  Leitfragen: ${t.questions.join(" | ")}`
        : "";
      const block = t.block_key ? `  Block: ${t.block_key}` : "  Block: (kein Block zugeordnet)";
      return `- Thema "${t.title}" (key: ${t.key})\n  ${t.description}\n${questions}\n${block}`;
    })
    .join("\n\n");

  const goalSection = input.meetingGoal
    ? `\n## Gesprächsziel\n${input.meetingGoal}\n`
    : "";

  return `## Meeting-Kontext
Template: ${input.templateName}
${goalSection}
## Meeting-Guide Themen

${topicsSection}

## Transkript

${input.transcript}

## Aufgabe

Analysiere das Transkript und gib das Ergebnis als JSON zurück:

{
  "knowledge_units": [
    {
      "topic_key": "topic-1",
      "block_key": "C",
      "unit_type": "finding|risk|action|observation",
      "title": "Kurzer Titel der Erkenntnis",
      "body": "Ausführliche Beschreibung mit konkreten Details aus dem Gespräch.",
      "confidence": "low|medium|high"
    }
  ],
  "summary": {
    "topics": [
      {
        "key": "topic-1",
        "title": "Thementitel",
        "highlights": ["Wichtigste Punkte..."],
        "decisions": ["Getroffene Entscheidungen..."],
        "open_points": ["Offene Fragen..."]
      }
    ],
    "overall": "Gesamtzusammenfassung des Meetings in 2-3 Sätzen."
  },
  "gaps": [
    {
      "topic_key": "topic-3",
      "topic_title": "Thementitel",
      "reason": "Warum das Thema nicht besprochen wurde."
    }
  ]
}

Wichtig:
- Pro Thema 1-3 Knowledge Units. Keine KUs für nicht besprochene Themen.
- Nur Themen als Gap markieren, die laut Meeting-Guide vorgesehen aber nicht oder kaum besprochen wurden.
- overall-Summary maximal 3 Sätze.
- Antwort: NUR das JSON-Objekt, kein umgebender Text.`;
}
