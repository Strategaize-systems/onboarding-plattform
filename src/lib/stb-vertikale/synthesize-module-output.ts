// StB-Vertikale Modul-Output-Synthese — Bedrock-Sonnet lean Fan-out (SLC-174 MT-1).
//
// Struktur 1:1 nach src/lib/ai/bedrock-sonnet/email-synthesis.ts (DEC-235,
// strategaize-pattern-reuse.md): BedrockRuntimeClient + ConverseCommand,
// Test-Injection-Hook, JSON-Codeblock-Strip, zod-Validation, eu-central-1
// hardcoded (data-residency.md), reale Token-Usage aus response.usage.
//
// Reine Draft-Phase: ein LLM-Call/Modul erzeugt das Liefer-Triple + KI-Hebel.
// Der Bounded-Critic (critic.ts) reust den hier exportierten invokeModuleJson.
// Der Caller (Worker MT-3) ist verantwortlich fuer ai_cost_ledger + Persist.

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { z } from "zod";

import {
  ModuleDraftSchema,
  MODULE_SYNTHESIS_SYSTEM_PROMPT,
  buildModuleSynthesisUserPrompt,
  type ModuleDraft,
} from "./synthesis-prompt";
import type { ModuleContext, QaPair } from "./module-context";

// ─── Pricing (Sonnet 4 = Sonnet Bedrock-Pricing, eu-central-1) ───
const COST_PER_INPUT_TOKEN_USD = 3.0 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 15.0 / 1_000_000;

// ─── Hardcoded Region (eu-central-1 Frankfurt, data-residency.md) ───
export const BEDROCK_MODULE_REGION = "eu-central-1" as const;

const DEFAULT_SONNET_MODEL_ID = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

function resolveModelId(override?: string): string {
  if (override) return override;
  return (
    process.env.BEDROCK_V9_SONNET_MODEL_ID ||
    process.env.LLM_MODEL ||
    DEFAULT_SONNET_MODEL_ID
  );
}

/** Schema-/Parse-Drift im LLM-Output. Worker faengt -> Job 'failed', kein Persist. */
export class ModuleSynthesisError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
    public readonly issues: unknown,
  ) {
    super(message);
    this.name = "ModuleSynthesisError";
  }
}

// ─── Raw-Caller (DI-Hook fuer Tests) ─────────────────────────────────────────

export interface RawModuleCallRequest {
  system: string;
  user: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
}

export interface RawModuleCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export type RawModuleCaller = (
  req: RawModuleCallRequest,
) => Promise<RawModuleCallResult>;

let cachedClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_MODULE_REGION });
  }
  return cachedClient;
}

let injectedCaller: RawModuleCaller | null = null;

/** Test-only: inject a mock raw caller. Production never calls this. */
export function __setModuleCallerForTests(caller: RawModuleCaller): void {
  injectedCaller = caller;
}

/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetModuleCallerForTests(): void {
  injectedCaller = null;
}

const productionCaller: RawModuleCaller = async ({
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
    throw new Error("Bedrock-Sonnet (module): empty response (no output text)");
  }
  const tokensIn =
    response.usage?.inputTokens ?? Math.ceil((system.length + user.length) / 4);
  const tokensOut = response.usage?.outputTokens ?? Math.ceil(text.length / 4);
  return { text, tokensIn, tokensOut, latencyMs };
};

/** Defensives JSON-Extract (Markdown-Codeblock-Strip). */
function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch && codeBlockMatch[1]) return codeBlockMatch[1].trim();
  return trimmed;
}

export interface ModuleCallResult<T> {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
  region: string;
}

export interface ModuleInvocationOptions {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Generischer Bedrock-JSON-Call: System+User -> Sonnet -> JSON-Parse ->
 * zod-Validation. Wird vom Draft (synthesizeModuleOutput) UND vom Bounded-Critic
 * (critic.ts) genutzt. Wirft ModuleSynthesisError bei nicht-JSON / Schema-Drift,
 * Original-Error bei Bedrock/Network.
 */
export async function invokeModuleJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  options?: ModuleInvocationOptions,
): Promise<ModuleCallResult<T>> {
  const modelId = resolveModelId(options?.modelId);
  const temperature = options?.temperature ?? 0.2;
  const maxTokens = options?.maxTokens ?? 4096;

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({ system, user, modelId, temperature, maxTokens });

  if (!raw.text || raw.text.trim().length === 0) {
    throw new Error("Bedrock-Sonnet (module): empty response (no output text)");
  }

  const candidate = extractJsonCandidate(raw.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new ModuleSynthesisError(
      `Module synthesis output is not valid JSON: ${msg}`,
      raw.text,
      null,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ModuleSynthesisError(
      "Module synthesis output does not match the expected schema",
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
    region: BEDROCK_MODULE_REGION,
  };
}

/**
 * Lean Fan-out (Draft): erzeugt aus Modul-Kontext + Antworten das Liefer-Triple
 * + KI-Hebel via einem Sonnet-Call. Region IMMER eu-central-1.
 */
export async function synthesizeModuleOutput(
  ctx: ModuleContext,
  qaPairs: QaPair[],
  options?: ModuleInvocationOptions,
): Promise<ModuleCallResult<ModuleDraft>> {
  const userPrompt = buildModuleSynthesisUserPrompt(ctx, qaPairs);
  return invokeModuleJson(
    ModuleDraftSchema,
    MODULE_SYNTHESIS_SYSTEM_PROMPT,
    userPrompt,
    options,
  );
}
