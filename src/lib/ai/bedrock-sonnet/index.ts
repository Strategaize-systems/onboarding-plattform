// V9 SLC-167 MT-2 — Bedrock-Sonnet-Adapter Barrel Export
//
// Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
// Pattern-Reuse aus src/lib/ai/bedrock-haiku/index.ts (V9 SLC-166 MT-1)
//
// V9.0 hat genau einen Sonnet-Caller (Pattern-Extraktion-Worker, SLC-167 MT-5).
// Falls in V9.1+ weitere Sonnet-Konsumenten dazukommen, kann der Adapter analog
// zu Haiku generisch werden (invokeSonnet<T>). Aktuell: Pattern-Extraktion-only.

export {
  extractPatternFromThread,
  BEDROCK_SONNET_REGION,
  V9_PATTERN_PROMPT_VERSION,
  V9_PATTERN_SYSTEM_PROMPT,
  __setSonnetCallerForTests,
  __resetSonnetCallerForTests,
} from "./email-pattern";

export {
  PatternSchema,
  PatternExtractionResultSchema,
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

export type { SonnetRawCaller } from "./email-pattern";

export { buildPatternUserPrompt } from "./email-pattern-prompt";
