// V9.5 SLC-V9.5-C MT-1 — Bedrock-Sonnet Bounded-Critic Pure-Function
//
// Slice: slices/SLC-V9.5-C-bounded-critic-gate.md (MT-1)
// Feature: FEAT-081  DEC: DEC-216 (1 Synthese + 1 Critic, bounded)
// Region-Pflicht: eu-central-1 (data-residency.md)
//
// Struktur 1:1 analog email-synthesis.ts (Pattern-Reuse, strategaize-pattern-reuse.md):
//   - BedrockRuntimeClient + ConverseCommand
//   - Test-Injection-Hook via __setCriticCallerForTests / __resetCriticCallerForTests
//   - JSON-Extraction mit Markdown-Codeblock-Strip
//   - zod-Validation post-Parse mit SonnetSchemaError-Reuse
//   - Modell-ID-Default eu.anthropic.claude-sonnet-4-20250514-v1:0
//     (ENV BEDROCK_V9_SONNET_MODEL_ID als Override — gleicher Key wie Synthese)
//
// Unterschied zu email-synthesis.ts:
//   - critiqueUnits(draftUnits[]) statt synthesizeSection — EIN Call ueber
//     ALLE Draft-Units des Runs (bounded, AC-C-4), nicht pro Section
//   - CriticVerdictsSchema ({ verdicts: [...] }) statt SynthesisResultSchema
//
// Caller (Worker, MT-2) ist verantwortlich fuer ai_cost_ledger-INSERT mit role
// `email_bulk_critic` (job_id = Synthese-Job-ID) + das Verdict-Index-Mapping
// zurueck auf die Draft-Units.

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import {
  V95_CRITIC_PROMPT_VERSION,
  V95_CRITIC_SYSTEM_PROMPT,
  buildCriticUserPrompt,
  type CriticInputUnit,
} from "./email-critic-prompt";
import { CriticVerdictsSchema, SonnetSchemaError } from "./types";
import type {
  CriticVerdicts,
  SonnetCallResult,
  SonnetInvocationOptions,
} from "./types";
import type { SonnetRawCaller } from "./email-pattern";

// ─── Pricing (Sonnet 4 = Sonnet 3.5 Bedrock-Pricing, eu-central-1) ───
const COST_PER_INPUT_TOKEN_USD = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 15.0 / 1_000_000;

// ─── Hardcoded Region per data-residency.md (eu-central-1 Frankfurt) ───
export const BEDROCK_CRITIC_REGION = "eu-central-1" as const;

// ─── Default Model-ID (overridable via ENV — gleicher ENV-Key wie Synthese) ───
const DEFAULT_SONNET_MODEL_ID = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

function resolveModelId(override?: string): string {
  if (override) return override;
  return process.env.BEDROCK_V9_SONNET_MODEL_ID || DEFAULT_SONNET_MODEL_ID;
}

// ─── Bedrock-Client (Singleton, hardcoded eu-central-1) ───
let cachedClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_CRITIC_REGION });
  }
  return cachedClient;
}

let injectedCaller: SonnetRawCaller | null = null;

/** Test-only: inject a mock raw caller. Production code never calls this. */
export function __setCriticCallerForTests(caller: SonnetRawCaller): void {
  injectedCaller = caller;
}

/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetCriticCallerForTests(): void {
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
 * Haupt-Eintrittspunkt: bounded Critic-Pass ueber ALLE Draft-Units eines Runs
 * (genau 1 Call, DEC-216) via Bedrock Sonnet 4.
 *
 * Vertrag:
 *   - Region IMMER eu-central-1 (BEDROCK_CRITIC_REGION).
 *   - Modell-ID via Options-Override oder ENV BEDROCK_V9_SONNET_MODEL_ID.
 *   - Bei leerem Output: throw Error (Network/Bedrock).
 *   - Bei nicht-JSON / Schema-Drift: throw SonnetSchemaError — der Worker
 *     behandelt das Run-blocking (status='failed', kein Persist
 *     un-kritisierter Units, R-C-2/AC-C-4).
 *   - Bei AWS-Error: throw original Error (Worker faengt + status='failed').
 *
 * Der Worker mappt `verdicts[].unit_ref` (0-basierter Index der Eingabe-Liste)
 * zurueck auf die Draft-Units und filtert `KEEP && evidence_count >= 2`.
 */
export async function critiqueUnits(
  units: CriticInputUnit[],
  options?: SonnetInvocationOptions,
): Promise<SonnetCallResult<CriticVerdicts>> {
  const modelId = resolveModelId(options?.modelId);
  const temperature = options?.temperature ?? 0.2;
  const maxTokens = options?.maxTokens ?? 4096;

  const userPrompt = buildCriticUserPrompt(units);

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({
    system: V95_CRITIC_SYSTEM_PROMPT,
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
      `Sonnet critic output is not valid JSON: ${msg}`,
      raw.text,
      null,
    );
  }

  const result = CriticVerdictsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SonnetSchemaError(
      "Sonnet output does not match CriticVerdictsSchema",
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
    region: BEDROCK_CRITIC_REGION,
  };
}

// Re-exports fuer Caller (Worker).
export { V95_CRITIC_PROMPT_VERSION, V95_CRITIC_SYSTEM_PROMPT };
export { CriticVerdictsSchema, CriticVerdictSchema, SonnetSchemaError } from "./types";
export type { CriticVerdicts, CriticVerdict } from "./types";
export type { CriticInputUnit } from "./email-critic-prompt";
