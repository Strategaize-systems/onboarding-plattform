// V9 SLC-166 MT-1 — Bedrock-Haiku-Adapter (Strict-JSON Output)
//
// Slice: SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md (MT-1)
// DECs: DEC-176 (V5-PII-Reuse + Email-Adapter), DEC-180 (Async-Worker), DEC-181 (Cost-Model)
//
// Pattern-Reuse aus:
//   - src/lib/llm.ts — BedrockRuntimeClient + ConverseCommand (Sonnet-Pfad)
//   - src/lib/llm/v8-1-augmentation/augment.ts — BedrockCaller-DI fuer Tests
//
// Erweiterung vs V8.1:
//   - Eigener Modell-ID-Slot (BEDROCK_V9_HAIKU_MODEL_ID) statt LLM_MODEL
//   - Strict-JSON-Schema-Validation via zod nach ConverseCommand-Output
//   - HaikuSchemaError fuer post-Call-Validation-Drift (Caller faengt + faellt zurueck)
//   - Region HARDCODED 'eu-central-1' (data-residency.md Pflicht, CI-Test verifiziert)
//
// Pricing-Hinweise (eu.anthropic.claude-haiku-4-5-20251001-v1:0 via Bedrock eu-central-1):
//   $1.00 per 1M input tokens / $5.00 per 1M output tokens (Haiku-4.5-Tier, Stand 2026).
//   V9.5 SLC-V9.5-A DEC-218: Tier-Wechsel Haiku-3 -> Haiku-4.5 aendert Pricing (R-A-1).
//   ID-/Pricing-Quelle: claude-api-Skill (first-party claude-haiku-4-5-20251001, $1/$5).
//   Live-Verify exakte Bedrock-Inference-Profile-ID + eu-central-1-Verfuegbarkeit im /deploy.

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { ZodTypeAny, z } from "zod";

import { HaikuSchemaError } from "./types";
import type {
  HaikuCallResult,
  HaikuInvocationOptions,
  HaikuPromptRequest,
} from "./types";

// ─── Pricing (Haiku 4.5 via Bedrock eu-central-1) ───
// V9.5 SLC-V9.5-A DEC-218 (R-A-1): Haiku-4.5-Tier = $1/$5 (vs Haiku-3 $0.25/$1.25).
const COST_PER_INPUT_TOKEN = 1.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 5.0 / 1_000_000;

// ─── Hardcoded Region per data-residency.md (eu-central-1 Frankfurt) ───
export const BEDROCK_HAIKU_REGION = "eu-central-1" as const;

// ─── Default Model-ID (overridable via ENV) ───
const DEFAULT_HAIKU_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

function resolveModelId(override?: string): string {
  if (override) return override;
  return process.env.BEDROCK_V9_HAIKU_MODEL_ID || DEFAULT_HAIKU_MODEL_ID;
}

// ─── Bedrock-Client (Singleton, hardcoded eu-central-1) ───
//
// Wird lazy initialisiert beim ersten Call. Region NICHT aus ENV gelesen —
// V9-Pflicht ist eu-central-1; lokale Dev-Overrides wuerden DSGVO-Audit brechen.
let cachedClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_HAIKU_REGION });
  }
  return cachedClient;
}

/**
 * Injection-Hook fuer Tests (vermeidet echte AWS-Calls).
 * Wenn gesetzt, ersetzt diese Funktion den eingebauten Bedrock-ConverseCommand-Pfad.
 * Test-Code setzt das via __setHaikuCallerForTests + __resetHaikuCallerForTests.
 */
export type HaikuRawCaller = (args: {
  system: string;
  user: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
}) => Promise<{ text: string; tokensIn: number; tokensOut: number; latencyMs: number }>;

let injectedCaller: HaikuRawCaller | null = null;

/** Test-only: inject a mock raw caller. Production code never calls this. */
export function __setHaikuCallerForTests(caller: HaikuRawCaller): void {
  injectedCaller = caller;
}

/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetHaikuCallerForTests(): void {
  injectedCaller = null;
}

const productionCaller: HaikuRawCaller = async ({
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
    throw new Error("Bedrock-Haiku: empty response (no output text)");
  }
  const tokensIn = response.usage?.inputTokens ?? Math.ceil((system.length + user.length) / 4);
  const tokensOut = response.usage?.outputTokens ?? Math.ceil(text.length / 4);
  return { text, tokensIn, tokensOut, latencyMs };
};

/**
 * Extracts a JSON value from raw Haiku output.
 *
 * Haiku-Konvention (V9): Output beginnt mit '{' oder '[' und endet vor optionalem
 * trailing text. Wenn Modell trotz Prompt einen Markdown-Codeblock zurueckliefert
 * (```json ... ```), strippen wir den Block. Wir wenden KEINE schwergewichtige
 * Reparatur an — bei Schema-Drift wirft zod.parse spaeter HaikuSchemaError, und
 * der Caller (Worker) markiert die Email als `unclear` (Pre-Filter-Default).
 */
function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  // Markdown-Codeblock-Strip (```json ... ``` oder ``` ... ```)
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return trimmed;
}

/**
 * Haupt-Eintrittspunkt: ruft Bedrock-Haiku auf, parsed Output, validiert via zod.
 *
 * Vertrag:
 *   - Region IMMER eu-central-1 (BEDROCK_HAIKU_REGION).
 *   - Modell-ID via Options-Override oder ENV BEDROCK_V9_HAIKU_MODEL_ID (Default Haiku 4.5).
 *   - System+User-Prompt werden 1:1 an ConverseCommand uebergeben.
 *   - Bei leerem Output: throw Error.
 *   - Bei nicht-JSON-Output: throw HaikuSchemaError (rawText snippet + zod issues).
 *   - Bei Schema-Drift: throw HaikuSchemaError (rawText snippet + zod issues).
 *   - Bei AWS-Error: throw original Error (Caller faengt + audit).
 *
 * Caller (Worker) ist verantwortlich fuer ai_cost_ledger-INSERT mit eigener role.
 */
export async function invokeHaiku<T extends ZodTypeAny>(
  request: HaikuPromptRequest,
  schema: T,
  options?: HaikuInvocationOptions,
): Promise<HaikuCallResult<z.infer<T>>> {
  const modelId = resolveModelId(options?.modelId);
  const temperature = options?.temperature ?? 0.2;
  const maxTokens = options?.maxTokens ?? 2048;

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({
    system: request.system,
    user: request.user,
    modelId,
    temperature,
    maxTokens,
  });

  if (!raw.text || raw.text.trim().length === 0) {
    throw new Error("Bedrock-Haiku: empty response (no output text)");
  }

  const candidate = extractJsonCandidate(raw.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new HaikuSchemaError(
      `Haiku output is not valid JSON: ${msg}`,
      raw.text,
      null,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HaikuSchemaError(
      "Haiku output does not match expected schema",
      raw.text,
      result.error.issues,
    );
  }

  const costUsd =
    raw.tokensIn * COST_PER_INPUT_TOKEN + raw.tokensOut * COST_PER_OUTPUT_TOKEN;

  return {
    data: result.data as z.infer<T>,
    rawText: raw.text,
    tokensIn: raw.tokensIn,
    tokensOut: raw.tokensOut,
    costUsd,
    latencyMs: raw.latencyMs,
    modelId,
    region: BEDROCK_HAIKU_REGION,
  };
}

export { HaikuSchemaError } from "./types";
export type {
  HaikuPromptRequest,
  HaikuCallResult,
  HaikuInvocationOptions,
  HaikuCallAuditEntry,
} from "./types";
