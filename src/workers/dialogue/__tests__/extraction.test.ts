import { describe, it, expect } from "vitest";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  type ExtractionOutput,
} from "../dialogue-extraction-prompt";
import type { MeetingGuideTopic } from "../../../types/meeting-guide";

describe("dialogue_extraction prompt builder", () => {
  const sampleTopics: MeetingGuideTopic[] = [
    {
      key: "topic-1",
      title: "Nachfolgeplanung",
      description: "Aktueller Stand der Nachfolgeplanung",
      questions: ["Gibt es einen designierten Nachfolger?", "Welche Qualifikationen fehlen?"],
      block_key: "C",
      order: 1,
    },
    {
      key: "topic-2",
      title: "Marktposition",
      description: "Wettbewerbssituation und Markttrends",
      questions: ["Wie ist die Marktposition?"],
      block_key: "A",
      order: 2,
    },
    {
      key: "topic-3",
      title: "Finanzen",
      description: "Finanzielle Kennzahlen",
      questions: [],
      block_key: null,
      order: 3,
    },
  ];

  it("system prompt contains role definition", () => {
    const prompt = buildExtractionSystemPrompt();
    expect(prompt).toContain("Knowledge-Analyst");
    expect(prompt).toContain("Meeting-Transkript");
    expect(prompt).toContain("JSON");
  });

  it("user prompt contains all topics with block_keys", () => {
    const prompt = buildExtractionUserPrompt({
      transcript: "Das ist ein Testtranskript.",
      topics: sampleTopics,
      meetingGoal: "Nachfolgesituation klären",
      templateName: "Exit-Readiness",
    });

    expect(prompt).toContain("Exit-Readiness");
    expect(prompt).toContain("Nachfolgesituation klären");
    expect(prompt).toContain("Nachfolgeplanung");
    expect(prompt).toContain("Marktposition");
    expect(prompt).toContain("Finanzen");
    expect(prompt).toContain("Block: C");
    expect(prompt).toContain("Block: A");
    expect(prompt).toContain("kein Block zugeordnet");
    expect(prompt).toContain("Das ist ein Testtranskript.");
  });

  it("user prompt includes questions when present", () => {
    const prompt = buildExtractionUserPrompt({
      transcript: "Test",
      topics: sampleTopics,
      meetingGoal: null,
      templateName: "Test",
    });

    expect(prompt).toContain("Gibt es einen designierten Nachfolger?");
    expect(prompt).toContain("Welche Qualifikationen fehlen?");
    expect(prompt).toContain("Wie ist die Marktposition?");
  });

  it("user prompt omits goal section when null", () => {
    const prompt = buildExtractionUserPrompt({
      transcript: "Test",
      topics: sampleTopics,
      meetingGoal: null,
      templateName: "Test",
    });

    expect(prompt).not.toContain("Gesprächsziel");
  });
});

describe("extraction output parsing", () => {
  it("valid JSON output can be parsed", () => {
    const raw = JSON.stringify({
      knowledge_units: [
        {
          topic_key: "topic-1",
          block_key: "C",
          unit_type: "finding",
          title: "Nachfolger identifiziert",
          body: "Der aktuelle Geschäftsführer hat seinen Sohn als Nachfolger bestimmt.",
          confidence: "high",
        },
      ],
      summary: {
        topics: [
          {
            key: "topic-1",
            title: "Nachfolgeplanung",
            highlights: ["Nachfolger identifiziert"],
            decisions: ["Übergabe in 6 Monaten"],
            open_points: [],
          },
        ],
        overall: "Produktives Meeting mit klarer Nachfolge-Entscheidung.",
      },
      gaps: [
        {
          topic_key: "topic-3",
          topic_title: "Finanzen",
          reason: "Zeitmangel, wurde auf nächstes Meeting verschoben.",
        },
      ],
    } satisfies ExtractionOutput);

    const parsed: ExtractionOutput = JSON.parse(raw);
    expect(parsed.knowledge_units).toHaveLength(1);
    // source is not in the LLM output — it's added by the handler when importing KUs
    expect("source" in parsed.knowledge_units[0]).toBe(false);
    expect(parsed.knowledge_units[0].block_key).toBe("C");
    expect(parsed.summary.overall).toContain("Produktives Meeting");
    expect(parsed.gaps).toHaveLength(1);
    expect(parsed.gaps[0].topic_key).toBe("topic-3");
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = '```json\n{"knowledge_units":[],"summary":{"topics":[],"overall":""},"gaps":[]}\n```';
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed: ExtractionOutput = JSON.parse(cleaned);
    expect(parsed.knowledge_units).toHaveLength(0);
    expect(parsed.gaps).toHaveLength(0);
  });
});
