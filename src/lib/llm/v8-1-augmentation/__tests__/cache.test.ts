import { describe, it, expect } from "vitest";
import {
  V8_1_CACHE_METADATA_KEY,
  buildCacheKey,
  isCacheHit,
  parseCacheStructure,
  readCacheFromMetadata,
  mergeCacheIntoMetadata,
} from "../cache";
import type { CacheStructure } from "../types";

function makeValidCache(overrides: Partial<CacheStructure> = {}): CacheStructure {
  return {
    cache_key: "anthropic.claude-3-5-sonnet-20241022-v2:0|v1",
    augmented_at: "2026-05-30T08:37:00.000Z",
    hebel: [
      {
        modul_name: "Modul 4 — Operative Skalierbarkeit",
        modul_id: 4,
        aktuelle_stufe: 2,
        text: "Wir sehen in der operativen Skalierbarkeit ein zentrales Handlungsfeld.",
        is_llm_augmented: true,
        token_count: { input: 812, output: 94 },
        cost_usd: 0.0067,
      },
    ],
    ...overrides,
  };
}

describe("V8_1_CACHE_METADATA_KEY", () => {
  it("is the stable JSONB-key string", () => {
    expect(V8_1_CACHE_METADATA_KEY).toBe("v8_1_llm_augmentation_cache");
  });
});

describe("buildCacheKey", () => {
  it("formats as {modelId}|{promptVersion}", () => {
    expect(buildCacheKey("anthropic.claude-3-5-sonnet-20241022-v2:0", "v1")).toBe(
      "anthropic.claude-3-5-sonnet-20241022-v2:0|v1"
    );
  });

  it("preserves model-ID colons unescaped", () => {
    const key = buildCacheKey("anthropic.claude-3-5-sonnet-20241022-v2:0", "v2");
    expect(key).toContain(":0");
  });

  it("differs when modelId differs", () => {
    expect(buildCacheKey("modelA", "v1")).not.toBe(buildCacheKey("modelB", "v1"));
  });

  it("differs when promptVersion differs", () => {
    expect(buildCacheKey("modelA", "v1")).not.toBe(buildCacheKey("modelA", "v2"));
  });
});

describe("isCacheHit", () => {
  it("returns false for null cache", () => {
    expect(isCacheHit(null, "anything")).toBe(false);
  });

  it("returns true when cache_key matches", () => {
    const cache = makeValidCache({ cache_key: "modelA|v1" });
    expect(isCacheHit(cache, "modelA|v1")).toBe(true);
  });

  it("returns false when modelId differs", () => {
    const cache = makeValidCache({ cache_key: "modelA|v1" });
    expect(isCacheHit(cache, "modelB|v1")).toBe(false);
  });

  it("returns false when promptVersion differs", () => {
    const cache = makeValidCache({ cache_key: "modelA|v1" });
    expect(isCacheHit(cache, "modelA|v2")).toBe(false);
  });

  it("is case-sensitive for cache_key match", () => {
    const cache = makeValidCache({ cache_key: "MODELA|v1" });
    expect(isCacheHit(cache, "modela|v1")).toBe(false);
  });
});

describe("parseCacheStructure", () => {
  it("returns null for null input", () => {
    expect(parseCacheStructure(null)).toBe(null);
  });

  it("returns null for undefined input", () => {
    expect(parseCacheStructure(undefined)).toBe(null);
  });

  it("returns null for string input", () => {
    expect(parseCacheStructure("not an object")).toBe(null);
  });

  it("returns null for number input", () => {
    expect(parseCacheStructure(42)).toBe(null);
  });

  it("returns null when cache_key missing", () => {
    const raw = {
      augmented_at: "2026-05-30T08:37:00.000Z",
      hebel: [],
    };
    expect(parseCacheStructure(raw)).toBe(null);
  });

  it("returns null when cache_key is not string", () => {
    const raw = {
      cache_key: 42,
      augmented_at: "2026-05-30T08:37:00.000Z",
      hebel: [],
    };
    expect(parseCacheStructure(raw)).toBe(null);
  });

  it("returns null when hebel not an array", () => {
    const raw = {
      cache_key: "modelA|v1",
      augmented_at: "2026-05-30T08:37:00.000Z",
      hebel: "not an array",
    };
    expect(parseCacheStructure(raw)).toBe(null);
  });

  it("returns null when hebel-entry missing required field", () => {
    const raw = {
      cache_key: "modelA|v1",
      augmented_at: "2026-05-30T08:37:00.000Z",
      hebel: [{ modul_name: "X" }],
    };
    expect(parseCacheStructure(raw)).toBe(null);
  });

  it("returns null when token_count is not object", () => {
    const raw = {
      cache_key: "modelA|v1",
      augmented_at: "2026-05-30T08:37:00.000Z",
      hebel: [
        {
          modul_name: "X",
          modul_id: 1,
          aktuelle_stufe: 2,
          text: "...",
          is_llm_augmented: true,
          token_count: "wrong",
          cost_usd: 0.01,
        },
      ],
    };
    expect(parseCacheStructure(raw)).toBe(null);
  });

  it("accepts valid CacheStructure", () => {
    const valid = makeValidCache();
    const parsed = parseCacheStructure(valid);
    expect(parsed).not.toBe(null);
    expect(parsed?.cache_key).toBe(valid.cache_key);
    expect(parsed?.hebel.length).toBe(1);
  });

  it("accepts empty hebel array", () => {
    const raw = makeValidCache({ hebel: [] });
    expect(parseCacheStructure(raw)).not.toBe(null);
  });
});

describe("readCacheFromMetadata", () => {
  it("returns null for null metadata", () => {
    expect(readCacheFromMetadata(null)).toBe(null);
  });

  it("returns null for undefined metadata", () => {
    expect(readCacheFromMetadata(undefined)).toBe(null);
  });

  it("returns null for empty metadata object", () => {
    expect(readCacheFromMetadata({})).toBe(null);
  });

  it("returns null when v8_1_llm_augmentation_cache key absent", () => {
    expect(readCacheFromMetadata({ v8_report_snapshot: { foo: "bar" } })).toBe(null);
  });

  it("returns CacheStructure when v8_1_llm_augmentation_cache key present and valid", () => {
    const cache = makeValidCache();
    const meta = { v8_1_llm_augmentation_cache: cache };
    const result = readCacheFromMetadata(meta);
    expect(result).not.toBe(null);
    expect(result?.cache_key).toBe(cache.cache_key);
  });

  it("returns null when v8_1_llm_augmentation_cache key present but malformed", () => {
    const meta = { v8_1_llm_augmentation_cache: { not_a_cache: true } };
    expect(readCacheFromMetadata(meta)).toBe(null);
  });
});

describe("mergeCacheIntoMetadata", () => {
  it("creates v8_1_llm_augmentation_cache key when metadata empty", () => {
    const cache = makeValidCache();
    const merged = mergeCacheIntoMetadata({}, cache);
    expect(merged[V8_1_CACHE_METADATA_KEY]).toEqual(cache);
  });

  it("creates v8_1_llm_augmentation_cache key when metadata is null", () => {
    const cache = makeValidCache();
    const merged = mergeCacheIntoMetadata(null, cache);
    expect(merged[V8_1_CACHE_METADATA_KEY]).toEqual(cache);
  });

  it("preserves existing keys (e.g. v8_report_snapshot)", () => {
    const cache = makeValidCache();
    const existing = { v8_report_snapshot: { finalizedAt: "2026-05-30" }, other_key: 42 };
    const merged = mergeCacheIntoMetadata(existing, cache);
    expect(merged.v8_report_snapshot).toEqual({ finalizedAt: "2026-05-30" });
    expect(merged.other_key).toBe(42);
    expect(merged[V8_1_CACHE_METADATA_KEY]).toEqual(cache);
  });

  it("overwrites existing v8_1_llm_augmentation_cache value", () => {
    const oldCache = makeValidCache({ cache_key: "modelA|v1" });
    const newCache = makeValidCache({ cache_key: "modelA|v2" });
    const merged = mergeCacheIntoMetadata({ [V8_1_CACHE_METADATA_KEY]: oldCache }, newCache);
    expect((merged[V8_1_CACHE_METADATA_KEY] as CacheStructure).cache_key).toBe("modelA|v2");
  });

  it("does not mutate the input metadata object", () => {
    const cache = makeValidCache();
    const existing = { v8_report_snapshot: { finalizedAt: "2026-05-30" } };
    mergeCacheIntoMetadata(existing, cache);
    expect(Object.keys(existing)).toEqual(["v8_report_snapshot"]);
  });

  it("roundtrip: merge then read returns identical cache", () => {
    const cache = makeValidCache();
    const merged = mergeCacheIntoMetadata({}, cache);
    const roundtripped = readCacheFromMetadata(merged);
    expect(roundtripped).toEqual(cache);
  });
});
