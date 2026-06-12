// V9.5 SLC-V9.5-C MT-1 — Vitest fuer Bedrock-Sonnet Bounded-Critic-Adapter
//
// Slice: slices/SLC-V9.5-C-bounded-critic-gate.md (MT-1 Verification)
//   (a) Mock-Bedrock liefert valides Verdict-JSON -> parsed CriticVerdicts
//   (b) Mock-Bedrock liefert invalides JSON -> SonnetSchemaError
//   (c) Schema-Drift (verdict ausserhalb KEEP|REJECT) -> SonnetSchemaError
//   (d) Region eu-central-1 verifiziert
//   (e) Verdict-Index-Mapping: unit_ref referenziert den Index im Input-Array
//   (f) Codeblock-gewrappter Output wird gestrippt
//
// Pure-Function-Vitest: kein echter AWS-Call, kein SUPABASE_URL benoetigt.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  BEDROCK_CRITIC_REGION,
  SonnetSchemaError,
  CriticVerdictsSchema,
  V95_CRITIC_PROMPT_VERSION,
  V95_CRITIC_SYSTEM_PROMPT,
  __resetCriticCallerForTests,
  __setCriticCallerForTests,
  critiqueUnits,
  type CriticInputUnit,
} from "..";
import type { SonnetRawCaller } from "..";

const INPUT_UNITS: CriticInputUnit[] = [
  {
    title: "Standard-Lieferzeit 5 Werktage",
    description:
      "Wir nennen 5 Werktage als Standard-Lieferzeit; in Einzelfaellen bis zu einer Woche.",
    themes: ["lieferzeit"],
    suggested_section: "lieferung/lieferzeiten",
    evidence_count: 3,
    evidence_snippets: [
      { text: "Wir liefern innerhalb von 5 Werktagen.", source_pattern_id: "p1" },
      { text: "Normalerweise etwa eine Woche.", source_pattern_id: "p2" },
    ],
  },
  {
    title: "Danke fuer Ihre Mail",
    description: "Wir bedanken uns fuer eingehende Mails.",
    themes: [],
    suggested_section: "kommunikation",
    evidence_count: 1,
    evidence_snippets: [{ text: "Danke fuer Ihre Mail!", source_pattern_id: "p3" }],
  },
];

const VALID_VERDICTS_PAYLOAD = {
  verdicts: [
    { unit_ref: 0, verdict: "KEEP", reason: "Mehrfach belegt, substantiell." },
    { unit_ref: 1, verdict: "REJECT", reason: "Trivial, nur 1 Beleg." },
  ],
};

function makeCaller(text: string): SonnetRawCaller {
  return async () => ({
    text,
    tokensIn: 800,
    tokensOut: 120,
    latencyMs: 17,
  });
}

describe("critiqueUnits (V9.5 Bounded-Critic)", () => {
  beforeEach(() => {
    __resetCriticCallerForTests();
  });
  afterEach(() => {
    __resetCriticCallerForTests();
  });

  it("(a) parses valid verdict JSON into CriticVerdicts", async () => {
    __setCriticCallerForTests(makeCaller(JSON.stringify(VALID_VERDICTS_PAYLOAD)));
    const result = await critiqueUnits(INPUT_UNITS);

    expect(result.data.verdicts).toHaveLength(2);
    expect(result.data.verdicts[0].verdict).toBe("KEEP");
    expect(result.data.verdicts[1].verdict).toBe("REJECT");
    expect(result.data.verdicts[1].reason).toContain("Trivial");
    expect(CriticVerdictsSchema.safeParse(result.data).success).toBe(true);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("(b) throws SonnetSchemaError on invalid JSON", async () => {
    __setCriticCallerForTests(makeCaller("Das ist kein JSON."));
    await expect(critiqueUnits(INPUT_UNITS)).rejects.toBeInstanceOf(
      SonnetSchemaError,
    );
  });

  it("(c) throws SonnetSchemaError on schema drift (unknown verdict value)", async () => {
    __setCriticCallerForTests(
      makeCaller(
        JSON.stringify({
          verdicts: [{ unit_ref: 0, verdict: "MAYBE", reason: "unsicher" }],
        }),
      ),
    );
    await expect(critiqueUnits(INPUT_UNITS)).rejects.toBeInstanceOf(
      SonnetSchemaError,
    );
  });

  it("(d) region is hardcoded eu-central-1", async () => {
    __setCriticCallerForTests(makeCaller(JSON.stringify(VALID_VERDICTS_PAYLOAD)));
    const result = await critiqueUnits(INPUT_UNITS);
    expect(BEDROCK_CRITIC_REGION).toBe("eu-central-1");
    expect(result.region).toBe("eu-central-1");
  });

  it("(e) verdict-index-mapping: unit_ref maps back onto the input array", async () => {
    __setCriticCallerForTests(makeCaller(JSON.stringify(VALID_VERDICTS_PAYLOAD)));
    const result = await critiqueUnits(INPUT_UNITS);

    for (const v of result.data.verdicts) {
      expect(v.unit_ref).toBeGreaterThanOrEqual(0);
      expect(v.unit_ref).toBeLessThan(INPUT_UNITS.length);
    }
    // Der REJECT trifft die triviale Unit (Index 1), nicht die belegte (Index 0).
    const rejected = result.data.verdicts.find((v) => v.verdict === "REJECT");
    expect(rejected?.unit_ref).toBe(1);
    expect(INPUT_UNITS[rejected!.unit_ref].title).toBe("Danke fuer Ihre Mail");
  });

  it("(f) strips markdown codeblock wrappers", async () => {
    __setCriticCallerForTests(
      makeCaller("```json\n" + JSON.stringify(VALID_VERDICTS_PAYLOAD) + "\n```"),
    );
    const result = await critiqueUnits(INPUT_UNITS);
    expect(result.data.verdicts).toHaveLength(2);
  });

  it("user prompt contains the unit index, titles and evidence counts", async () => {
    let capturedUser = "";
    __setCriticCallerForTests(async ({ user, system }) => {
      capturedUser = user;
      expect(system).toBe(V95_CRITIC_SYSTEM_PROMPT);
      return {
        text: JSON.stringify(VALID_VERDICTS_PAYLOAD),
        tokensIn: 1,
        tokensOut: 1,
        latencyMs: 1,
      };
    });
    await critiqueUnits(INPUT_UNITS);
    expect(capturedUser).toContain("Standard-Lieferzeit 5 Werktage");
    expect(capturedUser).toContain('"unit_ref": 0');
    expect(capturedUser).toContain('"unit_ref": 1');
    expect(capturedUser).toContain('"evidence_count": 1');
    expect(V95_CRITIC_PROMPT_VERSION).toMatch(/^v\d/);
  });
});
