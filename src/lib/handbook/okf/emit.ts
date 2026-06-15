// SLC-V9.7-A — OKF Concept-Emitter (Strategaize OKF-Profil 1.0).
//
// Reine, deterministische Pure-Functions: jede kuratierte Wissens-Row
// (knowledge_unit / block_diagnosis / sop) -> ein strukturiertes OkfConcept,
// serialisierbar zu einer `.md`-Datei (Frontmatter-YAML + Body).
//
// Isolation (AC-A-6): keine Worker-/DB-Imports. Erlaubt sind nur `yaml`
// (Frontmatter-Serialisierung, bereits Dependency) und der bestehende
// `slugifyHeading`-Lib-Helper. Cross-Links + Bundle leben in SLC-V9.7-B.
//
// Grounding: docs/ARCHITECTURE.md §"V9.7 Architecture Addendum" + DEC-220..225.

import { stringify as stringifyYaml } from "yaml";
import { slugifyHeading } from "../slugify";
import type {
  OkfConcept,
  OkfConfidence,
  OkfCurationStatus,
  OkfFrontmatter,
  OkfType,
  SerializedConcept,
} from "./types";

// --- MT-1: Mapper + Serializer + Pfad-Helper ---

/**
 * Mappt `knowledge_unit.unit_type` auf einen OKF-`type`. finding/risk/action/
 * observation sind 1:1; `ai_draft` -> `observation` (DEC-224); alles andere ist
 * ein harter Fehler (Drift-Schutz, vom Worker weich abgefangen, SLC-V9.7-B).
 */
export function mapUnitTypeToOkf(unitType: string): OkfType {
  switch (unitType) {
    case "finding":
    case "risk":
    case "action":
    case "observation":
      return unitType;
    case "ai_draft":
      return "observation";
    default:
      throw new Error(`mapUnitTypeToOkf: unknown unit_type "${unitType}"`);
  }
}

/**
 * Passthrough der text-Enum-Konfidenz (low/medium/high). KEIN numeric-Mapping
 * — OP fuehrt `confidence` als text-Enum (DEC-224). Unerwartete Werte sind ein
 * harter Fehler.
 */
export function mapConfidence(text: string): OkfConfidence {
  if (text === "low" || text === "medium" || text === "high") {
    return text;
  }
  throw new Error(
    `mapConfidence: unexpected confidence "${text}" (expected low/medium/high, no numeric mapping — DEC-224)`,
  );
}

/** Passthrough des Kuratierungs-Status (proposed/accepted/edited, 1:1). */
export function mapCurationStatus(status: string): OkfCurationStatus {
  if (status === "proposed" || status === "accepted" || status === "edited") {
    return status;
  }
  throw new Error(`mapCurationStatus: unexpected status "${status}"`);
}

/**
 * Erster Satz eines Bodys fuer `description`. Faellt auf `fallback` (i.d.R. den
 * Titel) zurueck, wenn der Body leer ist; ohne Satz-Terminator wird die erste
 * Zeile genommen (R-A-1).
 */
export function firstSentence(body: string, fallback: string): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) {
    return fallback;
  }
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/s);
  const candidate = match ? match[0] : trimmed.split("\n")[0];
  return candidate.trim() || fallback;
}

// Kanonische, deterministische Frontmatter-Key-Reihenfolge (Profil 1.0).
const FRONTMATTER_KEY_ORDER: (keyof OkfFrontmatter)[] = [
  "type",
  "title",
  "description",
  "timestamp",
  "strategaize_source",
  "strategaize_tenant",
  "confidence",
  "curation_status",
  "evidence_count",
  "strategaize_id",
];

/**
 * Serialisiert Frontmatter zu YAML mit deterministischer Key-Reihenfolge.
 * `undefined`-Felder werden weggelassen. Endet (yaml-typisch) mit `\n`.
 */
export function serializeFrontmatter(fm: OkfFrontmatter): string {
  const ordered: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    const value = fm[key];
    if (value !== undefined) {
      ordered[key] = value;
    }
  }
  return stringifyYaml(ordered);
}

/** Deterministischer Dateiname `<type>-<slug(title)>-<id8>.md`. */
export function conceptFilename(
  type: OkfType,
  title: string,
  id: string,
): string {
  return `${type}-${slugifyHeading(title)}-${id.slice(0, 8)}.md`;
}

/** Serialisiert ein Concept zu `{path, content}` (Frontmatter-Fence + Body). */
export function serializeConcept(concept: OkfConcept): SerializedConcept {
  const frontmatter = serializeFrontmatter(concept.frontmatter);
  const body = concept.body.trim();
  return {
    path: concept.path,
    content: `---\n${frontmatter}---\n\n${body}\n`,
  };
}
