// V9 SLC-167 MT-2 — Vitest fuer Bedrock-Sonnet Email-Pattern-Adapter
//
// Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
// Spec MT-2 Verification:
//   (a) Mock-Bedrock returns valid JSON -> parsed PatternExtractionResult mit Pflicht-Feldern
//   (b) Mock-Bedrock returns invalid JSON -> SonnetSchemaError + Fallback
//   (c) Region-Header eu-central-1 verifiziert
//
// Pattern-Reuse aus src/lib/ai/bedrock-haiku/__tests__/index.test.ts (V9 SLC-166 MT-1):
//   - injectable raw-caller fuer Bedrock-Mock
//   - vitest beforeEach + afterEach fuer State-Reset
//
// Pure-Function-Vitest gemaess feedback_vitest_split_pure_logic_from_db_adapter.md:
//   Keine echte AWS-Call, kein SUPABASE_URL benoetigt.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  BEDROCK_SONNET_REGION,
  PatternExtractionResultSchema,
  SonnetSchemaError,
  V9_PATTERN_PROMPT_VERSION,
  V9_PATTERN_SYSTEM_PROMPT,
  __resetSonnetCallerForTests,
  __setSonnetCallerForTests,
  extractPatternFromThread,
  type SonnetRawCaller,
  type ThreadMeta,
} from "..";

const DEFAULT_THREAD_META: ThreadMeta = {
  threadId: "thread-001",
  subject: "Anfrage zu Lieferzeit",
  emailCount: 4,
  firstDate: "2025-11-12T08:30:00Z",
};

const REDACTED_BODY_FIXTURE = `[2025-11-12 08:30] P1: Wann koennen wir mit der Lieferung rechnen?
[2025-11-12 09:14] P2: Wir liefern innerhalb von 5 Werktagen. Bei Sonderwuenschen kann es 7-8 Tage dauern.
[2025-11-13 07:55] P1: Geht es schneller mit Express?
[2025-11-13 10:12] P2: Express-Lieferung 3 Werktage gegen Aufpreis. Standard reicht aber meist.`;

const VALID_PATTERN_PAYLOAD = {
  thread_id: "thread-001",
  themes: ["lieferzeit-erklaerung", "express-option"],
  patterns: [
    {
      title: "Lieferzeit-Versprechen Standard",
      description: "P2 nennt 5 Werktage als Standard-Lieferzeit, 7-8 Tage bei Sonderwuenschen.",
      evidence_snippets: ["Wir liefern innerhalb von 5 Werktagen."],
      confidence: 0.92,
      suggested_section: "lieferung/lieferzeiten",
    },
    {
      title: "Express-Option als Up-Sell",
      description: "Bei Eilfaellen bietet P2 Express-Lieferung in 3 Werktagen gegen Aufpreis.",
      evidence_snippets: ["Express-Lieferung 3 Werktage gegen Aufpreis."],
      confidence: 0.85,
      suggested_section: "vertrieb/up-sell",
    },
  ],
  decisions: ["Standard-Lieferzeit ist 5 Werktage", "Express ist Aufpreis-Service"],
  open_questions: [],
};

function makeMockCaller(
  text: string,
  opts?: { tokensIn?: number; tokensOut?: number; latencyMs?: number },
): SonnetRawCaller {
  return async () => ({
    text,
    tokensIn: opts?.tokensIn ?? 800,
    tokensOut: opts?.tokensOut ?? 350,
    latencyMs: opts?.latencyMs ?? 1200,
  });
}

describe("Bedrock-Sonnet Email-Pattern-Adapter", () => {
  beforeEach(() => {
    __resetSonnetCallerForTests();
    delete process.env.BEDROCK_V9_SONNET_MODEL_ID;
  });

  afterEach(() => {
    __resetSonnetCallerForTests();
    delete process.env.BEDROCK_V9_SONNET_MODEL_ID;
  });

  describe("Region (data-residency.md Pflicht)", () => {
    it("exports BEDROCK_SONNET_REGION constant locked to eu-central-1", () => {
      expect(BEDROCK_SONNET_REGION).toBe("eu-central-1");
    });

    it("returns region='eu-central-1' in SonnetCallResult", async () => {
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);
      expect(result.region).toBe("eu-central-1");
    });
  });

  describe("Schema-Pass-Case (AC-SLC-167-Pattern-Extraktion)", () => {
    it("returns parsed PatternExtractionResult mit allen Pflicht-Feldern", async () => {
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);

      expect(result.data.thread_id).toBe("thread-001");
      expect(result.data.themes).toEqual([
        "lieferzeit-erklaerung",
        "express-option",
      ]);
      expect(result.data.patterns).toHaveLength(2);
      expect(result.data.patterns[0].title).toBe("Lieferzeit-Versprechen Standard");
      expect(result.data.patterns[0].confidence).toBeCloseTo(0.92, 2);
      expect(result.data.patterns[0].evidence_snippets).toHaveLength(1);
      expect(result.data.decisions).toHaveLength(2);
      expect(result.data.open_questions).toEqual([]);
    });

    it("liefert Cost + Token-Counts korrekt im Result", async () => {
      __setSonnetCallerForTests(
        makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD), {
          tokensIn: 1000,
          tokensOut: 500,
          latencyMs: 1500,
        }),
      );
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);

      expect(result.tokensIn).toBe(1000);
      expect(result.tokensOut).toBe(500);
      expect(result.latencyMs).toBe(1500);
      // Sonnet 3.5: $3 input / $15 output per 1M
      // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105 USD
      expect(result.costUsd).toBeCloseTo(0.0105, 6);
    });

    it("strippt Markdown-Codeblock falls Sonnet trotz Prompt-Verbot welche produziert", async () => {
      const wrapped = "```json\n" + JSON.stringify(VALID_PATTERN_PAYLOAD) + "\n```";
      __setSonnetCallerForTests(makeMockCaller(wrapped));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);
      expect(result.data.thread_id).toBe("thread-001");
    });

    it("ueberschreibt Modell-thread_id mit Caller-vorgegebener thread_id (Hallucination-Defense)", async () => {
      const payload = { ...VALID_PATTERN_PAYLOAD, thread_id: "modell-hallucinated-id-xyz" };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(payload)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, {
        ...DEFAULT_THREAD_META,
        threadId: "real-thread-uuid-42",
      });
      expect(result.data.thread_id).toBe("real-thread-uuid-42");
    });

    it("akzeptiert leeres decisions + open_questions via zod-Default", async () => {
      const minimal = {
        thread_id: "thread-min",
        themes: ["x"],
        patterns: [
          {
            title: "P1",
            description: "Min-Pattern",
            evidence_snippets: ["snippet"],
            confidence: 0.5,
            suggested_section: "andere",
          },
        ],
      };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(minimal)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, {
        ...DEFAULT_THREAD_META,
        threadId: "thread-min",
      });
      expect(result.data.decisions).toEqual([]);
      expect(result.data.open_questions).toEqual([]);
    });
  });

  describe("Schema-Fail-Case (Worker Skip + Continue per FEAT-073 AC-10)", () => {
    it("wirft SonnetSchemaError bei non-JSON-Output", async () => {
      __setSonnetCallerForTests(makeMockCaller("das ist kein JSON sondern Prosa"));
      await expect(
        extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META),
      ).rejects.toThrow(SonnetSchemaError);
    });

    it("wirft SonnetSchemaError bei Schema-Drift (Pattern ohne confidence)", async () => {
      const drift = {
        thread_id: "thread-001",
        themes: [],
        patterns: [
          {
            title: "Broken Pattern",
            description: "fehlt confidence",
            evidence_snippets: ["snippet"],
            // confidence: missing!
            suggested_section: "vertrieb/x",
          },
        ],
      };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(drift)));
      await expect(
        extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META),
      ).rejects.toThrow(SonnetSchemaError);
    });

    it("wirft generic Error (kein SonnetSchemaError) bei leerer Bedrock-Response", async () => {
      __setSonnetCallerForTests(makeMockCaller(""));
      await expect(
        extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META),
      ).rejects.toThrow(/empty response/i);
    });

    it("SonnetSchemaError enthaelt rawText-Snippet + zodIssues fuer Audit", async () => {
      const drift = { thread_id: "x", themes: [], patterns: "not-an-array" };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(drift)));
      try {
        await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);
        expect.fail("Expected SonnetSchemaError to be thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SonnetSchemaError);
        const err = e as SonnetSchemaError;
        expect(err.rawText.length).toBeGreaterThan(0);
        expect(err.rawText.length).toBeLessThanOrEqual(500);
        expect(err.zodIssues).toBeDefined();
      }
    });
  });

  describe("Schema-Limits (FEAT-073 max 5 Pattern pro Thread)", () => {
    it("wirft SonnetSchemaError bei >5 Pattern", async () => {
      const tooMany = {
        thread_id: "t",
        themes: [],
        patterns: Array.from({ length: 6 }, (_, i) => ({
          title: `P${i}`,
          description: "d",
          evidence_snippets: ["e"],
          confidence: 0.5,
          suggested_section: "andere",
        })),
      };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(tooMany)));
      await expect(
        extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META),
      ).rejects.toThrow(SonnetSchemaError);
    });

    it("akzeptiert genau 5 Pattern (Boundary)", async () => {
      const exactly5 = {
        thread_id: "t",
        themes: [],
        patterns: Array.from({ length: 5 }, (_, i) => ({
          title: `P${i}`,
          description: "d",
          evidence_snippets: ["e"],
          confidence: 0.5,
          suggested_section: "andere",
        })),
      };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(exactly5)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, {
        ...DEFAULT_THREAD_META,
        threadId: "t",
      });
      expect(result.data.patterns).toHaveLength(5);
    });

    it("wirft SonnetSchemaError bei confidence>1.0", async () => {
      const badConfidence = {
        thread_id: "t",
        themes: [],
        patterns: [
          {
            title: "X",
            description: "d",
            evidence_snippets: ["e"],
            confidence: 1.5, // out of range
            suggested_section: "andere",
          },
        ],
      };
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(badConfidence)));
      await expect(
        extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META),
      ).rejects.toThrow(SonnetSchemaError);
    });
  });

  describe("Modell-ID-Resolution", () => {
    it("nutzt Default-Modell (eu-Sonnet-4) wenn kein Override + keine ENV", async () => {
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);
      expect(result.modelId).toBe("eu.anthropic.claude-sonnet-4-20250514-v1:0");
    });

    it("respektiert ENV BEDROCK_V9_SONNET_MODEL_ID", async () => {
      process.env.BEDROCK_V9_SONNET_MODEL_ID = "anthropic.claude-3-opus-20240229-v1:0";
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD)));
      const result = await extractPatternFromThread(REDACTED_BODY_FIXTURE, DEFAULT_THREAD_META);
      expect(result.modelId).toBe("anthropic.claude-3-opus-20240229-v1:0");
    });

    it("respektiert Options-Override vor ENV", async () => {
      process.env.BEDROCK_V9_SONNET_MODEL_ID = "from-env";
      __setSonnetCallerForTests(makeMockCaller(JSON.stringify(VALID_PATTERN_PAYLOAD)));
      const result = await extractPatternFromThread(
        REDACTED_BODY_FIXTURE,
        DEFAULT_THREAD_META,
        { modelId: "from-options" },
      );
      expect(result.modelId).toBe("from-options");
    });
  });

  describe("Prompt-Version Anker", () => {
    it("exportiert V9_PATTERN_PROMPT_VERSION als nicht-leeren String", () => {
      expect(V9_PATTERN_PROMPT_VERSION).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("System-Prompt enthaelt Pseudonym-Konvention P1/P2", () => {
      expect(V9_PATTERN_SYSTEM_PROMPT).toContain("P1 = Kunde");
      expect(V9_PATTERN_SYSTEM_PROMPT).toContain("P2 = GF");
    });

    it("System-Prompt verbietet Pricing-Hinweise", () => {
      expect(V9_PATTERN_SYSTEM_PROMPT).toMatch(/keine pricing/i);
    });

    it("System-Prompt erzwingt strikten JSON-Output", () => {
      expect(V9_PATTERN_SYSTEM_PROMPT).toMatch(/STRIKT JSON/);
    });
  });

  describe("Schema-Validation isoliert (PatternExtractionResultSchema)", () => {
    it("akzeptiert valides Payload", () => {
      const result = PatternExtractionResultSchema.safeParse(VALID_PATTERN_PAYLOAD);
      expect(result.success).toBe(true);
    });

    it("rejected Pattern ohne suggested_section", () => {
      const bad = {
        ...VALID_PATTERN_PAYLOAD,
        patterns: [
          {
            title: "P",
            description: "d",
            evidence_snippets: ["e"],
            confidence: 0.5,
            // suggested_section missing
          },
        ],
      };
      const result = PatternExtractionResultSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });
});
