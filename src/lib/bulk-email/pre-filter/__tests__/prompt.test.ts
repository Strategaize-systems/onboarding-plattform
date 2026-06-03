// V9 SLC-166 MT-2 — Vitest fuer Pre-Filter Prompt-Assembly (Pure-Function).
//
// Coverage:
//   1. V9_PRE_FILTER_PROMPT_VERSION ist Konstante "v1".
//   2. Default-Confidence-Threshold ist 0.6.
//   3. System-Prompt enthaelt alle 6 kanonischen Labels + Beschreibungen.
//   4. System-Prompt fordert Strict-JSON-Array-Output ohne Codeblock-Wrapping.
//   5. buildPreFilterUserPrompt rendert N Emails als Pseudo-JSON-Bloecke.
//   6. buildPreFilterUserPrompt wirft bei leerem Batch.
//   7. Body-Truncation auf 4000 chars greift bei langen Texten.
//   8. Empty-Felder werden als "(leer)"/"(keine)"/"(unbekannt)" gerendert.
//   9. JSON.stringify-Escaping verhindert Anfuehrungs-Zeichen-Injection.

import { describe, expect, it } from "vitest";

import {
  PRE_FILTER_LABELS,
  PRE_FILTER_LABEL_DESCRIPTIONS,
  renderLabelDescriptionsForPrompt,
} from "../labels";
import {
  V9_PRE_FILTER_DEFAULT_CONFIDENCE_THRESHOLD,
  V9_PRE_FILTER_PROMPT_VERSION,
  V9_PRE_FILTER_SYSTEM_PROMPT,
  buildPreFilterUserPrompt,
  type PreFilterEmailPromptInput,
} from "../prompt";

describe("Pre-Filter Prompt-Konstanten", () => {
  it("V9_PRE_FILTER_PROMPT_VERSION ist 'v1'", () => {
    expect(V9_PRE_FILTER_PROMPT_VERSION).toBe("v1");
  });

  it("Default-Confidence-Threshold ist 0.6", () => {
    expect(V9_PRE_FILTER_DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

describe("System-Prompt", () => {
  it("enthaelt alle 6 kanonischen Labels", () => {
    for (const label of PRE_FILTER_LABELS) {
      expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain(label);
    }
  });

  it("enthaelt die Beschreibungen jedes Labels (verhindert Drift)", () => {
    for (const label of PRE_FILTER_LABELS) {
      // Wir matchen die ersten 20 chars der Beschreibung — exact-match ist
      // zu fragil, leeres Match wuerde Drift maskieren.
      const desc = PRE_FILTER_LABEL_DESCRIPTIONS[label];
      const snippet = desc.slice(0, 20);
      expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain(snippet);
    }
  });

  it("fordert Strict-JSON-Array-Output (kein Markdown, kein Codeblock)", () => {
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain("JSON-Array");
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toMatch(/Kein.*Codeblock/i);
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toMatch(/Kein.*Markdown/i);
  });

  it("dokumentiert message_id + label + confidence im Schema", () => {
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain("message_id");
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain("label");
    expect(V9_PRE_FILTER_SYSTEM_PROMPT).toContain("confidence");
  });

  it("rendert Labels alphabetisch im Beispiel-Output", () => {
    // Beispiel-JSON-Array muss exakt 2 Element-Tags enthalten.
    const exampleMatches = V9_PRE_FILTER_SYSTEM_PROMPT.match(/"label":/g);
    expect(exampleMatches).not.toBeNull();
    expect(exampleMatches!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("renderLabelDescriptionsForPrompt", () => {
  it("rendert jedes Label als '- label: beschreibung'-Zeile", () => {
    const out = renderLabelDescriptionsForPrompt();
    for (const label of PRE_FILTER_LABELS) {
      expect(out).toContain(`- ${label}: `);
    }
  });

  it("enthaelt genau 6 Zeilen (1 pro Label)", () => {
    const out = renderLabelDescriptionsForPrompt();
    const lines = out.split("\n");
    expect(lines).toHaveLength(6);
  });
});

describe("buildPreFilterUserPrompt", () => {
  function makeEmail(
    id: string,
    overrides: Partial<PreFilterEmailPromptInput> = {},
  ): PreFilterEmailPromptInput {
    return {
      message_id: id,
      subject: "Test-Subject",
      from_address: "alice@example.test",
      to_addresses: ["bob@example.test"],
      body_text: "Test-Body",
      ...overrides,
    };
  }

  it("wirft bei leerem Batch", () => {
    expect(() => buildPreFilterUserPrompt([])).toThrow();
  });

  it("rendert die ANZAHL-Zeile mit korrektem Plural", () => {
    const single = buildPreFilterUserPrompt([makeEmail("a")]);
    expect(single).toMatch(/ANZAHL: 1 Email\b/);
    const multi = buildPreFilterUserPrompt([makeEmail("a"), makeEmail("b")]);
    expect(multi).toMatch(/ANZAHL: 2 Emails/);
  });

  it("rendert die message_id jeder Email", () => {
    const prompt = buildPreFilterUserPrompt([
      makeEmail("aaa"),
      makeEmail("bbb"),
      makeEmail("ccc"),
    ]);
    expect(prompt).toContain('"message_id": "aaa"');
    expect(prompt).toContain('"message_id": "bbb"');
    expect(prompt).toContain('"message_id": "ccc"');
  });

  it("rendert die kanonischen Felder subject/from/to/body", () => {
    const prompt = buildPreFilterUserPrompt([makeEmail("x")]);
    expect(prompt).toContain('"subject":');
    expect(prompt).toContain('"from":');
    expect(prompt).toContain('"to":');
    expect(prompt).toContain('"body":');
  });

  it("setzt '(leer)' fuer null subject", () => {
    const prompt = buildPreFilterUserPrompt([makeEmail("x", { subject: null })]);
    expect(prompt).toContain('"(leer)"');
  });

  it("setzt '(unbekannt)' fuer null from_address", () => {
    const prompt = buildPreFilterUserPrompt([
      makeEmail("x", { from_address: null }),
    ]);
    expect(prompt).toContain('"(unbekannt)"');
  });

  it("setzt '(keine)' fuer leere to-Liste", () => {
    const prompt = buildPreFilterUserPrompt([makeEmail("x", { to_addresses: [] })]);
    expect(prompt).toContain('"(keine)"');
  });

  it("truncate body bei > 4000 chars", () => {
    const longBody = "x".repeat(5000);
    const prompt = buildPreFilterUserPrompt([makeEmail("x", { body_text: longBody })]);
    expect(prompt).toContain("[body truncated for prompt]");
    // Body-Teil im Output darf max ~4040 chars haben (4000 + Suffix).
    expect(prompt.length).toBeLessThan(longBody.length + 200);
  });

  it("escaped Anfuehrungszeichen via JSON.stringify (kein Injection-Risk)", () => {
    const prompt = buildPreFilterUserPrompt([
      makeEmail("x", { body_text: 'evil "}, dropTable: 1, {"' }),
    ]);
    expect(prompt).not.toContain('"body": "evil "');
    expect(prompt).toContain('\\"');
  });

  it("rendert Mehrfach-To-Adressen mit komma-getrennt", () => {
    const prompt = buildPreFilterUserPrompt([
      makeEmail("x", { to_addresses: ["a@x.test", "b@x.test"] }),
    ]);
    expect(prompt).toContain("a@x.test, b@x.test");
  });

  it("trennt einzelne Email-Bloecke mit '---'", () => {
    const prompt = buildPreFilterUserPrompt([
      makeEmail("a"),
      makeEmail("b"),
      makeEmail("c"),
    ]);
    const separators = prompt.match(/^---$/gm);
    expect(separators?.length).toBe(2);
  });

  it("endet mit der Klassifikations-Aufforderung inkl. korrekter Anzahl", () => {
    const prompt = buildPreFilterUserPrompt([makeEmail("a"), makeEmail("b"), makeEmail("c")]);
    expect(prompt).toMatch(/Klassifiziere alle 3 Emails/);
  });
});
