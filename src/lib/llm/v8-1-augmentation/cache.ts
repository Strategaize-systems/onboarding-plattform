// V8.1 LLM-Augmentation — Cache-Helpers
//
// Slice: SLC-161 MT-3
// Spec: slices/SLC-161-llm-augmentation-backend.md
// ARCHITECTURE.md V8.1 Lines 7524-7544: capture_session.metadata.v8_1_llm_augmentation_cache JSONB-Shape
//
// Pure functions — keine direkte DB I/O. augment.ts (MT-4) liest/schreibt
// capture_session.metadata via Supabase Admin Client und nutzt diese Helpers
// fuer Key-Building, Hit-Check, defensives Parsen und JSONB-Merge.

import type { CacheStructure } from "./types";

/**
 * JSONB-Key unter capture_session.metadata, in dem die Cache-Struktur lebt.
 * Konsistent mit ARCHITECTURE.md V8.1 Line 7518 + slice MT-3 spec.
 */
export const V8_1_CACHE_METADATA_KEY = "v8_1_llm_augmentation_cache" as const;

/**
 * Baut den Tuple-Cache-Key gemaess DEC-167.
 * Format `{modelId}|{promptVersion}` — Modell- oder Prompt-Aenderung
 * invalidiert den Cache automatisch (Key-Mismatch).
 */
export function buildCacheKey(modelId: string, promptVersion: string): string {
  return `${modelId}|${promptVersion}`;
}

/**
 * Prueft ob der gespeicherte Cache gegen den aktuellen Run-Key matched.
 * `null`-Cache oder Mismatched-Key → false (Miss → LLM-Call noetig).
 */
export function isCacheHit(
  cached: CacheStructure | null,
  currentKey: string
): boolean {
  if (cached === null) return false;
  return cached.cache_key === currentKey;
}

/**
 * Defensiver Type-Guard: prueft ob ein unbekanntes JSONB-Objekt
 * eine valide CacheStructure ist. Schuetzt vor Schema-Drift, Manueller
 * DB-Manipulation, Malformed-JSONB durch frueheren Bug.
 */
export function parseCacheStructure(raw: unknown): CacheStructure | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.cache_key !== "string") return null;
  if (typeof obj.augmented_at !== "string") return null;
  if (!Array.isArray(obj.hebel)) return null;

  for (const entry of obj.hebel) {
    if (entry === null || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.modul_name !== "string") return null;
    if (typeof e.modul_id !== "number") return null;
    if (typeof e.aktuelle_stufe !== "number") return null;
    if (typeof e.text !== "string") return null;
    if (typeof e.is_llm_augmented !== "boolean") return null;
    if (e.token_count === null || typeof e.token_count !== "object") return null;
    const tc = e.token_count as Record<string, unknown>;
    if (typeof tc.input !== "number" || typeof tc.output !== "number") return null;
    if (typeof e.cost_usd !== "number") return null;
  }

  return raw as CacheStructure;
}

/**
 * Liest den Cache aus einem metadata-JSONB-Object (frisch aus DB gelesen).
 * Defensiv: liefert null bei fehlendem Key, malformed Struktur, oder
 * leerem metadata-Object.
 */
export function readCacheFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): CacheStructure | null {
  if (!metadata) return null;
  const raw = metadata[V8_1_CACHE_METADATA_KEY];
  return parseCacheStructure(raw);
}

/**
 * Merged einen neuen Cache in das bestehende metadata-JSONB.
 * Additiv: bestehende keys (z.B. v8_report_snapshot aus V8.0) bleiben erhalten.
 * Pure — schreibt nicht in DB. augment.ts ruft das Ergebnis im
 * fetch-merge-write Pattern an die Supabase update() weiter.
 *
 * Siehe `feedback_fetch_merge_write_supabase_jsonb.md` — Supabase JS SDK
 * unterstuetzt jsonb-||-Konkat-Operator nicht direkt, daher Merge im JS.
 */
export function mergeCacheIntoMetadata(
  currentMetadata: Record<string, unknown> | null | undefined,
  newCache: CacheStructure
): Record<string, unknown> {
  const base = currentMetadata ?? {};
  return {
    ...base,
    [V8_1_CACHE_METADATA_KEY]: newCache,
  };
}
