// V9 SLC-166 MT-1 — Bedrock-Haiku-Adapter Types
//
// Slice: SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md
//
// Pattern-Reuse aus src/lib/llm/v8-1-augmentation/types.ts und augment.ts:
//   - BedrockCaller DI-Type fuer Test-Injection
//   - HaikuCallResult mit Token-Counts + Cost + Latency
// Erweiterung vs V8.1:
//   - Strict-JSON-Output-Schema-Validation via zod (Haiku-spezifisch)
//   - HaikuSchemaError als named error fuer post-Call-Validation-Drift
//   - Modell-ID via ENV BEDROCK_V9_HAIKU_MODEL_ID
//   - Region HARDCODED eu-central-1 (DEC-179/180 + data-residency.md)

/**
 * Generischer Prompt-Request an Haiku.
 * `system` und `user` werden via ConverseCommand uebertragen.
 */
export interface HaikuPromptRequest {
  system: string;
  user: string;
}

/**
 * Ergebnis eines erfolgreichen Haiku-Calls inkl. parsed + schema-validated Payload.
 * Generisches Type-Argument T = zod.infer<typeof schema>.
 */
export interface HaikuCallResult<T> {
  /** Parsed + zod-validated Response-Payload */
  data: T;
  /** Raw text aus ConverseCommand (vor zod-parse) — fuer Audit + Debugging */
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
  /** AWS-Region (immer 'eu-central-1' — fuer Audit-Trail explizit gespeichert) */
  region: string;
}

/**
 * Options fuer invokeHaiku-Call.
 */
export interface HaikuInvocationOptions {
  /** Override Modell-ID (Default: ENV BEDROCK_V9_HAIKU_MODEL_ID oder Anthropic Claude 3 Haiku) */
  modelId?: string;
  /** Sampling-Temperature (Default 0.2 fuer deterministische Klassifikation) */
  temperature?: number;
  /** Max-Output-Tokens (Default 2048 — Pre-Filter-Batch braucht Platz fuer 50 Klassifikationen) */
  maxTokens?: number;
}

/**
 * Fehler bei Schema-Drift (Haiku-Output passt nicht zur zod-Schema-Erwartung).
 * Caller (z.B. Pre-Filter-Worker) faengt diesen ab und fuehrt Audit-Fallback durch.
 *
 * `rawText` enthaelt die ersten 500 Zeichen der schlechten Response fuer Debugging.
 * `zodIssues` ist die zod-Error-Issues-Liste fuer detailliertes Logging.
 */
export class HaikuSchemaError extends Error {
  readonly rawText: string;
  readonly zodIssues: unknown;
  constructor(message: string, rawText: string, zodIssues: unknown) {
    super(message);
    this.name = "HaikuSchemaError";
    this.rawText = rawText.slice(0, 500);
    this.zodIssues = zodIssues;
  }
}

/**
 * Audit-Entry-Payload fuer Caller (z.B. Pre-Filter-Worker), der ai_cost_ledger
 * + error_log selber schreibt. Adapter selbst schreibt NICHT direkt — V9-Caller
 * haben unterschiedliche role-Werte (email_bulk_pre_filter vs email_bulk_pii_redact).
 */
export interface HaikuCallAuditEntry {
  modelId: string;
  region: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
}
