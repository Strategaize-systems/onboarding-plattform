// V9.5 SLC-V9.5-B MT-2 — Vitest fuer Bedrock-Sonnet Cross-Thread-Synthese-Adapter
//
// Slice: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-2 Verification)
//   (a) Mock-Bedrock liefert valides JSON -> parsed SynthesisResult mit units
//   (b) Mock-Bedrock liefert invalides JSON -> SonnetSchemaError
//   (c) Schema-Drift (fehlendes source_pattern_id) -> SonnetSchemaError
//   (d) Region eu-central-1 verifiziert
//   (e) source_pattern_id je Snippet gesetzt (Provenance-Schema-Form)
//   (f) Codeblock-gewrappter Output wird gestrippt
//
// Pure-Function-Vitest: keine echte AWS-Call, kein SUPABASE_URL benoetigt.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  BEDROCK_SYNTHESIS_REGION,
  SonnetSchemaError,
  SynthesisResultSchema,
  V95_SYNTHESIS_PROMPT_VERSION,
  V95_SYNTHESIS_SYSTEM_PROMPT,
  __resetSynthesisCallerForTests,
  __setSynthesisCallerForTests,
  synthesizeSection,
  type SynthesisInputPattern,
} from "..";
import type { SonnetRawCaller } from "..";

const SECTION = "lieferung/lieferzeiten";

const INPUT_PATTERNS: SynthesisInputPattern[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Lieferzeit 5 Werktage",
    description: "P2 nennt 5 Werktage als Standard.",
    evidence_snippets: ["Wir liefern innerhalb von 5 Werktagen."],
    themes: ["lieferzeit"],
    confidence: 0.9,
    thread_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Standard-Lieferzeit eine Woche",
    description: "In einem anderen Thread bestaetigt P2 ca. eine Woche.",
    evidence_snippets: ["Normalerweise etwa eine Woche."],
    themes: ["lieferzeit"],
    confidence: 0.8,
    thread_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Lieferzusage 5 Tage",
    description: "Dritter Beleg fuer die 5-Tage-Zusage.",
    evidence_snippets: ["5 Werktage sind realistisch."],
    themes: ["lieferzeit"],
    confidence: 0.88,
    thread_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  },
];

const VALID_SYNTHESIS_PAYLOAD = {
  units: [
    {
      title: "Standard-Lieferzeit 5 Werktage",
      description:
        "Wir nennen 5 Werktage als Standard-Lieferzeit; in Einzelfaellen bis zu einer Woche.",
      themes: ["lieferzeit"],
      suggested_section: SECTION,
      source_pattern_ids: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
      ],
      evidence_count: 3,
      evidence_snippets: [
        {
          text: "Wir liefern innerhalb von 5 Werktagen.",
          source_pattern_id: "11111111-1111-1111-1111-111111111111",
        },
        {
          text: "Normalerweise etwa eine Woche.",
          source_pattern_id: "22222222-2222-2222-2222-222222222222",
        },
      ],
      aggregated_confidence: 0.87,
    },
  ],
};

function makeCaller(text: string): SonnetRawCaller {
  return async () => ({
    text,
    tokensIn: 1200,
    tokensOut: 350,
    latencyMs: 42,
  });
}

describe("synthesizeSection (V9.5 Cross-Thread-Synthese)", () => {
  beforeEach(() => {
    __resetSynthesisCallerForTests();
  });
  afterEach(() => {
    __resetSynthesisCallerForTests();
  });

  it("(a) parses valid JSON into a SynthesisResult with units", async () => {
    __setSynthesisCallerForTests(makeCaller(JSON.stringify(VALID_SYNTHESIS_PAYLOAD)));
    const result = await synthesizeSection(SECTION, INPUT_PATTERNS);

    expect(result.data.units).toHaveLength(1);
    const unit = result.data.units[0];
    expect(unit.title).toBe("Standard-Lieferzeit 5 Werktage");
    expect(unit.evidence_count).toBe(3);
    expect(unit.source_pattern_ids).toHaveLength(3);
    expect(unit.aggregated_confidence).toBeCloseTo(0.87);
    // Schema-Validierung haelt (idempotent gegenueber dem exportierten Schema).
    expect(SynthesisResultSchema.safeParse(result.data).success).toBe(true);
  });

  it("(b) throws SonnetSchemaError on invalid JSON", async () => {
    __setSynthesisCallerForTests(makeCaller("das ist kein json {{{"));
    await expect(synthesizeSection(SECTION, INPUT_PATTERNS)).rejects.toBeInstanceOf(
      SonnetSchemaError,
    );
  });

  it("(c) throws SonnetSchemaError on schema drift (snippet without source_pattern_id)", async () => {
    const drift = {
      units: [
        {
          title: "x",
          description: "y",
          themes: [],
          suggested_section: SECTION,
          source_pattern_ids: ["11111111-1111-1111-1111-111111111111"],
          evidence_count: 1,
          evidence_snippets: [{ text: "no source id here" }],
          aggregated_confidence: 0.5,
        },
      ],
    };
    __setSynthesisCallerForTests(makeCaller(JSON.stringify(drift)));
    await expect(synthesizeSection(SECTION, INPUT_PATTERNS)).rejects.toBeInstanceOf(
      SonnetSchemaError,
    );
  });

  it("(d) reports region eu-central-1 + computes USD cost from tokens", async () => {
    __setSynthesisCallerForTests(makeCaller(JSON.stringify(VALID_SYNTHESIS_PAYLOAD)));
    const result = await synthesizeSection(SECTION, INPUT_PATTERNS);
    expect(result.region).toBe(BEDROCK_SYNTHESIS_REGION);
    expect(result.region).toBe("eu-central-1");
    // 1200 in * 3/1e6 + 350 out * 15/1e6 = 0.0036 + 0.00525 = 0.00885
    expect(result.costUsd).toBeCloseTo(0.00885, 6);
  });

  it("(e) every evidence snippet carries a source_pattern_id (provenance form)", async () => {
    __setSynthesisCallerForTests(makeCaller(JSON.stringify(VALID_SYNTHESIS_PAYLOAD)));
    const result = await synthesizeSection(SECTION, INPUT_PATTERNS);
    for (const snippet of result.data.units[0].evidence_snippets) {
      expect(typeof snippet.source_pattern_id).toBe("string");
      expect(snippet.source_pattern_id.length).toBeGreaterThan(0);
    }
  });

  it("(f) strips a ```json code-block wrapper before parsing", async () => {
    const wrapped = "```json\n" + JSON.stringify(VALID_SYNTHESIS_PAYLOAD) + "\n```";
    __setSynthesisCallerForTests(makeCaller(wrapped));
    const result = await synthesizeSection(SECTION, INPUT_PATTERNS);
    expect(result.data.units).toHaveLength(1);
  });

  it("(g) exposes a stable prompt version + non-empty system prompt", () => {
    expect(V95_SYNTHESIS_PROMPT_VERSION).toMatch(/^v\d+\.\d+\.\d+/);
    expect(V95_SYNTHESIS_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    // Privacy-Vorgabe muss im Prompt stehen (P1/P2-Verbot).
    expect(V95_SYNTHESIS_SYSTEM_PROMPT).toContain("P1/P2");
  });
});
