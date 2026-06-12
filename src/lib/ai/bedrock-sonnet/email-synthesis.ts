// V9.5 SLC-V9.5-B MT-2 — Bedrock-Sonnet Cross-Thread-Synthese Pure-Function
//
// Slice: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-2)
// Feature: FEAT-080  DECs: DEC-214/215/216/217
// Region-Pflicht: eu-central-1 (data-residency.md)
//
// Struktur 1:1 analog email-pattern.ts (Pattern-Reuse, strategaize-pattern-reuse.md):
//   - BedrockRuntimeClient + ConverseCommand
//   - Test-Injection-Hook via __setSynthesisCallerForTests / __resetSynthesisCallerForTests
//   - JSON-Extraction mit Markdown-Codeblock-Strip
//   - zod-Validation post-Parse mit SonnetSchemaError-Reuse
//   - Modell-ID-Default eu.anthropic.claude-sonnet-4-20250514-v1:0 (= SLC-V9.5-A,
//     ENV BEDROCK_V9_SONNET_MODEL_ID als Override)
//
// Unterschied zu email-pattern.ts:
//   - synthesizeSection(sectionName, patterns[]) statt extractPatternFromThread
//   - SynthesisResultSchema ({ units: [...] }) statt PatternExtractionResultSchema
//   - thread-agnostischer Synthese-Prompt (V95_SYNTHESIS_SYSTEM_PROMPT)
//
// Caller (Worker MT-4) ist verantwortlich fuer ai_cost_ledger-INSERT mit role
// `email_bulk_synthesis` + die Provenance-Rekonziliation der source_pattern_ids.

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import {
  V95_SYNTHESIS_PROMPT_VERSION,
  V95_SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
} from "./email-synthesis-prompt";
import { SynthesisResultSchema, SonnetSchemaError } from "./types";
import type {
  SynthesisInputPattern,
  SynthesisResult,
  SonnetCallResult,
  SonnetInvocationOptions,
} from "./types";
import type { SonnetRawCaller } from "./email-pattern";

// ─── Pricing (Sonnet 4 = Sonnet 3.5 Bedrock-Pricing, eu-central-1) ───
const COST_PER_INPUT_TOKEN_USD = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 15.0 / 1_000_000;

// ─── Hardcoded Region per data-residency.md (eu-central-1 Frankfurt) ───
export const BEDROCK_SYNTHESIS_REGION = "eu-central-1" as const;

// ─── Default Model-ID (overridable via ENV — gleicher ENV-Key wie Pattern) ───
const DEFAULT_SONNET_MODEL_ID = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

function resolveModelId(override?: string): string {
  if (override) return override;
  return process.env.BEDROCK_V9_SONNET_MODEL_ID || DEFAULT_SONNET_MODEL_ID;
}

// ─── Bedrock-Client (Singleton, hardcoded eu-central-1) ───
let cachedClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_SYNTHESIS_REGION });
  }
  return cachedClient;
}

let injectedCaller: SonnetRawCaller | null = null;

/** Test-only: inject a mock raw caller. Production code never calls this. */
export function __setSynthesisCallerForTests(caller: SonnetRawCaller): void {
  injectedCaller = caller;
}

/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetSynthesisCallerForTests(): void {
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
  const tokensOut = response.usage?.outputTokens ?? Math.ceil(text.length / 4);
  return { text, tokensIn, tokensOut, latencyMs };
};

/**
 * Extracts a JSON value from raw Sonnet output (defensives Codeblock-Strip).
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
 * Haupt-Eintrittspunkt: verdichtet die email_pattern-Fragmente einer
 * suggested_section-Gruppe zu konsolidierten Units via Bedrock Sonnet 4.
 *
 * Vertrag:
 *   - Region IMMER eu-central-1 (BEDROCK_SYNTHESIS_REGION).
 *   - Modell-ID via Options-Override oder ENV BEDROCK_V9_SONNET_MODEL_ID.
 *   - Bei leerem Output: throw Error (Network/Bedrock).
 *   - Bei nicht-JSON / Schema-Drift: throw SonnetSchemaError.
 *   - Bei AWS-Error: throw original Error (Worker faengt + status='failed').
 *
 * Der Worker (MT-4) rekonziliert die zurueckgegebenen source_pattern_ids gegen
 * die tatsaechlichen Input-Pattern-IDs (Defense gegen Modell-ID-Drift).
 */
export async function synthesizeSection(
  sectionName: string,
  patterns: SynthesisInputPattern[],
  options?: SonnetInvocationOptions,
): Promise<SonnetCallResult<SynthesisResult>> {
  const modelId = resolveModelId(options?.modelId);
  const temperature = options?.temperature ?? 0.2;
  const maxTokens = options?.maxTokens ?? 4096;

  const userPrompt = buildSynthesisUserPrompt(sectionName, patterns);

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({
    system: V95_SYNTHESIS_SYSTEM_PROMPT,
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
    const msg =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new SonnetSchemaError(
      `Sonnet synthesis output is not valid JSON: ${msg}`,
      raw.text,
      null,
    );
  }

  const result = SynthesisResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new SonnetSchemaError(
      "Sonnet output does not match SynthesisResultSchema",
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
    region: BEDROCK_SYNTHESIS_REGION,
  };
}

// Re-exports fuer Caller (Worker).
export { V95_SYNTHESIS_PROMPT_VERSION, V95_SYNTHESIS_SYSTEM_PROMPT };
export {
  SynthesisResultSchema,
  SynthesizedUnitSchema,
  SonnetSchemaError,
} from "./types";
export type {
  SynthesisInputPattern,
  SynthesisResult,
  SynthesizedUnit,
  SynthesizedEvidenceSnippet,
} from "./types";
