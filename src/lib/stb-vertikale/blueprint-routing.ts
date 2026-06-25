// StB-Vertikale Kanzlei-Blueprint — deterministisches Modul-Routing (SLC-172 MT-3).
//
// Pure Helfer (KEINE "use server"-Direktive, keine DB-Abhaengigkeit) -> hermetisch
// testbar. Eingang: die `block_diagnosis`-Inhalte (Ampel je Unterthema, A–G) +
// die `template.metadata.routing[]`-Map (MIG-126). Ausgang: die aktivierten
// Modul-Empfehlungen. KEIN LLM-Routing (AC-172-3) — rein deterministisch:
// `Subtopic-Ampel ∈ activate_when.ampel` -> primaeres (+ sekundaeres) Modul.
//
// Die Ampel kommt aus dem Diagnose-Output des `diagnosis_generation`-Workers
// (DEC-244), NICHT aus den adaptiven Live-Ampeln der Capture (die steuern nur die
// Vertiefungs-Einblendung, blueprint.ts). Die Bewertung, ob ein Modul relevant
// ist, faellt also auf der finalen Diagnose, nicht auf der UX-Heuristik.

import type { Ampel } from "./blueprint";
import type { DiagnosisContent } from "@/workers/diagnosis/types";

const VALID_AMPEL = new Set<Ampel>(["green", "yellow", "red"]);

/** Ein Routing-Ziel aus `template.metadata.routing[]` (MIG-126). */
export interface BlueprintRoutingTarget {
  block: string;
  subtopic: string;
  activate_when: { ampel: Ampel[] };
  primary_modul_key: string;
  secondary_modul_key: string | null;
}

/** Live-Ampel eines Unterthemas + sein Anzeigename (aus dem Diagnose-Output). */
export interface SubtopicAmpelEntry {
  ampel: Ampel | null;
  name: string;
}

/** Eine aktivierte Modul-Empfehlung (= ein Routing-Ziel, dessen Ampel matcht). */
export interface RoutedModuleRecommendation {
  block: string;
  subtopic: string;
  subtopicName: string;
  ampel: Ampel;
  primaryModulKey: string;
  secondaryModulKey: string | null;
}

/**
 * Coerced eine Diagnose-Feld-Ampel (`string | number | null`) robust auf eine
 * `Ampel` oder `null`. Whitespace/Case-tolerant; alles Unbekannte -> null
 * (zaehlt dann als "nicht bewertet" und loest kein Routing aus).
 */
export function coerceAmpel(
  value: string | number | null | undefined
): Ampel | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return VALID_AMPEL.has(v as Ampel) ? (v as Ampel) : null;
}

/**
 * Flacht die `block_diagnosis`-Inhalte (A–G) zu einer Map
 * `subtopic.key -> { ampel, name }` ab. Bei doppelten Subtopic-Keys gewinnt der
 * letzte (in der Praxis sind die Keys ueber A–G disjunkt).
 */
export function deriveSubtopicAmpel(
  diagnoses: DiagnosisContent[]
): Record<string, SubtopicAmpelEntry> {
  const out: Record<string, SubtopicAmpelEntry> = {};
  for (const d of diagnoses) {
    for (const st of d.subtopics ?? []) {
      out[st.key] = {
        ampel: coerceAmpel(st.fields?.ampel),
        name: st.name,
      };
    }
  }
  return out;
}

/**
 * Deterministisches Routing (AC-172-3): pro Routing-Ziel wird die Empfehlung
 * aktiviert, wenn die Ampel des gekoppelten Unterthemas in `activate_when.ampel`
 * liegt (Seed: gelb/rot). Gruen oder "nicht bewertet" -> kein Modul. Reihenfolge
 * = Reihenfolge der `routing[]`-Map (stabil/deterministisch).
 */
export function computeModuleRouting(
  routing: BlueprintRoutingTarget[],
  subtopicAmpel: Record<string, SubtopicAmpelEntry>
): RoutedModuleRecommendation[] {
  const recs: RoutedModuleRecommendation[] = [];
  for (const t of routing) {
    const entry = subtopicAmpel[t.subtopic];
    const ampel = entry?.ampel ?? null;
    if (!ampel) continue;
    if (!t.activate_when.ampel.includes(ampel)) continue;
    recs.push({
      block: t.block,
      subtopic: t.subtopic,
      subtopicName: entry.name || t.subtopic,
      ampel,
      primaryModulKey: t.primary_modul_key,
      secondaryModulKey: t.secondary_modul_key,
    });
  }
  return recs;
}

/**
 * Defensiver Parser fuer `template.metadata.routing[]` (JSONB, unbekannte Form).
 * Verwirft fehlerhafte Eintraege still (Schema-Drift-tolerant), statt zu werfen.
 */
export function parseRoutingMeta(metadata: unknown): BlueprintRoutingTarget[] {
  if (!metadata || typeof metadata !== "object") return [];
  const routing = (metadata as Record<string, unknown>).routing;
  if (!Array.isArray(routing)) return [];

  const out: BlueprintRoutingTarget[] = [];
  for (const raw of routing) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const block = typeof r.block === "string" ? r.block : null;
    const subtopic = typeof r.subtopic === "string" ? r.subtopic : null;
    const primary =
      typeof r.primary_modul_key === "string" ? r.primary_modul_key : null;
    if (!block || !subtopic || !primary) continue;

    const aw = r.activate_when;
    const ampelList =
      aw && typeof aw === "object" && Array.isArray((aw as Record<string, unknown>).ampel)
        ? ((aw as Record<string, unknown>).ampel as unknown[])
            .map((a) => coerceAmpel(typeof a === "string" ? a : null))
            .filter((a): a is Ampel => a !== null)
        : [];
    if (ampelList.length === 0) continue;

    out.push({
      block,
      subtopic,
      activate_when: { ampel: ampelList },
      primary_modul_key: primary,
      secondary_modul_key:
        typeof r.secondary_modul_key === "string" && r.secondary_modul_key
          ? r.secondary_modul_key
          : null,
    });
  }
  return out;
}
