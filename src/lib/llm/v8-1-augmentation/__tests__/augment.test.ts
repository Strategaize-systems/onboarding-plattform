// augment.test.ts — Verifiziert die Cache-Hit/Miss Branching-Logic,
// Tonality/Word-Count/Cost-Cap-Fallbacks und Audit-Aufrufe.
// LLM wird ueber injectable BedrockCaller gemockt. Supabase Admin Client wird
// ueber ein minimales Test-Stub simuliert (records inserts, serves stubbed reads).

import { describe, it, expect, beforeEach } from "vitest";
import {
  augmentEmpfehlungsText,
  buildUserPromptForHebel,
  type BedrockCaller,
  type BedrockCallResult,
  V8_1_CACHE_METADATA_KEY,
} from "../augment";
import { buildCacheKey } from "../cache";
import { V8_1_PROMPT_VERSION } from "../prompt";
import type { AugmentInput, CacheStructure } from "../types";

// ─── Minimal Supabase Admin Stub ──────────────────────────────────────────
interface CapturedInsert {
  table: string;
  row: Record<string, unknown>;
}
interface CapturedUpdate {
  table: string;
  row: Record<string, unknown>;
  where: { col: string; val: unknown };
}

function makeAdminStub(opts: {
  metadata?: Record<string, unknown> | null;
} = {}) {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];

  let currentMetadata: Record<string, unknown> | null = opts.metadata ?? {};

  const stub = {
    from(table: string) {
      let whereCol: string | null = null;
      let whereVal: unknown = null;

      const builder = {
        select(_cols: string) {
          return builder;
        },
        eq(col: string, val: unknown) {
          whereCol = col;
          whereVal = val;
          return builder;
        },
        single: async () => {
          if (table === "capture_session" && whereCol === "id") {
            return {
              data: { metadata: currentMetadata },
              error: null,
            };
          }
          return { data: null, error: { message: "not found" } };
        },
        update(row: Record<string, unknown>) {
          return {
            eq: async (col: string, val: unknown) => {
              updates.push({ table, row, where: { col, val } });
              if (table === "capture_session" && col === "id") {
                currentMetadata = (row.metadata ?? null) as Record<string, unknown> | null;
              }
              return { error: null };
            },
          };
        },
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return { error: null };
        },
      };
      return builder;
    },
  };

  return {
    client: stub as unknown as import("@supabase/supabase-js").SupabaseClient,
    inserts,
    updates,
    getCurrentMetadata: () => currentMetadata,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const TENANT_ID = "00000000-0000-0000-0000-000000000111";
const SESSION_ID = "00000000-0000-0000-0000-000000000222";
const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

function makeHebel(overrides: Partial<AugmentInput> = {}): AugmentInput {
  return {
    modulName: "Modul 4 — Operative Skalierbarkeit",
    modulId: 4,
    aktuelleStufe: 2,
    deterministischerStufenText: "Auf Stufe 2 ist die operative Skalierbarkeit noch personengebunden.",
    ...overrides,
  };
}

function makeThreeHebel(): AugmentInput[] {
  return [
    makeHebel({ modulName: "Modul 4", modulId: 4 }),
    makeHebel({ modulName: "Modul 5", modulId: 5 }),
    makeHebel({ modulName: "Modul 7", modulId: 7 }),
  ];
}

function makeCachedStructure(
  modelId: string,
  promptVersion: string,
  hebelCount = 3
): CacheStructure {
  return {
    cache_key: buildCacheKey(modelId, promptVersion),
    augmented_at: "2026-05-30T08:00:00.000Z",
    hebel: Array.from({ length: hebelCount }).map((_, i) => ({
      modul_name: `Modul ${4 + i}`,
      modul_id: 4 + i,
      aktuelle_stufe: 2,
      text: `Cached recommendation #${i + 1}`,
      is_llm_augmented: true,
      token_count: { input: 100, output: 50 },
      cost_usd: 0.001,
    })),
  };
}

function makeStubCaller(textsOrErrors: (string | Error)[]): BedrockCaller {
  let i = 0;
  return async (): Promise<BedrockCallResult> => {
    const item = textsOrErrors[i++];
    if (item instanceof Error) throw item;
    const text = item;
    const tokensIn = 200;
    const tokensOut = Math.ceil(text.length / 4);
    return {
      text,
      tokensIn,
      tokensOut,
      costUsd: 0.005,
      latencyMs: 3000,
      modelId: MODEL_ID,
    };
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("buildUserPromptForHebel", () => {
  it("includes modul name, stufe and deterministic text", () => {
    const prompt = buildUserPromptForHebel(makeHebel());
    expect(prompt).toContain("Modul 4");
    expect(prompt).toContain("Stufe: 2");
    expect(prompt).toContain("personengebunden");
  });

  it("appends mandantKontext when provided", () => {
    const prompt = buildUserPromptForHebel(
      makeHebel({ mandantKontext: "Familienunternehmen, 50 MA" })
    );
    expect(prompt).toContain("Familienunternehmen, 50 MA");
  });

  it("omits mandantKontext section when not provided", () => {
    const prompt = buildUserPromptForHebel(makeHebel());
    expect(prompt).not.toContain("Mandant-Kontext");
  });

  it("instructs Strategaize-Wir-Voice", () => {
    const prompt = buildUserPromptForHebel(makeHebel());
    expect(prompt).toContain("Strategaize-Wir-Voice");
  });
});

describe("augmentEmpfehlungsText — Cache-Hit Pfad", () => {
  it("returns cached outputs without invoking Bedrock when cache_key matches", async () => {
    const cached = makeCachedStructure(MODEL_ID, V8_1_PROMPT_VERSION);
    const stub = makeAdminStub({
      metadata: { [V8_1_CACHE_METADATA_KEY]: cached },
    });

    let callCount = 0;
    const caller: BedrockCaller = async () => {
      callCount++;
      throw new Error("should not be called");
    };

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(callCount).toBe(0);
    expect(outputs.length).toBe(3);
    expect(outputs[0].text).toBe("Cached recommendation #1");
    expect(outputs[0].isLlmAugmented).toBe(true);

    const cacheHitEntries = stub.inserts.filter(
      (i) => i.table === "error_log" && i.row.source === "v8_1_llm_cache_hit"
    );
    expect(cacheHitEntries.length).toBe(1);

    const updateCount = stub.updates.length;
    expect(updateCount).toBe(0);
  });

  it("does NOT hit cache when stored cache_key has different model_id", async () => {
    const cached = makeCachedStructure("oldModel", V8_1_PROMPT_VERSION);
    const stub = makeAdminStub({
      metadata: { [V8_1_CACHE_METADATA_KEY]: cached },
    });

    const caller = makeStubCaller([
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
    ]);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs.every((o) => o.isLlmAugmented)).toBe(true);
    const cacheHitEntries = stub.inserts.filter(
      (i) => i.table === "error_log" && i.row.source === "v8_1_llm_cache_hit"
    );
    expect(cacheHitEntries.length).toBe(0);
  });

  it("does NOT hit cache when prompt_version differs", async () => {
    const cached = makeCachedStructure(MODEL_ID, "v999");
    const stub = makeAdminStub({
      metadata: { [V8_1_CACHE_METADATA_KEY]: cached },
    });

    const caller = makeStubCaller([
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
      "Wir empfehlen, dieses Modul zu staerken. Lassen Sie uns sprechen.",
    ]);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs.every((o) => o.isLlmAugmented)).toBe(true);
  });
});

describe("augmentEmpfehlungsText — Cache-Miss success path", () => {
  it("invokes Bedrock 3 times, all augmented, writes cache atomically", async () => {
    const stub = makeAdminStub({ metadata: {} });
    const validTexts = [
      "Wir sehen in diesem Modul ein zentrales Handlungsfeld. Lassen Sie uns gemeinsam Loesungen entwickeln.",
      "Wir empfehlen einen klaren Massnahmen-Plan. Lassen Sie uns dazu sprechen.",
      "Wir koennen Ihnen hier praktische Schritte aufzeigen. Sprechen wir darueber.",
    ];
    const caller = makeStubCaller(validTexts);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs.length).toBe(3);
    expect(outputs.every((o) => o.isLlmAugmented)).toBe(true);
    expect(outputs[0].text).toBe(validTexts[0]);

    const llmCallInserts = stub.inserts.filter(
      (i) => i.table === "ai_cost_ledger"
    );
    expect(llmCallInserts.length).toBe(3);
    expect(llmCallInserts.every((i) => i.row.role === "v8_1_augmentation")).toBe(true);

    expect(stub.updates.length).toBe(1);
    const meta = stub.getCurrentMetadata();
    const writtenCache = meta?.[V8_1_CACHE_METADATA_KEY] as CacheStructure;
    expect(writtenCache).toBeDefined();
    expect(writtenCache.cache_key).toBe(buildCacheKey(MODEL_ID, V8_1_PROMPT_VERSION));
    expect(writtenCache.hebel.length).toBe(3);
  });

  it("preserves existing v8_report_snapshot during cache write", async () => {
    const existingSnapshot = {
      v8_report_snapshot: { schemaVersion: "1.0", dummy: true },
    };
    const stub = makeAdminStub({ metadata: existingSnapshot });
    const caller = makeStubCaller([
      "Wir sehen Handlungsbedarf. Sprechen wir.",
      "Wir empfehlen Massnahmen. Sprechen wir.",
      "Wir zeigen Loesungen auf. Sprechen wir.",
    ]);

    await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    const meta = stub.getCurrentMetadata();
    expect(meta?.v8_report_snapshot).toEqual(existingSnapshot.v8_report_snapshot);
    expect(meta?.[V8_1_CACHE_METADATA_KEY]).toBeDefined();
  });
});

describe("augmentEmpfehlungsText — Tonality-Drift Fallback", () => {
  it("falls back on tonality blacklist hit, records drift, NO cache write", async () => {
    const stub = makeAdminStub({ metadata: {} });
    const caller = makeStubCaller([
      "Wir empfehlen das. Sprechen wir.", // valid
      "Ich glaube, mein Team sollte das pruefen.", // tonality drift!
      "Wir empfehlen das. Sprechen wir.", // valid
    ]);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs[0].isLlmAugmented).toBe(true);
    expect(outputs[1].isLlmAugmented).toBe(false);
    expect(outputs[1].fallbackReason).toBe("tonality_drift");
    expect(outputs[1].text).toBe("Auf Stufe 2 ist die operative Skalierbarkeit noch personengebunden.");
    expect(outputs[2].isLlmAugmented).toBe(true);

    const tonalityDriftEntries = stub.inserts.filter(
      (i) => i.table === "error_log" && i.row.source === "v8_1_llm_tonality_drift"
    );
    expect(tonalityDriftEntries.length).toBe(1);

    expect(stub.updates.length).toBe(0);
  });
});

describe("augmentEmpfehlungsText — Word-Count Fallback", () => {
  it("falls back when LLM output exceeds 80 words", async () => {
    const stub = makeAdminStub({ metadata: {} });
    const tooLong = Array(85).fill("Wir").join(" "); // 85 words, all word-boundary-safe
    const caller = makeStubCaller([
      "Wir empfehlen. Sprechen wir.",
      tooLong,
      "Wir empfehlen. Sprechen wir.",
    ]);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs[1].isLlmAugmented).toBe(false);
    expect(outputs[1].fallbackReason).toBe("word_count_exceeded");

    expect(stub.updates.length).toBe(0);
  });
});

describe("augmentEmpfehlungsText — Bedrock-Error Fallback", () => {
  it("falls back when Bedrock throws", async () => {
    const stub = makeAdminStub({ metadata: {} });
    const caller = makeStubCaller([
      "Wir empfehlen. Sprechen wir.",
      new Error("Bedrock timeout"),
      "Wir empfehlen. Sprechen wir.",
    ]);

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    expect(outputs[1].isLlmAugmented).toBe(false);
    expect(outputs[1].fallbackReason).toBe("bedrock_error");

    const failedCalls = stub.inserts.filter(
      (i) => i.table === "ai_cost_ledger" && i.row.tokens_in === 0
    );
    expect(failedCalls.length).toBeGreaterThanOrEqual(1);

    expect(stub.updates.length).toBe(0);
  });
});

describe("augmentEmpfehlungsText — Cost-Cap Fallback", () => {
  it("falls back to deterministic text after cost cap exceeded", async () => {
    const stub = makeAdminStub({ metadata: {} });

    // Caller returns texts but with HIGH cost per call → cap hit after 2 calls
    let i = 0;
    const expensiveCaller: BedrockCaller = async () => {
      i++;
      return {
        text: "Wir empfehlen das. Sprechen wir.",
        tokensIn: 200,
        tokensOut: 100,
        costUsd: 0.03, // 0.03 + 0.03 = 0.06 > 0.05 cap
        latencyMs: 3000,
        modelId: MODEL_ID,
      };
    };

    const outputs = await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: expensiveCaller, costCapUsd: 0.05 },
    });

    expect(outputs[0].isLlmAugmented).toBe(true);
    expect(outputs[1].isLlmAugmented).toBe(true);
    expect(outputs[2].isLlmAugmented).toBe(false);
    expect(outputs[2].fallbackReason).toBe("cost_cap_hit");
    expect(i).toBe(2);

    expect(stub.updates.length).toBe(0);
  });
});

describe("augmentEmpfehlungsText — Audit-Trail Discipline", () => {
  let stub: ReturnType<typeof makeAdminStub>;

  beforeEach(() => {
    stub = makeAdminStub({ metadata: {} });
  });

  it("emits one recordLlmCall per hebel (3 ai_cost_ledger + 3 error_log entries)", async () => {
    const caller = makeStubCaller([
      "Wir empfehlen. Sprechen wir.",
      "Wir empfehlen. Sprechen wir.",
      "Wir empfehlen. Sprechen wir.",
    ]);

    await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    const costLedger = stub.inserts.filter((i) => i.table === "ai_cost_ledger");
    expect(costLedger.length).toBe(3);

    const llmCallLogs = stub.inserts.filter(
      (i) => i.table === "error_log" && i.row.source === "v8_1_llm_call"
    );
    expect(llmCallLogs.length).toBe(3);
    expect(llmCallLogs.every((l) => l.row.level === "info")).toBe(true);
  });

  it("tags failed calls with level='warn' in error_log", async () => {
    const caller = makeStubCaller([
      "Wir empfehlen. Sprechen wir.",
      new Error("boom"),
      "Wir empfehlen. Sprechen wir.",
    ]);

    await augmentEmpfehlungsText({
      supabaseAdmin: stub.client,
      captureSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      hebel: makeThreeHebel(),
      options: { modelId: MODEL_ID, bedrockCaller: caller },
    });

    const llmCallLogs = stub.inserts.filter(
      (i) => i.table === "error_log" && i.row.source === "v8_1_llm_call"
    );
    const warnEntries = llmCallLogs.filter((l) => l.row.level === "warn");
    expect(warnEntries.length).toBe(1);
  });
});
