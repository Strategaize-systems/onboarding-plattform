// StB-Vertikale Modul-Reife-Ampel — deterministische Pure-Function (SLC-178 MT-1, OP V10.1).
//
// Berechnet aus den Frage-Flags eines Moduls (owner_dependency/deal_blocker/
// sop_trigger/ko_hart/ko_soft, flach je Frage — MIG-129) plus den Live-Trigger-
// Hits (SLC-179) ein Reife-/Ampel-Signal green|yellow|red. Kein LLM, kein DB —
// hermetisch testbar.
//
// Regel (DEC-253/C): ein GETRIGGERTER ko_hart -> red; ein getriggerter
// ko_soft/deal_blocker/owner_dependency -> yellow; sonst green. `sop_trigger`
// beeinflusst die Ampel NICHT (SOP-Bruecke, SLC-181). Die Funktion liest nur den
// finalen triggerHits-Stand — das „Heilen" eines Trigger-Hits (F-E) passiert
// upstream durch Entfernen der frage_id aus triggerHits (SLC-179/180).
//
// Ampel-Vokabular wiederverwendet aus dem Blueprint (Konsistenz cross-Feature).

import type { Ampel } from "@/lib/stb-vertikale/blueprint";

/** Die fuenf flachen Scoring-Flags einer Modul-Frage (MIG-129), tolerant/partiell. */
export interface ReifeAmpelFlags {
  owner_dependency?: boolean;
  deal_blocker?: boolean;
  sop_trigger?: boolean;
  ko_hart?: boolean;
  ko_soft?: boolean;
}

/**
 * metadata-Schluessel unter `capture_session.metadata`:
 * - AMPEL: `{ [modulKey]: Ampel }` — hier geschrieben (SLC-178 MT-2).
 * - TRIGGER_HITS: `{ [modulKey]: string[] }` (frage_ids) — von SLC-179 geschrieben,
 *   hier gelesen. Default (kein SLC-179) = leer -> Ampel green (sichere Baseline).
 */
export const MODUL_DELIVERY_AMPEL_META_KEY = "modul_delivery_ampel" as const;
export const MODUL_DELIVERY_TRIGGER_HITS_META_KEY =
  "modul_delivery_trigger_hits" as const;

/**
 * Reife-/Ampel-Signal eines Moduls aus Flag-Zustaenden + Trigger-Hits (DEC-253/C).
 *
 * @param flags       frage_id -> Flag-Zustand der geflaggten Modul-Fragen
 * @param triggerHits frage_ids, die die Live-Bewertung (SLC-179) als riskant/
 *                    unvollstaendig markiert hat
 */
export function computeModulReifeAmpel(
  flags: Record<string, ReifeAmpelFlags>,
  triggerHits: readonly string[],
): Ampel {
  let hasYellow = false;
  for (const frageId of triggerHits) {
    const f = flags[frageId];
    if (!f) continue; // getriggert, aber keine geflaggte Frage -> kein Risikobeitrag
    if (f.ko_hart) return "red"; // red dominiert -> Short-Circuit reihenfolge-sicher
    if (f.ko_soft || f.deal_blocker || f.owner_dependency) hasYellow = true;
  }
  return hasYellow ? "yellow" : "green";
}
