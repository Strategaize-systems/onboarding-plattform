// StB-Vertikale Modul-Output-Synthese — Bounded-Critic + Reifegrad-Inferenz (SLC-174 MT-2).
//
// Bounded-Critic: GENAU 1 Sonnet-Call hebt die Draft-Qualitaet (DEC-235, Muster
// bulk-email/critiqueUnits). Reust den Bedrock-Caller aus synthesize-module-output.ts.
//
// Reifegrad-Inferenz (R-174-2 / AC-174-6, DEC-245): DETERMINISTISCH aus dem
// KI-Hebel-Katalog der template.metadata (MIG-125) — der Katalog ist die
// autoritative Reifegrad-Quelle, NICHT eine freie LLM-Schaetzung. Reihenfolge:
//   1. hebel_id matcht Katalog -> Katalog-Reifegrad (autoritativ).
//   2. name matcht Katalog (case-insensitive) -> Katalog-Reifegrad.
//   3. Nicht-Katalog-Hebel mit Modell-Vorschlag -> Clamp auf [1,4].
//   4. Sonst -> FALLBACK_REIFEGRAD (Plausibilitaets-Default).

import {
  ModuleDraftSchema,
  MODULE_CRITIC_SYSTEM_PROMPT,
  buildModuleCriticUserPrompt,
  type ModuleDraft,
  type ModuleHebelItem,
} from "./synthesis-prompt";
import {
  invokeModuleJson,
  type ModuleCallResult,
  type ModuleInvocationOptions,
} from "./synthesize-module-output";
import type { ModuleContext, QaPair } from "./module-context";
import type { KiHebelCatalogEntry } from "./module-context";

/** Plausibilitaets-Default fuer Nicht-Katalog-Hebel ohne valide Modell-Angabe. */
export const FALLBACK_REIFEGRAD = 2;

export type ReifegradSource = "catalog" | "model_clamped" | "fallback";

export interface ReifegradResolution {
  reifegrad: number;
  source: ReifegradSource;
}

function clampReifegrad(value: number): number {
  const n = Math.round(value);
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n;
}

/**
 * Deterministische Reifegrad-Zuordnung (DEC-245). Katalog schlaegt Modell.
 */
export function inferReifegrad(
  hebel: ModuleHebelItem,
  catalog: KiHebelCatalogEntry[],
): ReifegradResolution {
  // 1. hebel_id-Match (autoritativ).
  if (hebel.hebel_id) {
    const byId = catalog.find((c) => c.hebel_id === hebel.hebel_id);
    if (byId) return { reifegrad: byId.reifegrad, source: "catalog" };
  }
  // 2. name-Match (case-insensitive, getrimmt).
  const name = hebel.name.trim().toLowerCase();
  const byName = catalog.find((c) => c.name.trim().toLowerCase() === name);
  if (byName) return { reifegrad: byName.reifegrad, source: "catalog" };

  // 3. Modell-Vorschlag (nur fuer echte Nicht-Katalog-Hebel) -> Clamp.
  if (typeof hebel.reifegrad === "number" && Number.isFinite(hebel.reifegrad)) {
    return { reifegrad: clampReifegrad(hebel.reifegrad), source: "model_clamped" };
  }

  // 4. Fallback.
  return { reifegrad: FALLBACK_REIFEGRAD, source: "fallback" };
}

/**
 * Bounded-Critic (genau 1 Call): prueft + verbessert den Draft gegen DoD/
 * Output-Vertrag. Gibt den verbesserten Draft im gleichen Schema zurueck.
 * Wirft ModuleSynthesisError bei Schema-Drift (Worker -> Job 'failed').
 */
export async function critiqueModuleOutput(
  ctx: ModuleContext,
  qaPairs: QaPair[],
  draft: ModuleDraft,
  options?: ModuleInvocationOptions,
): Promise<ModuleCallResult<ModuleDraft>> {
  const userPrompt = buildModuleCriticUserPrompt(ctx, qaPairs, draft);
  return invokeModuleJson(
    ModuleDraftSchema,
    MODULE_CRITIC_SYSTEM_PROMPT,
    userPrompt,
    options,
  );
}
