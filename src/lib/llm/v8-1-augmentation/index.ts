// V8.1 LLM-Augmentation — Public API
//
// Konsumenten: SLC-162 Outro-Renderer (pages/outro.tsx + V8OutroSection.tsx)
// Slice: SLC-161

export { augmentEmpfehlungsText, buildUserPromptForHebel } from "./augment";
export type {
  AugmentRunInput,
  AugmentRunOptions,
  BedrockCaller,
  BedrockCallResult,
} from "./augment";

export {
  V8_1_PROMPT_VERSION,
  V8_1_MAX_WORD_COUNT,
  V8_1_SYSTEM_PROMPT,
  V8_1_TONALITY_BLACKLIST,
  containsBlacklistedPattern,
  countWords,
} from "./prompt";

export {
  V8_1_CACHE_METADATA_KEY,
  buildCacheKey,
  isCacheHit,
  parseCacheStructure,
  readCacheFromMetadata,
  mergeCacheIntoMetadata,
} from "./cache";

export {
  V8_1_AI_COST_LEDGER_ROLE,
  V8_1_CACHE_HIT_SOURCE,
  V8_1_TONALITY_DRIFT_SOURCE,
  V8_1_LLM_CALL_SOURCE,
  recordLlmCall,
  recordCacheHit,
  recordTonalityDrift,
} from "./audit";

export type {
  AugmentInput,
  AugmentOutput,
  CacheEntry,
  CacheStructure,
  LlmCallAuditEntry,
  CacheHitAuditEntry,
  TonalityDriftAuditEntry,
} from "./types";
