import { describe, it, expect } from "vitest";
import {
  V8_1_PROMPT_VERSION,
  V8_1_MAX_WORD_COUNT,
  V8_1_SYSTEM_PROMPT,
  V8_1_TONALITY_BLACKLIST,
  containsBlacklistedPattern,
  countWords,
} from "../prompt";

describe("V8_1_PROMPT_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof V8_1_PROMPT_VERSION).toBe("string");
    expect(V8_1_PROMPT_VERSION.length).toBeGreaterThan(0);
  });

  it("starts with 'v' (cache-key convention)", () => {
    expect(V8_1_PROMPT_VERSION).toMatch(/^v\d+/);
  });
});

describe("V8_1_MAX_WORD_COUNT", () => {
  it("is 80 (DEC-167 + slice AC)", () => {
    expect(V8_1_MAX_WORD_COUNT).toBe(80);
  });
});

describe("V8_1_SYSTEM_PROMPT", () => {
  it("enforces Strategaize-Wir-Voice", () => {
    expect(V8_1_SYSTEM_PROMPT).toMatch(/Strategaize-Wir-Voice|Wir-Voice/i);
  });

  it("enforces max 80 Worte limit", () => {
    expect(V8_1_SYSTEM_PROMPT).toMatch(/max(?:imal)?\s+80\s+Worte?/i);
  });

  it("prohibits Pricing-Hinweise", () => {
    expect(V8_1_SYSTEM_PROMPT).toMatch(/keine?\s+Pricing|kein.*Preis|kein.*Kosten/i);
  });

  it("instructs 2-3 sentence output", () => {
    expect(V8_1_SYSTEM_PROMPT).toMatch(/2-3\s+S(ä|ae)tze|zwei\s+bis\s+drei|two\s+to\s+three/i);
  });
});

describe("V8_1_TONALITY_BLACKLIST", () => {
  it("is a non-empty RegExp array", () => {
    expect(Array.isArray(V8_1_TONALITY_BLACKLIST)).toBe(true);
    expect(V8_1_TONALITY_BLACKLIST.length).toBeGreaterThan(0);
    for (const pattern of V8_1_TONALITY_BLACKLIST) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });

  it("uses word-boundary for 'ich' to avoid false matches", () => {
    const ichPattern = V8_1_TONALITY_BLACKLIST.find((p) =>
      p.source.includes("ich")
    );
    expect(ichPattern).toBeDefined();
    expect(ichPattern!.source).toMatch(/\\b/);
  });
});

describe("containsBlacklistedPattern", () => {
  it("returns true for 'ich glaube'", () => {
    expect(containsBlacklistedPattern("Ich glaube, wir sollten...")).toBe(true);
  });

  it("returns true for 'mein Team'", () => {
    expect(
      containsBlacklistedPattern("Lassen Sie mein Team das pruefen.")
    ).toBe(true);
  });

  it("returns true for '100 Euro'", () => {
    expect(containsBlacklistedPattern("Das kostet etwa 100 Euro.")).toBe(true);
  });

  it("returns true for 'EUR'", () => {
    expect(containsBlacklistedPattern("Preis: 5000 EUR")).toBe(true);
  });

  it("returns true for 'der Founder'", () => {
    expect(containsBlacklistedPattern("Sprechen Sie mit der Founder.")).toBe(true);
  });

  it("returns true for 'Kosten'", () => {
    expect(containsBlacklistedPattern("Die Kosten sind ueberschaubar.")).toBe(true);
  });

  it("returns false for 'individuelle Bewegung' (word-boundary check)", () => {
    expect(containsBlacklistedPattern("Eine individuelle Bewegung im Team.")).toBe(false);
  });

  it("returns false for 'wichtig' (substring 'ich' inside)", () => {
    expect(containsBlacklistedPattern("Das ist wichtig fuer Sie.")).toBe(false);
  });

  it("returns false for Strategaize-clean text", () => {
    const clean =
      "Wir bei Strategaize empfehlen, dieses Modul gemeinsam mit Ihnen zu staerken. Lassen Sie uns einen Termin vereinbaren.";
    expect(containsBlacklistedPattern(clean)).toBe(false);
  });

  it("is case-insensitive for 'ICH'", () => {
    expect(containsBlacklistedPattern("ICH GLAUBE das ist gut.")).toBe(true);
  });
});

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \n  \t  ")).toBe(0);
  });

  it("counts single word", () => {
    expect(countWords("Hallo")).toBe(1);
  });

  it("counts multiple words separated by whitespace", () => {
    expect(countWords("Wir bei Strategaize empfehlen Ihnen")).toBe(5);
  });

  it("treats multiple whitespace as single separator", () => {
    expect(countWords("Wir   bei\nStrategaize\t\tempfehlen")).toBe(4);
  });

  it("counts a typical 80-word text correctly", () => {
    const text = Array(80).fill("Wort").join(" ");
    expect(countWords(text)).toBe(80);
  });
});
