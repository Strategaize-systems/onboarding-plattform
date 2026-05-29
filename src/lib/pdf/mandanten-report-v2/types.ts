// V8 SLC-150 MT-2 — Renderer-Input-Type fuer Mandanten-Report V2.
//
// Aggregiert V8ReportSnapshot (aus SLC-148 MT-6 sui-engine.ts) + Mandanten-
// Metadaten + optionalen StB-Slot fuer Cover-Footer. Wird vom Caller in
// SLC-152 (Email-Versand-Branch) populated und an
// `renderMandantenReportV2Pdf(input)` uebergeben.
//
// Modul-Namen sind separat als `moduleNames`-Record, weil V8ReportSnapshot
// nur Scores enthaelt. Caller zieht die Namen aus `template.blocks[].name`
// analog zum selectThreeHebel-Pattern in SLC-148 MT-4.

import type { ModulKey, V8ReportSnapshot } from "@/lib/diagnose/types";

export interface MandantInfo {
  /** Pflicht. Firmenname des Mandanten. */
  name: string;
  /** Pflicht. ISO-Datum (YYYY-MM-DD) des Diagnose-Zeitpunkts. */
  datum: string;
  /** Optional. Branche fuer Mandant-Card auf Cover. */
  branche?: string;
  /** Optional. Umsatz-Label fuer Mandant-Card auf Cover (z.B. "35 Mio EUR"). */
  umsatz?: string;
}

export interface StbInfo {
  /** Pflicht. Firmenname des StB. */
  firma: string;
  /** Optional. Standort fuer Cover-Footer (z.B. "Düsseldorf"). */
  standort?: string;
  /** Optional. Kontakt-E-Mail fuer Footer-Slot. */
  kontakt_email?: string;
}

export interface RenderOptions {
  /** Default true. Cover-Page mit dezentem Wheel-Watermark. */
  includeWatermark?: boolean;
}

export interface RendererInput {
  /** V8ReportSnapshot aus SLC-148 sui-engine. Single-Source-of-Truth fuer Scores/Klassifizierung. */
  snapshot: V8ReportSnapshot;
  /** Mandanten-Metadaten fuer Cover + Hero. */
  mandant: MandantInfo;
  /** Optional StB-Branding fuer Cover-Footer. Fallback: Strategaize-Default. */
  stb?: StbInfo;
  /** Modul-Namen-Lookup. Caller populated aus template.blocks[].name. */
  moduleNames: Record<ModulKey, string>;
  /** Optional Render-Options. */
  options?: RenderOptions;
}

/**
 * Defensive Validation des RendererInput. Wirft Error mit konkreter
 * Fehler-Message wenn ein erforderliches Feld fehlt. Wird vom Renderer
 * vor dem Buffer-Render aufgerufen, damit der Caller (SLC-152) klare
 * Fehlermeldungen bekommt statt eines kryptischen @react-pdf-Crash.
 */
export function validateRendererInput(input: RendererInput): true {
  if (!input.snapshot) {
    throw new Error("RendererInput: snapshot is required");
  }
  if (!input.snapshot.classification) {
    throw new Error("RendererInput: snapshot.classification is required");
  }
  if (!input.snapshot.moduleScores) {
    throw new Error("RendererInput: snapshot.moduleScores is required");
  }
  if (!input.mandant?.name || input.mandant.name.trim().length === 0) {
    throw new Error("RendererInput: mandant.name is required");
  }
  if (!input.mandant?.datum || input.mandant.datum.trim().length === 0) {
    throw new Error("RendererInput: mandant.datum is required");
  }
  if (!input.moduleNames) {
    throw new Error("RendererInput: moduleNames is required");
  }
  const requiredModuls: ModulKey[] = [
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
  for (const key of requiredModuls) {
    if (!input.moduleNames[key] || input.moduleNames[key].trim().length === 0) {
      throw new Error(`RendererInput: moduleNames.${key} is required`);
    }
  }
  return true;
}
