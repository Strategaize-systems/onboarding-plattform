// StB-Vertikale Modul-Fragebogen-Capture — SLC-173 (FEAT-093, OP V10).
//
// Pure Helfer fuer den Modul-Capture-Flow (Stufe-1-Kern + Stufe-2-Vertiefung).
// Bewusst KEINE "use server"-Direktive + keine DB-Abhaengigkeit -> hermetisch
// testbar. Session-Start/Enqueue (DB) liegen in der co-located Server-Action
// `src/app/dashboard/stb/modul/[modulKey]/actions.ts`.
//
// Reuse-Disziplin (strategaize-pattern-reuse.md): der Capture-Flow selbst
// (capture_session, block_checkpoint, QuestionnaireWorkspace, BlockList,
// rpc_create_block_checkpoint, Whisper-Voice) wird 1:1 wiederverwendet — hier
// entsteht nur die duenne StB-Modul-Schicht obendrauf.

import type { TemplateBlock } from "@/lib/db/template-queries";

/**
 * Gueltiger Modul-Schluessel: `m` + zwei Ziffern (z.B. `m04`, `m06`).
 * Entspricht `template.metadata.modul_key` der StB-Modul-Seeds (MIG-125).
 */
export const MODUL_KEY_REGEX = /^m\d{2}$/;

export function isValidModulKey(modulKey: string): boolean {
  return MODUL_KEY_REGEX.test(modulKey);
}

/**
 * Modul-Schluessel -> Template-Slug (Seed-Konvention SLC-170/170b).
 * `m04` -> `stb_modul_m04`.
 */
export function modulKeyToSlug(modulKey: string): string {
  return `stb_modul_${modulKey}`;
}

export interface StufeSplit {
  /** Stufe-1-Kern: Pflicht-Bloecke (`required === true`). */
  stufe1: TemplateBlock[];
  /** Stufe-2-Vertiefung: optionale Bloecke (`required !== true`). */
  stufe2: TemplateBlock[];
}

/**
 * Teilt die Template-Bloecke nach Stufe (AC-173-3): Stufe-1-Kern = Pflicht
 * (`required === true`), Stufe-2-Vertiefung = optional. Beide nach `order`
 * sortiert. Steuerung kommt aus den Template-`blocks` (MIG-125), nicht aus Code.
 */
export function splitBlocksByStufe(blocks: TemplateBlock[]): StufeSplit {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  return {
    stufe1: sorted.filter((b) => b.required === true),
    stufe2: sorted.filter((b) => b.required !== true),
  };
}

/** Pfad-Praefix fuer die wiederverwendeten Wizard-Komponenten (basePath). */
export function modulBasePath(modulKey: string): string {
  return `/dashboard/stb/modul/${modulKey}`;
}
