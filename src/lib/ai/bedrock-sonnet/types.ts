// V9 SLC-167 MT-2 — Bedrock-Sonnet-Adapter Types (Pattern-Extraktion)
//
// Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-2)
// DECs: DEC-176 (V5-PII-Reuse), DEC-180 (Async-Worker), DEC-181 (V4.1-Sections + Free-Text),
//       DEC-182 (Cost-Cap-Flow)
//
// Pattern-Reuse aus src/lib/ai/bedrock-haiku/types.ts:
//   - Generischer PromptRequest + CallResult<T> mit zod-validated payload
//   - SchemaError-Klasse fuer post-Call-Drift
//   - Region-Hardcoded eu-central-1 (data-residency.md Pflicht)
// Erweiterung vs Haiku:
//   - PatternExtractionResult zod-Schema (themes/patterns/decisions/open_questions)
//   - Sonnet 3.5 Pricing ($3 input / $15 output per 1M tokens via Bedrock eu-central-1)
//   - Sonnet-spezifische Modell-ID-Resolution via BEDROCK_V9_SONNET_MODEL_ID

import { z } from "zod";

/**
 * Generischer Prompt-Request an Sonnet.
 * `system` und `user` werden via ConverseCommand uebertragen.
 */
export interface SonnetPromptRequest {
  system: string;
  user: string;
}

/**
 * Ergebnis eines erfolgreichen Sonnet-Calls inkl. parsed + schema-validated Payload.
 * Generisches Type-Argument T = z.infer<typeof schema>.
 */
export interface SonnetCallResult<T> {
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
 * Options fuer invokeSonnet-Call.
 */
export interface SonnetInvocationOptions {
  /** Override Modell-ID (Default: ENV BEDROCK_V9_SONNET_MODEL_ID oder Claude 3.5 Sonnet) */
  modelId?: string;
  /** Sampling-Temperature (Default 0.2 fuer deterministische Pattern-Extraktion) */
  temperature?: number;
  /** Max-Output-Tokens (Default 4096 — Pattern-JSON kann mehrere Pattern-Objekte enthalten) */
  maxTokens?: number;
}

/**
 * Fehler bei Schema-Drift (Sonnet-Output passt nicht zur zod-Schema-Erwartung).
 * Caller (z.B. Pattern-Extraktion-Worker) faengt diesen ab und markiert die
 * betroffene Email als `pattern_extraction_failed` (Skip + Continue mit naechstem
 * Thread, kein Run-Abbruch).
 *
 * `rawText` enthaelt die ersten 500 Zeichen der schlechten Response fuer Debugging.
 * `zodIssues` ist die zod-Error-Issues-Liste fuer detailliertes Logging.
 */
export class SonnetSchemaError extends Error {
  readonly rawText: string;
  readonly zodIssues: unknown;
  constructor(message: string, rawText: string, zodIssues: unknown) {
    super(message);
    this.name = "SonnetSchemaError";
    this.rawText = rawText.slice(0, 500);
    this.zodIssues = zodIssues;
  }
}

/**
 * Audit-Entry-Payload fuer Caller (z.B. Pattern-Extraktion-Worker), der
 * ai_cost_ledger + error_log selber schreibt. Adapter selbst schreibt NICHT
 * direkt — V9-Caller haben unterschiedliche role-Werte
 * (email_bulk_pattern_extraction).
 */
export interface SonnetCallAuditEntry {
  modelId: string;
  region: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
}

// ─── Pattern-Extraktion Schema (FEAT-073 + DEC-181) ───────────────────────
//
// Strict-JSON-Output von Sonnet pro Thread. Nach DEC-181: suggested_section
// ist ein String, der spaeter in der Curation-UI gegen V4.1-Template-Sections
// gemappt wird. Auch "Andere..."-Free-Text-Sektion zulaessig.
//
// confidence-Range [0.0, 1.0]. evidence_snippets sind pseudonymisierte
// Auszuege aus redacted_body (KEINE Klarnamen).

export const PatternSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  evidence_snippets: z.array(z.string()).min(1).max(5),
  confidence: z.number().min(0).max(1),
  suggested_section: z.string().min(1).max(120),
});

export const PatternExtractionResultSchema = z.object({
  thread_id: z.string().min(1),
  themes: z.array(z.string()).max(20),
  patterns: z.array(PatternSchema).max(5), // V9.0-Default: max 5 Pattern pro Thread (siehe email-pattern-prompt.ts)
  decisions: z.array(z.string()).max(20).optional().default([]),
  open_questions: z.array(z.string()).max(20).optional().default([]),
});

export type Pattern = z.infer<typeof PatternSchema>;
export type PatternExtractionResult = z.infer<typeof PatternExtractionResultSchema>;

/**
 * Thread-Metadaten als Input fuer extractPatternFromThread.
 * thread_id wird im Output-Schema 1:1 als Identifier verwendet.
 */
export interface ThreadMeta {
  threadId: string;
  /** Thread-Subject zur LLM-Kontext-Anreicherung (KEIN Klarname-Leak — Subject ist pre-redacted via SLC-166 Pipeline). */
  subject?: string;
  /** Email-Anzahl im Thread fuer LLM-Kontext (z.B. "GF antwortete 3x"). */
  emailCount?: number;
  /** Erste Email-Date fuer Zeit-Kontext (z.B. Saison-spezifische Pattern). */
  firstDate?: string;
}
