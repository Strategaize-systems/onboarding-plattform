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

// V9.5 SLC-V9.5-B MT-2 — Cross-Thread-Synthese (FEAT-080)
export {
  synthesizeSection,
  BEDROCK_SYNTHESIS_REGION,
  V95_SYNTHESIS_PROMPT_VERSION,
  V95_SYNTHESIS_SYSTEM_PROMPT,
  __setSynthesisCallerForTests,
  __resetSynthesisCallerForTests,
} from "./email-synthesis";

export { buildSynthesisUserPrompt } from "./email-synthesis-prompt";

export {
  PatternSchema,
  PatternExtractionResultSchema,
  SynthesizedUnitSchema,
  SynthesizedEvidenceSnippetSchema,
  SynthesisResultSchema,
  SonnetSchemaError,
} from "./types";

export type {
  Pattern,
  PatternExtractionResult,
  SynthesizedUnit,
  SynthesizedEvidenceSnippet,
  SynthesisResult,
  SynthesisInputPattern,
  SonnetCallAuditEntry,
  SonnetCallResult,
  SonnetInvocationOptions,
  SonnetPromptRequest,
  ThreadMeta,
} from "./types";

export type { SonnetRawCaller } from "./email-pattern";

export { buildPatternUserPrompt } from "./email-pattern-prompt";
