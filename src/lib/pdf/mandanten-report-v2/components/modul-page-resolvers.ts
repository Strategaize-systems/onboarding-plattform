// V8 SLC-151 MT-1 — Pure-Logic-Helpers fuer Modul-Page-Render.
//
// Reusable Sub-Component <ModulPage> braucht zwei Pure-Functions:
// - resolveStufenInfo: holt {was_es_bedeutet, unsere_empfehlung} aus dem
//   template.metadata.stufen_lookup JSONB (DEC-164). Defensive-Fail-Fast
//   bei fehlenden Eintraegen, damit Caller (renderer) statt kryptischem
//   @react-pdf-Crash eine klare Error-Message bekommt.
// - modulIdxFromKey: konvertiert ModulKey ("m1".."m9") zu 0-basiertem Index
//   fuer Wheel-focusIdx-Prop.

import type {
  ModulKey,
  StufenInfo,
  V8StufenLookup,
  StufeKey,
} from "@/lib/diagnose/types";

const MODUL_KEYS: ModulKey[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
];

const VALID_STUFEN: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

/**
 * Konvertiert ModulKey zu 0-basiertem Index fuer Wheel-focusIdx-Prop.
 * m1 -> 0, m2 -> 1, ..., m9 -> 8.
 */
export function modulIdxFromKey(modulKey: ModulKey): number {
  const idx = MODUL_KEYS.indexOf(modulKey);
  if (idx < 0) {
    throw new Error(`modulIdxFromKey: invalid modulKey "${modulKey}"`);
  }
  return idx;
}

/**
 * Resolved {was_es_bedeutet, unsere_empfehlung} aus dem Stufen-Lookup.
 *
 * Wirft Error bei:
 * - unbekanntem modulKey (Lookup-Tabelle fehlt)
 * - Stufe ausserhalb 1..5
 * - fehlendem oder unvollstaendigem Eintrag fuer modulKey.stufe
 */
export function resolveStufenInfo(
  modulKey: ModulKey,
  stufe: number,
  stufenLookup: V8StufenLookup,
): StufenInfo {
  if (!VALID_STUFEN.has(stufe)) {
    throw new Error(
      `resolveStufenInfo: invalid stufe ${stufe} for ${modulKey} (must be 1..5)`,
    );
  }
  const modulLookup = stufenLookup[modulKey];
  if (!modulLookup) {
    throw new Error(`resolveStufenInfo: stufen_lookup missing for ${modulKey}`);
  }
  const stufeKey = `s${stufe}` as StufeKey;
  const info = modulLookup[stufeKey];
  if (!info || !info.was_es_bedeutet || !info.unsere_empfehlung) {
    throw new Error(
      `resolveStufenInfo: stufen_lookup missing or incomplete for ${modulKey}.${stufeKey}`,
    );
  }
  return info;
}
