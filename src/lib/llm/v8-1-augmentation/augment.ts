// V8.1 LLM-Augmentation — Core Orchestration (Cache → LLM → Tonality → Fallback)
//
// Slice: SLC-161 MT-4
// Spec: slices/SLC-161-llm-augmentation-backend.md
// ARCHITECTURE.md V8.1 Section, DEC-167/174/175
//
// Eintrittspunkt: augmentEmpfehlungsText(input) liefert pro Hebel entweder einen
// LLM-augmentierten Text ODER einen deterministischen Fallback-Text. Cache wird
// nur geschrieben, wenn alle 3 Hebel erfolgreich augmentiert wurden (atomar).

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatWithLLM } from "@/lib/llm";
import {
  V8_1_PROMPT_VERSION,
  V8_1_MAX_WORD_COUNT,
  V8_1_SYSTEM_PROMPT,
  containsBlacklistedPattern,
  countWords,
} from "./prompt";
import {
  V8_1_CACHE_METADATA_KEY,
  buildCacheKey,
  isCacheHit,
  mergeCacheIntoMetadata,
  readCacheFromMetadata,
} from "./cache";
import {
  recordCacheHit,
  recordLlmCall,
  recordTonalityDrift,
} from "./audit";
import type {
  AugmentInput,
  AugmentOutput,
  CacheEntry,
  CacheStructure,
} from "./types";

// ─── Pricing (Sonnet 3.5: $3/$15 per 1M tokens) ───
const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

// ─── Defaults ───
const DEFAULT_MODEL_ID =
  process.env.BEDROCK_V8_1_MODEL_ID ||
  "anthropic.claude-3-5-sonnet-20241022-v2:0";
const DEFAULT_COST_CAP_USD = 0.05;
const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Result-Shape eines Bedrock-Calls inkl. Cost/Token-Schaetzung.
 * Aequivalent zu BedrockCallResult aus light-pipeline.ts (eigener Pfad, damit
 * V8.1 unabhaengig von Pipeline-Refactors bleibt).
 */
export interface BedrockCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
}

/** Injizierbarer Bedrock-Caller fuer Tests (Default: built-in via chatWithLLM). */
export type BedrockCaller = (args: {
  system: string;
  user: string;
  modelId: string;
}) => Promise<BedrockCallResult>;

const defaultBedrockCaller: BedrockCaller = async ({ system, user, modelId }) => {
  const start = Date.now();
  const text = await chatWithLLM(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS }
  );
  const latencyMs = Date.now() - start;
  const tokensIn = Math.ceil((system.length + user.length) / 4);
  const tokensOut = Math.ceil(text.length / 4);
  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN,
    latencyMs,
    modelId,
  };
};

export interface AugmentRunOptions {
  /** Override Modell-ID (Default: process.env.BEDROCK_V8_1_MODEL_ID oder Sonnet 3.5) */
  modelId?: string;
  /** Override Prompt-Version (Default: V8_1_PROMPT_VERSION) */
  promptVersion?: string;
  /** Hard-Cap fuer Session-Cost in USD (Default: 0.05) */
  costCapUsd?: number;
  /** Test-Hook fuer Bedrock-Mock */
  bedrockCaller?: BedrockCaller;
}

export interface AugmentRunInput {
  supabaseAdmin: SupabaseClient;
  captureSessionId: string;
  tenantId: string;
  hebel: AugmentInput[];
  options?: AugmentRunOptions;
}

/**
 * Baut den User-Prompt pro Hebel. Kombiniert Modul-Kontext mit deterministischem
 * V8.0-Stufen-Text als Inspiration. Mandant-Kontext optional (z.B. Branche).
 */
export function buildUserPromptForHebel(input: AugmentInput): string {
  const lines = [
    `Modul: ${input.modulName}`,
    `Aktuelle SUI-Stufe: ${input.aktuelleStufe} (Skala 1-5)`,
    "",
    "Deterministische Beobachtung zu diesem Modul (Quelle: V8-Diagnose):",
    input.deterministischerStufenText,
  ];

  if (input.mandantKontext && input.mandantKontext.trim().length > 0) {
    lines.push("", "Mandant-Kontext:", input.mandantKontext);
  }

  lines.push(
    "",
    "Formuliere die Empfehlung in 2-3 Saetzen, max 80 Worte, in Strategaize-Wir-Voice."
  );

  return lines.join("\n");
}

/**
 * Liest capture_session.metadata via Supabase Admin Client.
 * Liefert {} bei nicht-existentem oder leerem metadata-Object.
 */
async function readCaptureSessionMetadata(
  adminClient: SupabaseClient,
  captureSessionId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await adminClient
    .from("capture_session")
    .select("metadata")
    .eq("id", captureSessionId)
    .single();

  if (error) {
    throw new Error(
      `Failed to read capture_session.metadata for ${captureSessionId}: ${error.message}`
    );
  }

  return (data?.metadata as Record<string, unknown>) ?? {};
}

/**
 * Schreibt das gemergte metadata-Object via Supabase Admin Client.
 * Fetch-Merge-Write Pattern (feedback_fetch_merge_write_supabase_jsonb.md) —
 * Supabase JS SDK kann jsonb-||-Konkat-Operator nicht direkt.
 * Single-Writer-Race-Safety reicht fuer V8.1 (Sync-Render, ein Worker pro Session).
 */
async function writeCaptureSessionMetadata(
  adminClient: SupabaseClient,
  captureSessionId: string,
  mergedMetadata: Record<string, unknown>
): Promise<void> {
  const { error } = await adminClient
    .from("capture_session")
    .update({ metadata: mergedMetadata })
    .eq("id", captureSessionId);

  if (error) {
    throw new Error(
      `Failed to write capture_session.metadata for ${captureSessionId}: ${error.message}`
    );
  }
}

/**
 * Wandelt einen Cache-Entry (aus JSONB) in einen AugmentOutput um.
 * Genutzt im Cache-Hit-Pfad.
 */
function cacheEntryToOutput(entry: CacheEntry): AugmentOutput {
  return {
    modulName: entry.modul_name,
    modulId: entry.modul_id,
    aktuelleStufe: entry.aktuelle_stufe,
    text: entry.text,
    isLlmAugmented: entry.is_llm_augmented,
    tokenCount: entry.token_count,
    costUsd: entry.cost_usd,
  };
}

/**
 * Baut einen Fallback-AugmentOutput aus dem deterministischen Stufen-Text.
 */
function fallbackOutput(
  input: AugmentInput,
  reason: NonNullable<AugmentOutput["fallbackReason"]>
): AugmentOutput {
  return {
    modulName: input.modulName,
    modulId: input.modulId,
    aktuelleStufe: input.aktuelleStufe,
    text: input.deterministischerStufenText,
    isLlmAugmented: false,
    fallbackReason: reason,
  };
}

/**
 * Wandelt erfolgreiche AugmentOutputs in CacheEntries fuer JSONB-Persistenz.
 */
function outputsToCacheEntries(outputs: AugmentOutput[]): CacheEntry[] {
  return outputs.map((o) => ({
    modul_name: o.modulName,
    modul_id: o.modulId,
    aktuelle_stufe: o.aktuelleStufe,
    text: o.text,
    is_llm_augmented: o.isLlmAugmented,
    token_count: o.tokenCount ?? { input: 0, output: 0 },
    cost_usd: o.costUsd ?? 0,
  }));
}

/**
 * HAUPT-Eintrittspunkt: liefert pro Hebel einen Text (LLM-augmentiert oder Fallback).
 *
 * Flow:
 * 1. Resolve modelId + promptVersion → currentKey
 * 2. Read capture_session.metadata
 * 3. Cache-Hit? → recordCacheHit + return cached outputs (0 LLM-Calls)
 * 4. Cache-Miss? → fuer jeden Hebel sequentiell:
 *    a. Cost-Cap-Check (akkumulierter Cost >= costCap → Fallback ohne LLM-Call)
 *    b. Bedrock-Call mit System+User-Prompt
 *    c. Tonality-Validation (Blacklist) → Drift → Fallback + recordTonalityDrift
 *    d. Word-Count-Check (>80) → Fallback
 *    e. Erfolg → AugmentOutput mit isLlmAugmented=true
 *    f. recordLlmCall (success oder fail)
 * 5. Wenn alle 3 Hebel erfolgreich → atomarer Cache-Write (fetch-merge-write)
 * 6. Bei Teil-Erfolg KEIN Cache-Write (naechster Render retried)
 */
export async function augmentEmpfehlungsText(
  input: AugmentRunInput
): Promise<AugmentOutput[]> {
  const { supabaseAdmin, captureSessionId, tenantId, hebel, options } = input;

  const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  const promptVersion = options?.promptVersion ?? V8_1_PROMPT_VERSION;
  const costCap = options?.costCapUsd ?? DEFAULT_COST_CAP_USD;
  const bedrockCall = options?.bedrockCaller ?? defaultBedrockCaller;
  const currentKey = buildCacheKey(modelId, promptVersion);

  // ─── Step 1: Read metadata + check cache ───
  const metadata = await readCaptureSessionMetadata(supabaseAdmin, captureSessionId);
  const cachedStructure = readCacheFromMetadata(metadata);

  if (isCacheHit(cachedStructure, currentKey)) {
    // Cache-Hit — kein LLM-Call, return cached outputs.
    await recordCacheHit(supabaseAdmin, {
      captureSessionId,
      modelId,
      promptVersion,
    });
    return cachedStructure!.hebel.map(cacheEntryToOutput);
  }

  // ─── Step 2: Cache-Miss → iterate hebel sequentially ───
  const outputs: AugmentOutput[] = [];
  let accumulatedCost = 0;
  let allLlmSuccess = true;

  for (const h of hebel) {
    // ─── Cost-Cap (vor LLM-Call) ───
    if (accumulatedCost >= costCap) {
      outputs.push(fallbackOutput(h, "cost_cap_hit"));
      allLlmSuccess = false;
      await recordLlmCall(supabaseAdmin, {
        tenantId,
        modelId,
        modulName: h.modulName,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        latencyMs: 0,
        success: false,
      });
      continue;
    }

    // ─── Bedrock-Call ───
    let callResult: BedrockCallResult;
    try {
      callResult = await bedrockCall({
        system: V8_1_SYSTEM_PROMPT,
        user: buildUserPromptForHebel(h),
        modelId,
      });
    } catch {
      outputs.push(fallbackOutput(h, "bedrock_error"));
      allLlmSuccess = false;
      await recordLlmCall(supabaseAdmin, {
        tenantId,
        modelId,
        modulName: h.modulName,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        latencyMs: 0,
        success: false,
      });
      continue;
    }

    accumulatedCost += callResult.costUsd;

    // ─── Tonality-Validation ───
    if (containsBlacklistedPattern(callResult.text)) {
      await recordTonalityDrift(supabaseAdmin, {
        captureSessionId,
        modulName: h.modulName,
        driftSnippet: callResult.text,
      });
      outputs.push(fallbackOutput(h, "tonality_drift"));
      allLlmSuccess = false;
      await recordLlmCall(supabaseAdmin, {
        tenantId,
        modelId,
        modulName: h.modulName,
        tokensIn: callResult.tokensIn,
        tokensOut: callResult.tokensOut,
        costUsd: callResult.costUsd,
        latencyMs: callResult.latencyMs,
        success: false,
      });
      continue;
    }

    // ─── Word-Count-Check ───
    if (countWords(callResult.text) > V8_1_MAX_WORD_COUNT) {
      outputs.push(fallbackOutput(h, "word_count_exceeded"));
      allLlmSuccess = false;
      await recordLlmCall(supabaseAdmin, {
        tenantId,
        modelId,
        modulName: h.modulName,
        tokensIn: callResult.tokensIn,
        tokensOut: callResult.tokensOut,
        costUsd: callResult.costUsd,
        latencyMs: callResult.latencyMs,
        success: false,
      });
      continue;
    }

    // ─── Success ───
    outputs.push({
      modulName: h.modulName,
      modulId: h.modulId,
      aktuelleStufe: h.aktuelleStufe,
      text: callResult.text,
      isLlmAugmented: true,
      tokenCount: { input: callResult.tokensIn, output: callResult.tokensOut },
      costUsd: callResult.costUsd,
    });

    await recordLlmCall(supabaseAdmin, {
      tenantId,
      modelId,
      modulName: h.modulName,
      tokensIn: callResult.tokensIn,
      tokensOut: callResult.tokensOut,
      costUsd: callResult.costUsd,
      latencyMs: callResult.latencyMs,
      success: true,
    });
  }

  // ─── Step 3: Cache-Write nur bei All-or-Nothing-Success ───
  if (allLlmSuccess) {
    const newCache: CacheStructure = {
      cache_key: currentKey,
      augmented_at: new Date().toISOString(),
      hebel: outputsToCacheEntries(outputs),
    };
    const merged = mergeCacheIntoMetadata(metadata, newCache);
    await writeCaptureSessionMetadata(supabaseAdmin, captureSessionId, merged);
  }

  return outputs;
}

// Internal exports fuer Tests (Cache-Key-Helper Re-Export).
export { V8_1_CACHE_METADATA_KEY };
