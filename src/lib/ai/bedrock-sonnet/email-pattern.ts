// V9 SLC-167 MT-2 — Bedrock-Sonnet Email-Pattern-Extraktion Pure-Function
//
// Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-2)
// DECs: DEC-180 (Async-Worker), DEC-181 (V4.1-Sections-Default), DEC-182 (Cost-Cap)
// Region-Pflicht: eu-central-1 (data-residency.md)
//
// Pattern-Reuse aus src/lib/ai/bedrock-haiku/index.ts (V9 SLC-166 MT-1):
//   - BedrockRuntimeClient + ConverseCommand
//   - Test-Injection-Hook via __setSonnetCallerForTests / __resetSonnetCallerForTests
//   - JSON-Extraction mit Markdown-Codeblock-Strip
//   - zod-Validation post-Parse mit SchemaError
//   - Region hardcoded BEDROCK_SONNET_REGION = 'eu-central-1'
//
// Erweiterung vs Haiku:
//   - Pricing Sonnet 4 (= Sonnet 3.5 Bedrock-Pricing): $3 input / $15 output per 1M tokens (eu-central-1)
//   - Modell-ID-Default: eu.anthropic.claude-sonnet-4-20250514-v1:0 (ENV BEDROCK_V9_SONNET_MODEL_ID) — V9.5 SLC-V9.5-A DEC-218
//   - Spezifische extractPatternFromThread-Funktion mit PatternExtractionResultSchema
//   - Thread-ID-Override im Output (Caller-vorgegeben — Modell-Drift soll nicht reichen)

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import {
  V9_PATTERN_PROMPT_VERSION,
  V9_PATTERN_SYSTEM_PROMPT,
  buildPatternUserPrompt,
} from "./email-pattern-prompt";
import {
  PatternExtractionResultSchema,
  SonnetSchemaError,
} from "./types";
import type {
  PatternExtractionResult,
  SonnetCallResult,
  SonnetInvocationOptions,
  ThreadMeta,
} from "./types";

// ─── Pricing (Sonnet 4 = Sonnet 3.5 Bedrock-Pricing, eu-central-1) ───
// Stand 2026. Sonnet-4 hat identisches Bedrock-Pricing wie Sonnet-3.5 ($3/$15),
// daher bleiben die Konstanten beim Modell-Wechsel unveraendert (V9.5 SLC-V9.5-A).
const COST_PER_INPUT_TOKEN_USD = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 15.0 / 1_000_000;

// ─── Hardcoded Region per data-residency.md (eu-central-1 Frankfurt) ───
export const BEDROCK_SONNET_REGION = "eu-central-1" as const;

// ─── Default Model-ID (overridable via ENV) ───
const DEFAULT_SONNET_MODEL_ID = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

function resolveModelId(override?: string): string {
  if (override) return override;
  return process.env.BEDROCK_V9_SONNET_MODEL_ID || DEFAULT_SONNET_MODEL_ID;
}

// ─── Bedrock-Client (Singleton, hardcoded eu-central-1) ───
let cachedClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_SONNET_REGION });
  }
  return cachedClient;
}

/**
 * Injection-Hook fuer Tests (vermeidet echte AWS-Calls).
 * Wenn gesetzt, ersetzt diese Funktion den eingebauten Bedrock-ConverseCommand-Pfad.
 * Test-Code setzt das via __setSonnetCallerForTests + __resetSonnetCallerForTests.
 */
export type SonnetRawCaller = (args: {
  system: string;
  user: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
}) => Promise<{
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}>;

let injectedCaller: SonnetRawCaller | null = null;

/** Test-only: inject a mock raw caller. Production code never calls this. */
export function __setSonnetCallerForTests(caller: SonnetRawCaller): void {
  injectedCaller = caller;
}

/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetSonnetCallerForTests(): void {
  injectedCaller = null;
}

const productionCaller: SonnetRawCaller = async ({
  system,
  user,
  modelId,
  temperature,
  maxTokens,
}) => {
  const start = Date.now();
  const client = getBedrockClient();
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { temperature, maxTokens },
    }),
  );
  const latencyMs = Date.now() - start;
  const text = response.output?.message?.content?.[0]?.text ?? "";
  if (!text) {
    throw new Error("Bedrock-Sonnet: empty response (no output text)");
  }
  const tokensIn =
    response.usage?.inputTokens ?? Math.ceil((system.length + user.length) / 4);
  const tokensOut =
    response.usage?.outputTokens ?? Math.ceil(text.length / 4);
  return { text, tokensIn, tokensOut, latencyMs };
};

/**
 * Extracts a JSON value from raw Sonnet output.
 *
 * Sonnet-Konvention (V9): Output beginnt mit `{` und endet vor optionalem
 * trailing whitespace. System-Prompt verbietet Markdown-Codeblocks, aber
 * Modell-Drift kann ```json ... ``` produzieren — wir strippen das defensiv.
 * Keine schwergewichtige JSON-Reparatur — Drift wirft SonnetSchemaError und
 * der Caller (Worker) markiert den Thread als pattern_extraction_failed.
 */
function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return trimmed;
}

/**
 * Haupt-Eintrittspunkt: extrahiert Pattern aus einem pseudonymisierten
 * Email-Thread via Bedrock Sonnet 3.5.
 *
 * Vertrag:
 *   - Region IMMER eu-central-1 (BEDROCK_SONNET_REGION).
 *   - Modell-ID via Options-Override oder ENV BEDROCK_V9_SONNET_MODEL_ID (Default Sonnet 3.5).
 *   - thread_id im Output wird vom Caller vorgegeben (Modell-Wert wird ueberschrieben).
 *   - Bei leerem Output: throw Error (kein SonnetSchemaError, das ist Network/Bedrock).
 *   - Bei nicht-JSON-Output: throw SonnetSchemaError.
 *   - Bei Schema-Drift: throw SonnetSchemaError mit zod-Issues.
 *   - Bei AWS-Error: throw original Error (Caller faengt + audit).
 *
 * Caller (Worker) ist verantwortlich fuer ai_cost_ledger-INSERT mit role
 * `email_bulk_pattern_extraction`.
 */
export async function extractPatternFromThread(
  redactedBody: string,
  threadMeta: ThreadMeta,
  options?: SonnetInvocationOptions,
): Promise<SonnetCallResult<PatternExtractionResult>> {
  const modelId = resolveModelId(options?.modelId);
  const temperature = options?.temperature ?? 0.2;
  const maxTokens = options?.maxTokens ?? 4096;

  const userPrompt = buildPatternUserPrompt({
    threadId: threadMeta.threadId,
    redactedBody,
    subject: threadMeta.subject,
    emailCount: threadMeta.emailCount,
    firstDate: threadMeta.firstDate,
  });

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({
    system: V9_PATTERN_SYSTEM_PROMPT,
    user: userPrompt,
    modelId,
    temperature,
    maxTokens,
  });

  if (!raw.text || raw.text.trim().length === 0) {
    throw new Error("Bedrock-Sonnet: empty response (no output text)");
  }

  const candidate = extractJsonCandidate(raw.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new SonnetSchemaError(
      `Sonnet output is not valid JSON: ${msg}`,
      raw.text,
      null,
    );
  }

  // Defense: ueberschreibe thread_id mit Caller-Wert, damit Modell-Drift
  // (z.B. Hallucinated-ID) nicht zu Mismatch fuehrt.
  if (parsed && typeof parsed === "object") {
    (parsed as Record<string, unknown>).thread_id = threadMeta.threadId;
  }

  const result = PatternExtractionResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new SonnetSchemaError(
      "Sonnet output does not match PatternExtractionResultSchema",
      raw.text,
      result.error.issues,
    );
  }

  const costUsd =
    raw.tokensIn * COST_PER_INPUT_TOKEN_USD +
    raw.tokensOut * COST_PER_OUTPUT_TOKEN_USD;

  return {
    data: result.data,
    rawText: raw.text,
    tokensIn: raw.tokensIn,
    tokensOut: raw.tokensOut,
    costUsd,
    latencyMs: raw.latencyMs,
    modelId,
    region: BEDROCK_SONNET_REGION,
  };
}

// Re-exports fuer Caller (Worker, Cost-Estimate-Service in MT-3+).
export { V9_PATTERN_PROMPT_VERSION, V9_PATTERN_SYSTEM_PROMPT };
export {
  PatternExtractionResultSchema,
  PatternSchema,
  SonnetSchemaError,
} from "./types";
export type {
  Pattern,
  PatternExtractionResult,
  SonnetCallAuditEntry,
  SonnetCallResult,
  SonnetInvocationOptions,
  SonnetPromptRequest,
  ThreadMeta,
} from "./types";
