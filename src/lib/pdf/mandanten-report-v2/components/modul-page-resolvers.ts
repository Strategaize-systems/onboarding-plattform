// V8 SLC-151 MT-1+MT-2 — Pure-Logic-Helpers fuer Modul-Page-Render.
//
// MT-1: resolveStufenInfo + modulIdxFromKey (Reusable-Component-Helpers).
// MT-2: getAllModulPagesProps (Renderer-Foundation-Helper, baut 9
//       ModulPageProps aus V8ReportSnapshot + V8Template).
//
// Defensive-Fail-Fast bei fehlenden Eintraegen, damit der Renderer eine
// klare Error-Message bekommt statt eines kryptischen @react-pdf-Crash.

import type {
  ModulKey,
  StufenInfo,
  V8StufenLookup,
  V8Template,
  V8ReportSnapshot,
  StufeKey,
} from "@/lib/diagnose/types";

import type { ModulPageProps } from "./modul-page";

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

/**
 * Baut die 9 ModulPageProps-Eintraege fuer Pages 4-12 aus Snapshot + Template.
 *
 * Iteriert m1..m9, zieht pro Modul:
 * - modulName aus `template.blocks` (Block mit modul_id = uppercase modulKey)
 * - modulScore aus `snapshot.moduleScores[modulKey]`
 * - modulStufe aus `snapshot.stufenMapping[modulKey]`
 * - stufenInfo aus `template.metadata.stufen_lookup` via resolveStufenInfo
 * - worumEsGeht aus `template.metadata.worum_es_geht[modulKey]`
 *
 * Defensive: wirft Error bei
 * - fehlendem template.blocks-Eintrag (Template-Drift)
 * - fehlendem worum_es_geht-Eintrag fuer einen ModulKey
 * - Stufe-Mapping-Inkonsistenz (transitiv ueber resolveStufenInfo)
 *
 * @param snapshot SUI-Snapshot mit moduleScores + stufenMapping
 * @param template V8Template (Migration 102) mit blocks + metadata
 * @param mandantName Optional fuer Page-Footer-Slot
 * @param startingPageNumber Default 4 (Modul-Page-1 ist Page 4)
 */
export function getAllModulPagesProps(
  snapshot: V8ReportSnapshot,
  template: V8Template,
  mandantName?: string,
  startingPageNumber: number = 4,
): ModulPageProps[] {
  if (!template.metadata.worum_es_geht) {
    throw new Error(
      "getAllModulPagesProps: template.metadata.worum_es_geht is required",
    );
  }
  if (!template.metadata.stufen_lookup) {
    throw new Error(
      "getAllModulPagesProps: template.metadata.stufen_lookup is required",
    );
  }

  return MODUL_KEYS.map((modulKey, idx) => {
    const upperKey = modulKey.toUpperCase();
    const block = template.blocks.find((b) => b.modul_id === upperKey);
    if (!block) {
      throw new Error(
        `getAllModulPagesProps: template.blocks missing entry for "${upperKey}"`,
      );
    }
    const modulName = block.name;
    if (!modulName || modulName.trim().length === 0) {
      throw new Error(
        `getAllModulPagesProps: template.blocks[${upperKey}].name is empty`,
      );
    }

    const modulScore = snapshot.moduleScores[modulKey];
    const modulStufe = snapshot.stufenMapping[modulKey];

    const stufenInfo = resolveStufenInfo(
      modulKey,
      modulStufe,
      template.metadata.stufen_lookup,
    );

    const worumEsGeht = template.metadata.worum_es_geht?.[modulKey];
    if (!worumEsGeht || worumEsGeht.trim().length === 0) {
      throw new Error(
        `getAllModulPagesProps: template.metadata.worum_es_geht missing for ${modulKey}`,
      );
    }

    return {
      modulKey,
      modulName,
      modulScore,
      modulStufe,
      wheelScores: snapshot.moduleScores,
      stufenInfo,
      worumEsGeht,
      pageNumber: startingPageNumber + idx,
      mandantName,
    };
  });
}
