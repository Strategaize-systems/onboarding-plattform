// V9.1 SLC-V9.1-D MT-3 — Conversational-First Setup-Assistant (Bedrock-Sonnet).
//
// summarizeSetupIntent(input) nimmt eine natuerlichsprachige Beschreibung des GF
// ("Ich will alle Mails von meinem Steuerberater und von kanzlei-mueller.de
// weiterleiten") und extrahiert einen Setup-Vorschlag (Local-Part + Allowlist-
// Patterns + Begruendung) zum Vorbefuellen der Setup-Form.
//
// Conversational-First ist BLOCKING per feedback-strategaize-conversational-first-ux.
//
// Pattern-Reuse (data-residency.md + strategaize-pattern-reuse.md):
//   Invocations-Struktur 1:1 aus src/lib/ai/bedrock-sonnet/email-pattern.ts
//   (V9 SLC-167): BedrockRuntimeClient + ConverseCommand, Region hardcoded
//   eu-central-1, JSON-Extract mit Markdown-Strip, zod-Validation, Test-Injection-Hook.
//   Eigene Prompt + eigenes Schema (Setup-Intent statt Pattern-Extraktion).

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

// ─── Region-Pflicht eu-central-1 (data-residency.md) ───
export const BEDROCK_SONNET_REGION = "eu-central-1" as const;
// V9.5 SLC-V9.5-A DEC-218: eu-Sonnet-4 inference-profile (= Sonnet-3.5 Bedrock-Pricing).
const DEFAULT_SONNET_MODEL_ID = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

function resolveModelId(): string {
  return process.env.BEDROCK_V9_SONNET_MODEL_ID || DEFAULT_SONNET_MODEL_ID;
}

export const SetupSuggestionSchema = z.object({
  suggestedLocalPart: z
    .string()
    .regex(/^bulk-[a-z0-9-]{3,40}$/)
    .describe("Local-Part im Format bulk-<name>"),
  suggestedAllowlistPatterns: z.array(z.string()).max(20),
  reasoning: z.string().min(1).max(600),
});
export type SetupSuggestion = z.infer<typeof SetupSuggestionSchema>;

const SYSTEM_PROMPT = [
  "Du bist Setup-Assistent fuer das Strategaize Forward-Bucket-Email-Feature.",
  "Der Nutzer (Geschaeftsfuehrer) beschreibt in eigenen Worten, welche Emails er",
  "automatisch an Strategaize weiterleiten moechte. Leite daraus einen Setup-Vorschlag ab.",
  "",
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown, kein Fliesstext) der Form:",
  '{ "suggestedLocalPart": string, "suggestedAllowlistPatterns": string[], "reasoning": string }',
  "",
  "Regeln:",
  "- suggestedLocalPart: Format bulk-<kurzname>, nur a-z 0-9 und Bindestrich, 3-40 Zeichen Kurzname.",
  "  Leite den Kurznamen aus dem Kontext ab (z.B. 'bulk-steuerberater', 'bulk-vertrieb').",
  "- suggestedAllowlistPatterns: erwaehnte Absender-Domains (z.B. 'kanzlei-mueller.de') oder",
  "  exakte Email-Adressen. Leere Liste wenn keine genannt.",
  "- reasoning: 1-2 Saetze auf Deutsch, warum dieser Vorschlag passt.",
].join("\n");

// ─── Test-Injection-Hook (kein echter AWS-Call im Test) ───
export type SetupRawCaller = (args: {
  system: string;
  user: string;
  modelId: string;
}) => Promise<{ text: string }>;

let injectedCaller: SetupRawCaller | null = null;
/** Test-only: inject a mock raw caller. */
export function __setSetupCallerForTests(caller: SetupRawCaller): void {
  injectedCaller = caller;
}
/** Test-only: reset to the real Bedrock-backed caller. */
export function __resetSetupCallerForTests(): void {
  injectedCaller = null;
}

let cachedClient: BedrockRuntimeClient | null = null;
function getBedrockClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: BEDROCK_SONNET_REGION });
  }
  return cachedClient;
}

const productionCaller: SetupRawCaller = async ({ system, user, modelId }) => {
  const client = getBedrockClient();
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { temperature: 0.2, maxTokens: 1024 },
    }),
  );
  const text = response.output?.message?.content?.[0]?.text ?? "";
  if (!text) throw new Error("Bedrock-Sonnet: empty response (no output text)");
  return { text };
};

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch && codeBlockMatch[1]) return codeBlockMatch[1].trim();
  return trimmed;
}

export class SetupSuggestionError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = "SetupSuggestionError";
  }
}

/**
 * Extrahiert einen Setup-Vorschlag aus der Nutzer-Beschreibung via Bedrock Sonnet.
 *
 * @throws Error bei leerem/AWS-Fehler-Output.
 * @throws SetupSuggestionError bei nicht-JSON oder Schema-Drift.
 */
export async function summarizeSetupIntent(input: string): Promise<SetupSuggestion> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("summarizeSetupIntent: leere Eingabe");
  }

  const caller = injectedCaller ?? productionCaller;
  const raw = await caller({
    system: SYSTEM_PROMPT,
    user: trimmed,
    modelId: resolveModelId(),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonCandidate(raw.text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SetupSuggestionError(`Antwort ist kein gueltiges JSON: ${msg}`, raw.text);
  }

  const result = SetupSuggestionSchema.safeParse(parsed);
  if (!result.success) {
    throw new SetupSuggestionError(
      "Antwort entspricht nicht dem Setup-Vorschlag-Schema",
      raw.text,
    );
  }
  return result.data;
}
