// V9 SLC-166 MT-1 — Vitest fuer Bedrock-Haiku-Adapter
//
// Slice: SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction
// Spec MT-1 Verification:
//   (a) Region-Header eu-central-1 verifiziert
//   (b) Schema-Pass-Case returnt typed TResponse
//   (c) Schema-Fail-Case throws HaikuSchemaError + Audit-Entry
//
// Pattern-Reuse aus src/lib/llm/v8-1-augmentation/__tests__/augment.test.ts:
//   - injectable raw-caller fuer Bedrock-Mock
//   - vitest beforeEach + afterEach fuer State-Reset
//
// Pure-Function-Vitest gemaess feedback_vitest_split_pure_logic_from_db_adapter.md:
//   Keine echte AWS-Call, kein SUPABASE_URL benoetigt.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

import {
  BEDROCK_HAIKU_REGION,
  HaikuSchemaError,
  __resetHaikuCallerForTests,
  __setHaikuCallerForTests,
  invokeHaiku,
  type HaikuRawCaller,
} from "..";

const FAKE_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

function makeMockCaller(text: string, opts?: {
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}): HaikuRawCaller {
  return async () => ({
    text,
    tokensIn: opts?.tokensIn ?? 100,
    tokensOut: opts?.tokensOut ?? 50,
    latencyMs: opts?.latencyMs ?? 250,
  });
}

describe("Bedrock-Haiku-Adapter", () => {
  beforeEach(() => {
    __resetHaikuCallerForTests();
    delete process.env.BEDROCK_V9_HAIKU_MODEL_ID;
  });

  afterEach(() => {
    __resetHaikuCallerForTests();
    delete process.env.BEDROCK_V9_HAIKU_MODEL_ID;
  });

  describe("Region (AC-SLC-166-1)", () => {
    it("exports BEDROCK_HAIKU_REGION constant locked to eu-central-1", () => {
      expect(BEDROCK_HAIKU_REGION).toBe("eu-central-1");
    });

    it("returns region='eu-central-1' in HaikuCallResult", async () => {
      __setHaikuCallerForTests(makeMockCaller('{"ok":true}'));
      const result = await invokeHaiku(
        { system: "S", user: "U" },
        z.object({ ok: z.boolean() }),
      );
      expect(result.region).toBe("eu-central-1");
    });
  });

  describe("Schema-Pass-Case (Verification a-b)", () => {
    it("returns parsed + typed payload when output matches zod schema", async () => {
      const schema = z.object({
        message_id: z.string(),
        label: z.enum(["content", "short_reply"]),
        confidence: z.number(),
      });
      const fakePayload = {
        message_id: "msg-1",
        label: "content" as const,
        confidence: 0.95,
      };
      __setHaikuCallerForTests(makeMockCaller(JSON.stringify(fakePayload)));

      const result = await invokeHaiku(
        { system: "Classify the email", user: "Body" },
        schema,
      );

      expect(result.data).toEqual(fakePayload);
      expect(result.data.label).toBe("content");
      expect(result.rawText).toBe(JSON.stringify(fakePayload));
    });

    it("supports JSON arrays via z.array() schemas", async () => {
      const schema = z.array(
        z.object({ message_id: z.string(), label: z.string() }),
      );
      const fakePayload = [
        { message_id: "a", label: "content" },
        { message_id: "b", label: "newsletter" },
      ];
      __setHaikuCallerForTests(makeMockCaller(JSON.stringify(fakePayload)));

      const result = await invokeHaiku(
        { system: "Batch classify", user: "Mails" },
        schema,
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.message_id).toBe("a");
    });

    it("strips markdown json codeblock wrapper before parsing", async () => {
      const schema = z.object({ k: z.string() });
      const fakeWrapped = '```json\n{"k":"v"}\n```';
      __setHaikuCallerForTests(makeMockCaller(fakeWrapped));

      const result = await invokeHaiku({ system: "S", user: "U" }, schema);
      expect(result.data.k).toBe("v");
    });

    it("strips markdown codeblock without language tag", async () => {
      const schema = z.object({ k: z.number() });
      __setHaikuCallerForTests(makeMockCaller('```\n{"k":42}\n```'));

      const result = await invokeHaiku({ system: "S", user: "U" }, schema);
      expect(result.data.k).toBe(42);
    });
  });

  describe("Schema-Fail-Case (Verification c)", () => {
    it("throws HaikuSchemaError when output is not valid JSON", async () => {
      __setHaikuCallerForTests(makeMockCaller("not json at all"));

      await expect(
        invokeHaiku(
          { system: "S", user: "U" },
          z.object({ k: z.string() }),
        ),
      ).rejects.toBeInstanceOf(HaikuSchemaError);
    });

    it("throws HaikuSchemaError when JSON shape does not match schema", async () => {
      const schema = z.object({
        label: z.enum(["content", "newsletter"]),
        confidence: z.number(),
      });
      __setHaikuCallerForTests(
        makeMockCaller('{"label":"unexpected","confidence":"high"}'),
      );

      let caught: unknown;
      try {
        await invokeHaiku({ system: "S", user: "U" }, schema);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HaikuSchemaError);
      const schemaErr = caught as HaikuSchemaError;
      expect(schemaErr.rawText.length).toBeGreaterThan(0);
      expect(Array.isArray(schemaErr.zodIssues)).toBe(true);
    });

    it("preserves raw text snippet (max 500 chars) for debugging", async () => {
      const longText = "x".repeat(1000);
      __setHaikuCallerForTests(makeMockCaller(longText));

      let caught: HaikuSchemaError | null = null;
      try {
        await invokeHaiku(
          { system: "S", user: "U" },
          z.object({ k: z.string() }),
        );
      } catch (err) {
        caught = err as HaikuSchemaError;
      }
      expect(caught).not.toBeNull();
      expect(caught!.rawText.length).toBeLessThanOrEqual(500);
    });

    it("throws plain Error (not HaikuSchemaError) on empty output", async () => {
      __setHaikuCallerForTests(makeMockCaller(""));

      let caught: unknown;
      try {
        await invokeHaiku(
          { system: "S", user: "U" },
          z.object({ k: z.string() }),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(HaikuSchemaError);
    });
  });

  describe("Modell-ID Resolution", () => {
    it("uses Haiku-3 as Default when no options.modelId and no ENV", async () => {
      let usedModel = "";
      __setHaikuCallerForTests(async (args) => {
        usedModel = args.modelId;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku({ system: "S", user: "U" }, z.object({}));
      expect(usedModel).toBe(FAKE_MODEL_ID);
    });

    it("uses ENV BEDROCK_V9_HAIKU_MODEL_ID when set", async () => {
      process.env.BEDROCK_V9_HAIKU_MODEL_ID = "anthropic.claude-haiku-test-id";
      let usedModel = "";
      __setHaikuCallerForTests(async (args) => {
        usedModel = args.modelId;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku({ system: "S", user: "U" }, z.object({}));
      expect(usedModel).toBe("anthropic.claude-haiku-test-id");
    });

    it("options.modelId override beats ENV", async () => {
      process.env.BEDROCK_V9_HAIKU_MODEL_ID = "from-env";
      let usedModel = "";
      __setHaikuCallerForTests(async (args) => {
        usedModel = args.modelId;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
        { modelId: "explicit-override" },
      );
      expect(usedModel).toBe("explicit-override");
    });

    it("returns modelId in HaikuCallResult for audit-trail", async () => {
      __setHaikuCallerForTests(makeMockCaller("{}"));
      const result = await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
        { modelId: "anthropic.claude-haiku-x" },
      );
      expect(result.modelId).toBe("anthropic.claude-haiku-x");
    });
  });

  describe("Cost-Computation (Haiku 3 Pricing)", () => {
    it("computes cost from tokens: $0.25 input / $1.25 output per 1M tokens", async () => {
      __setHaikuCallerForTests(
        makeMockCaller("{}", { tokensIn: 1_000_000, tokensOut: 1_000_000 }),
      );
      const result = await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
      );
      // 1M input * 0.25 + 1M output * 1.25 = 1.50 USD
      expect(result.costUsd).toBeCloseTo(1.5, 5);
    });

    it("passes through tokensIn/tokensOut from raw caller", async () => {
      __setHaikuCallerForTests(
        makeMockCaller("{}", { tokensIn: 123, tokensOut: 45 }),
      );
      const result = await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
      );
      expect(result.tokensIn).toBe(123);
      expect(result.tokensOut).toBe(45);
    });

    it("passes through latencyMs from raw caller", async () => {
      __setHaikuCallerForTests(makeMockCaller("{}", { latencyMs: 777 }));
      const result = await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
      );
      expect(result.latencyMs).toBe(777);
    });
  });

  describe("Inference-Defaults", () => {
    it("Default temperature is 0.2 (deterministic classification)", async () => {
      let usedTemp = -1;
      __setHaikuCallerForTests(async (args) => {
        usedTemp = args.temperature;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku({ system: "S", user: "U" }, z.object({}));
      expect(usedTemp).toBe(0.2);
    });

    it("Default maxTokens is 2048 (Batch-Klassifikation)", async () => {
      let usedMax = -1;
      __setHaikuCallerForTests(async (args) => {
        usedMax = args.maxTokens;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku({ system: "S", user: "U" }, z.object({}));
      expect(usedMax).toBe(2048);
    });

    it("options override temperature + maxTokens", async () => {
      let usedTemp = -1;
      let usedMax = -1;
      __setHaikuCallerForTests(async (args) => {
        usedTemp = args.temperature;
        usedMax = args.maxTokens;
        return { text: "{}", tokensIn: 1, tokensOut: 1, latencyMs: 1 };
      });
      await invokeHaiku(
        { system: "S", user: "U" },
        z.object({}),
        { temperature: 0.9, maxTokens: 512 },
      );
      expect(usedTemp).toBe(0.9);
      expect(usedMax).toBe(512);
    });
  });
});
