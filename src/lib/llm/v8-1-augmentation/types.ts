// V8.1 LLM-Augmentation — TypeScript-Types
//
// Slice: SLC-161 MT-2
// Spec: slices/SLC-161-llm-augmentation-backend.md
// ARCHITECTURE.md V8.1 Lines 7527-7544: capture_session.metadata.v8_1_llm_augmentation_cache JSONB-Shape

/**
 * Input fuer einen Hebel-Eintrag, der LLM-augmentiert werden soll.
 * Wird aus dem deterministisch ermittelten V8.0-Hebel-Block gefuettert.
 */
export interface AugmentInput {
  /** Modul-Name aus Curriculum (z.B. "Modul 4 — Operative Skalierbarkeit") */
  modulName: string;
  /** Modul-ID 1-9 */
  modulId: number;
  /** Aktuelle SUI-Stufe 1-5 fuer diesen Hebel */
  aktuelleStufe: number;
  /** Deterministischer V8.0-Stufen-Text als Fallback-Quelle bei LLM-Fail */
  deterministischerStufenText: string;
  /** Zusaetzlicher Mandant-Kontext fuer User-Prompt (z.B. Branche, Firmen-Groesse) */
  mandantKontext?: string;
}

/**
 * Output pro Hebel — entweder LLM-augmentierter Text ODER deterministischer Fallback.
 * `isLlmAugmented` = false signalisiert dem Renderer, dass kein Cache-Write erfolgt.
 */
export interface AugmentOutput {
  modulName: string;
  modulId: number;
  aktuelleStufe: number;
  /** Finaler Text, der gerendert wird (LLM oder deterministisch) */
  text: string;
  /** Audit-Flag: true wenn Text aus Bedrock kam UND Tonality-Validation passed */
  isLlmAugmented: boolean;
  /** Token-Counts (nur bei isLlmAugmented=true gefuellt) */
  tokenCount?: { input: number; output: number };
  /** USD-Cost pro Call (nur bei isLlmAugmented=true gefuellt) */
  costUsd?: number;
  /** Fallback-Grund (nur bei isLlmAugmented=false gefuellt) */
  fallbackReason?:
    | "tonality_drift"
    | "word_count_exceeded"
    | "bedrock_error"
    | "cost_cap_hit"
    | "timeout";
}

/**
 * Einzelner Cache-Entry pro Hebel innerhalb `CacheStructure.hebel[]`.
 * Spiegelt das JSONB-Shape aus ARCHITECTURE.md V8.1 Lines 7531-7541.
 */
export interface CacheEntry {
  modul_name: string;
  modul_id: number;
  aktuelle_stufe: number;
  text: string;
  is_llm_augmented: boolean;
  token_count: { input: number; output: number };
  cost_usd: number;
}

/**
 * Vollstaendige JSONB-Cache-Struktur unter capture_session.metadata.v8_1_llm_augmentation_cache.
 * Tuple-Cache-Key (DEC-167): `{modelId}|{promptVersion}` matched gegen aktuelle ENV + Konstante.
 */
export interface CacheStructure {
  /** "{modelId}|{promptVersion}" — Tuple-Cache-Key */
  cache_key: string;
  /** ISO-Timestamp der letzten erfolgreichen Augmentation */
  augmented_at: string;
  /** Array von 3 Hebeln (Reihenfolge entspricht selectThreeHebel-Output) */
  hebel: CacheEntry[];
}

/**
 * Audit-Entry-Payload fuer recordLlmCall (MT-5).
 * Wird zur ai_cost_ledger-Tabelle gemappt (role='v8_1_augmentation').
 */
export interface LlmCallAuditEntry {
  tenantId: string;
  modelId: string;
  modulName: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
}

/**
 * Audit-Entry-Payload fuer recordCacheHit (MT-5).
 * Wird zur error_log-Tabelle gemappt (source='v8_1_llm_cache_hit').
 */
export interface CacheHitAuditEntry {
  captureSessionId: string;
  modelId: string;
  promptVersion: string;
}

/**
 * Audit-Entry-Payload fuer recordTonalityDrift (MT-5).
 * Wird zur error_log-Tabelle gemappt (source='v8_1_llm_tonality_drift').
 */
export interface TonalityDriftAuditEntry {
  captureSessionId: string;
  modulName: string;
  /** Erste 200 Zeichen des verworfenen LLM-Outputs zum Debugging */
  driftSnippet: string;
}
