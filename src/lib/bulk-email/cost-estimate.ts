// V9 SLC-167 MT-3 — Pre-Cost-Estimate fuer Pattern-Extraktion-Run (FEAT-073)
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-3 Expected behavior)
// DECs: DEC-182 (Cost-Cap-Enforcement-Flow), DEC-181 (USD→EUR-Approx Fixed-Rate)
//
// Pattern-Reuse-Anker: V8.1 SLC-161 src/lib/llm/v8-1-augmentation/augment.ts
//   (Pricing-Konstanten-Pattern + Default-Caller-Pattern). V9 uebernimmt nur
//   die Pricing-Konstanten — Tonality/Word-Count/Cache-Pattern sind V8.1-
//   spezifisch und in V9 nicht relevant (Pattern-Extraktion hat Strict-JSON-
//   Schema-Validation statt Tonality-Blacklist, kein Cache per Slice-Spec).
//
// Pure-Function: keine DB-Calls, keine Bedrock-Calls. Deterministisch fuer
// gleichen Input → gleicher Output. Wird vom Pre-Cost-Estimate-Page (MT-4)
// aufgerufen + von der Server-Action `startPatternExtraction` (MT-4) als
// Server-Side-Re-Check.

/**
 * Sonnet 3.5 Pricing via Bedrock eu-central-1 (Stand 2025/2026).
 * Spiegelt die Konstanten in src/lib/ai/bedrock-sonnet/email-pattern.ts.
 * Bei Bedrock-Pricing-Update beide Stellen aktualisieren.
 */
export const SONNET_INPUT_PRICE_USD_PER_TOKEN = 3.0 / 1_000_000;
export const SONNET_OUTPUT_PRICE_USD_PER_TOKEN = 15.0 / 1_000_000;

/**
 * Fixed-Rate USD→EUR-Approximation per DEC-181 (V9.0-Pragmatismus).
 * Mirror der gleichen Konstante in src/workers/bulk-email/handle-pre-filter-job.ts
 * (USD_TO_EUR_APPROX). V9.1+ kann FX-Service injecten ueber Option-Argument.
 */
export const USD_TO_EUR_APPROX = 0.92;

/**
 * Fixed Token-Overhead pro Thread fuer System-Prompt + User-Meta (Subject,
 * Email-Count, First-Date, Preamble). Basiert auf Sonnet-System-Prompt-Laenge
 * ~3300 chars / 4 ≈ 825 tokens + User-Meta-Header ~100 tokens. Conservative
 * gerundet auf 1100. Pre-Estimate ist ABSICHTLICH leicht ueber-konservativ —
 * lieber falsch zu teuer als unter-cap-rutschen + Worker-Live-Cap triggern.
 */
export const SONNET_PROMPT_OVERHEAD_TOKENS_PER_THREAD = 1100;

/**
 * Default-Tokens-Out-Schaetzung pro Thread. Pattern-Extraktion liefert pro Thread
 * 1-5 Pattern + themes/decisions/open_questions im Strict-JSON. Beobachtet via
 * V8.1-Pipeline: ca. 600-1000 tokens output. Default 800 (Mitte der Range,
 * matched Slice-Spec L121).
 */
export const SONNET_DEFAULT_TOKENS_OUT_PER_THREAD = 800;

/**
 * Approx Tokens pro Char fuer englische und deutsche Texte mit Sonnet-Tokenizer.
 * Empirisch ca. 0.25 tokens/char (= 4 chars/token). Strategaize-Texte sind
 * deutsch + pseudonymisiert (P1/P2-Placeholder reduzieren Vocabulary-Spread).
 */
const TOKENS_PER_CHAR = 0.25;

export interface BulkRunThreadForEstimate {
  redactedBody: string;
}

export interface BulkRunCostEstimate {
  /** Anzahl Threads im Estimate-Scope */
  threadCount: number;
  /** Geschaetzte Input-Tokens-Summe (Body + Prompt-Overhead pro Thread) */
  tokensIn: number;
  /** Geschaetzte Output-Tokens-Summe (Default × Thread-Count) */
  tokensOut: number;
  /** Cost in USD (Input + Output × Sonnet-Price) */
  costUsd: number;
  /** Cost in EUR (USD × USD_TO_EUR_APPROX) */
  costEur: number;
}

/**
 * Pure-Function: Token-Count-Heuristik + EUR-Cost-Berechnung pro Bulk-Run.
 *
 * Input: pseudonymisierte Threads (`redacted_body` aus email_thread).
 * Output: Token-Estimate + USD + EUR-Cost.
 *
 * Heuristik (per Slice-Spec L120-123):
 *   tokensIn = Σ (redacted_body.length × TOKENS_PER_CHAR) + threadCount × Overhead
 *   tokensOut = threadCount × DEFAULT_TOKENS_OUT (800)
 *   costUsd = tokensIn × INPUT_PRICE + tokensOut × OUTPUT_PRICE
 *   costEur = costUsd × USD_TO_EUR_APPROX
 *
 * Nicht-deterministische Faktoren (echte Bedrock-Token-Counts, Tokenizer-Drift,
 * Pattern-Variabilitaet) sind im Live-Cap-Check (MT-5 Worker) abgefangen — der
 * Estimate ist nur das Gate-2-Pre-Approval-Signal, nicht die Wahrheit.
 *
 * Empty-Input: gibt {threadCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, costEur: 0}
 * zurueck. Caller (Pre-Cost-Estimate-Page) zeigt UI-Hinweis "keine Threads im Run".
 */
export function estimateBulkRunPatternCost(
  threads: BulkRunThreadForEstimate[],
): BulkRunCostEstimate {
  const threadCount = threads.length;

  let bodyTokensIn = 0;
  for (const t of threads) {
    bodyTokensIn += Math.ceil((t.redactedBody?.length ?? 0) * TOKENS_PER_CHAR);
  }
  const tokensIn =
    bodyTokensIn + threadCount * SONNET_PROMPT_OVERHEAD_TOKENS_PER_THREAD;
  const tokensOut = threadCount * SONNET_DEFAULT_TOKENS_OUT_PER_THREAD;

  const costUsd =
    tokensIn * SONNET_INPUT_PRICE_USD_PER_TOKEN +
    tokensOut * SONNET_OUTPUT_PRICE_USD_PER_TOKEN;
  const costEur = costUsd * USD_TO_EUR_APPROX;

  return {
    threadCount,
    tokensIn,
    tokensOut,
    costUsd,
    costEur,
  };
}
