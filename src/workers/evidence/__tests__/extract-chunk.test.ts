import { describe, it, expect } from "vitest";
import { chunkText } from "../chunk-text";
import {
  buildMappingSystemPrompt,
  buildMappingUserPrompt,
  parseMappingResponse,
} from "../mapping-prompt";

// ========================================
// Chunking Tests
// ========================================
describe("chunkText", () => {
  it("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const text = "Dies ist ein kurzer Text.";
    const result = chunkText(text, 700);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("splits at paragraph boundaries", () => {
    // Each paragraph ~100 tokens (400 chars), maxTokens=150 → should split into 2 chunks
    const p1 = "A".repeat(400);
    const p2 = "B".repeat(400);
    const text = `${p1}\n\n${p2}`;
    const result = chunkText(text, 150);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(p1);
    expect(result[1]).toBe(p2);
  });

  it("combines small paragraphs into one chunk", () => {
    const text = "Absatz eins.\n\nAbsatz zwei.\n\nAbsatz drei.";
    const result = chunkText(text, 700);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("handles single very long paragraph by splitting at sentences", () => {
    // Create a long paragraph with sentences
    const sentences = Array.from(
      { length: 20 },
      (_, i) => `Dies ist Satz Nummer ${i + 1} mit etwas mehr Inhalt fuer die Laenge.`
    );
    const longParagraph = sentences.join(" ");
    const result = chunkText(longParagraph, 100); // ~100 tokens = ~400 chars
    expect(result.length).toBeGreaterThan(1);

    // Each chunk should be under the limit (approximately)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(500); // ~125 tokens max with some tolerance
    }
  });

  it("preserves all content — no text is lost", () => {
    const paragraphs = ["Absatz A mit Inhalt.", "Absatz B mit Inhalt.", "Absatz C mit Inhalt."];
    const text = paragraphs.join("\n\n");
    const result = chunkText(text, 50);
    const reconstructed = result.join("\n\n");
    for (const p of paragraphs) {
      expect(reconstructed).toContain(p);
    }
  });

  it("handles text with only single newlines (no paragraph breaks)", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Zeile ${i + 1} mit etwas Inhalt.`);
    const text = lines.join("\n"); // single newlines, no paragraph breaks
    const result = chunkText(text, 700);
    // Single newlines don't split paragraphs, so this should be one chunk if short enough
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ========================================
// Mapping Prompt Tests
// ========================================
describe("buildMappingSystemPrompt", () => {
  it("returns non-empty system prompt", () => {
    const prompt = buildMappingSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("confidence");
  });
});

describe("buildMappingUserPrompt", () => {
  it("includes chunk text and questions", () => {
    const prompt = buildMappingUserPrompt("Test-Abschnitt ueber Finanzen", [
      { id: "q-1", block_key: "finanzen", text: "Wie ist die Umsatzentwicklung?" },
      { id: "q-2", block_key: "finanzen", text: "Wie hoch ist die EBIT-Marge?" },
    ]);
    expect(prompt).toContain("Test-Abschnitt ueber Finanzen");
    expect(prompt).toContain("q-1");
    expect(prompt).toContain("Umsatzentwicklung");
    expect(prompt).toContain("EBIT-Marge");
  });

  it("handles empty questions array", () => {
    const prompt = buildMappingUserPrompt("Some text", []);
    expect(prompt).toContain("Some text");
  });
});

describe("parseMappingResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify([
      {
        question_id: "q-1",
        block_key: "finanzen",
        question_text: "Umsatzentwicklung?",
        confidence: 0.85,
        relevant_excerpt: "Der Umsatz stieg um 15%.",
      },
    ]);
    const result = parseMappingResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].question_id).toBe("q-1");
    expect(result[0].confidence).toBe(0.85);
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n[{"question_id":"q-1","block_key":"bk","confidence":0.9,"relevant_excerpt":"x"}]\n```';
    const result = parseMappingResponse(raw);
    expect(result).toHaveLength(1);
  });

  it("filters out low-confidence suggestions (<0.3)", () => {
    const raw = JSON.stringify([
      { question_id: "q-1", block_key: "bk", confidence: 0.8, relevant_excerpt: "x" },
      { question_id: "q-2", block_key: "bk", confidence: 0.2, relevant_excerpt: "y" },
    ]);
    const result = parseMappingResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].question_id).toBe("q-1");
  });

  it("returns empty array for empty JSON array", () => {
    const result = parseMappingResponse("[]");
    expect(result).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    const result = parseMappingResponse('{"not": "array"}');
    expect(result).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMappingResponse("not json at all")).toThrow();
  });

  it("filters out entries without required fields", () => {
    const raw = JSON.stringify([
      { question_id: "q-1", block_key: "bk", confidence: 0.8, relevant_excerpt: "x" },
      { confidence: 0.8, relevant_excerpt: "y" }, // missing question_id + block_key
      { question_id: "q-3", confidence: 0.8 }, // missing block_key
    ]);
    const result = parseMappingResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].question_id).toBe("q-1");
  });
});
