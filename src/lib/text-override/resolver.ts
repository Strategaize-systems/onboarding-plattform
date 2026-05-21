// V7.1 SLC-136 MT-2 — Inline-Text-Override Resolver (FEAT-055, DEC-140, DEC-145)
//
// Liest alle relevanten Overrides in einem Query (global + template + own-partner),
// mergt nach Scope-Hierarchie partner > template > global zu einer Map<key, value>
// mit O(1)-Lookup. Optional: In-Memory-Cache mit 60s-TTL fuer Layout-Renders
// die mehrfach pro Request dieselbe Map brauchen (DEC-145).
//
// Architecture-Anker: docs/ARCHITECTURE.md V7.1 "V7.1 Resolver-Flow im Detail".
// Cache-Bust nach Save/Reset: src/lib/text-override/actions.ts (SLC-136 MT-3).

import type { SupabaseClient } from "@supabase/supabase-js";

export type TextOverrideScope = "global" | "template" | "partner";

export interface TextOverrideRow {
  scope: TextOverrideScope;
  scope_id: string | null;
  text_key: string;
  text_value: string;
}

/**
 * Mergt Override-Rows in eine Map mit Scope-Hierarchie partner > template > global.
 *
 * Reihenfolge der Set-Calls ist absichtlich global -> template -> partner: spaetere
 * `map.set` ueberschreiben fruehere fuer denselben text_key, sodass partner-Rows
 * am Ende gewinnen.
 *
 * Pure function — leichte Testbarkeit ohne Supabase-Client.
 */
export function mergeRowsToMap(rows: TextOverrideRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const scope of ["global", "template", "partner"] as const) {
    for (const row of rows) {
      if (row.scope === scope) {
        map.set(row.text_key, row.text_value);
      }
    }
  }
  return map;
}

/**
 * Schlaegt einen Text-Key in einer geladenen Override-Map nach und faellt auf
 * defaultText zurueck wenn der Key nicht ueberschrieben ist.
 *
 * Pure function — keine Side-Effects, kein Cache-Touch.
 *
 * Akzeptiert ReadonlyMap, damit Caller die Map als Immutable durchreichen
 * koennen (V7.1 SLC-137 MT-6 Email-Send-Path).
 */
export function resolveText(
  map: ReadonlyMap<string, string>,
  key: string,
  defaultText: string,
): string {
  return map.get(key) ?? defaultText;
}

/**
 * Laedt alle fuer den aktuellen Context relevanten Overrides in einem Query.
 *
 * Scope-Filter:
 *   - global   immer
 *   - template immer (V7.1 V1: nur partner_diagnostic-Template, Filter koennte
 *              spaeter ueber scope_id eingegrenzt werden)
 *   - partner  nur wenn partnerOrgId gesetzt (sonst weggelassen)
 *
 * RLS-Pflicht: der uebergebene supabase-Client MUSS authenticated sein (cookies-
 * basiert), sonst sieht der Aufruf nur Rows die ueber anon-Policy lesbar waeren
 * (= keine — anon hat KEINEN GRANT in Migration 101).
 */
export async function loadOverrides(
  supabase: SupabaseClient,
  partnerOrgId: string | null,
  locale: string = "de",
): Promise<Map<string, string>> {
  // Filter via or() — Supabase nimmt comma-separated PostgREST-Filter.
  // partner-Filter wird konditional angehaengt und mit and(...) gewrapped damit
  // scope_id pro partner-Match eindeutig gebunden ist.
  const filters = ["scope.eq.global", "scope.eq.template"];
  if (partnerOrgId) {
    filters.push(`and(scope.eq.partner,scope_id.eq.${partnerOrgId})`);
  }

  const { data, error } = await supabase
    .from("text_override")
    .select("scope, scope_id, text_key, text_value")
    .or(filters.join(","))
    .eq("locale", locale);

  if (error) {
    throw new Error(`loadOverrides failed: ${error.message}`);
  }

  return mergeRowsToMap((data ?? []) as TextOverrideRow[]);
}

// ============================================================
// In-Memory-Cache (DEC-145, 60s TTL)
// ============================================================
//
// Ziel: ein Server-Component-Render der dieselbe Map mehrfach braucht (Layout +
// Page + Section) loest nur einen DB-Query pro 60s aus. Pro Server-Prozess.
// Module-scoped — keine Cross-Request-Isolation noetig, weil Overrides immer
// per RLS gefiltert sind und der Cache-Key (partnerOrgId, locale) den
// Sichtbarkeitsraum eindeutig identifiziert.
//
// Cache-Bust nach Save/Reset via invalidateOverrideCache().

interface CacheEntry {
  map: Map<string, string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

const cache: Map<string, CacheEntry> = new Map();

function cacheKey(partnerOrgId: string | null, locale: string): string {
  return `${partnerOrgId ?? "null"}::${locale}`;
}

export async function loadOverridesWithCache(
  supabase: SupabaseClient,
  partnerOrgId: string | null,
  locale: string = "de",
): Promise<Map<string, string>> {
  const key = cacheKey(partnerOrgId, locale);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.map;
  }

  const map = await loadOverrides(supabase, partnerOrgId, locale);
  cache.set(key, { map, expiresAt: now + CACHE_TTL_MS });
  return map;
}

/**
 * Loescht den Cache-Eintrag fuer (partnerOrgId, locale). Wird von Save/Reset-
 * Server-Actions in SLC-136 MT-3 aufgerufen.
 */
export function invalidateOverrideCache(
  partnerOrgId: string | null,
  locale: string = "de",
): void {
  cache.delete(cacheKey(partnerOrgId, locale));
}

/**
 * Vollstaendiger Cache-Reset. Fuer Tests oder Admin-Pfade die nach Bulk-
 * Imports alle Caches sofort kalt machen muessen.
 */
export function resetOverrideCache(): void {
  cache.clear();
}
