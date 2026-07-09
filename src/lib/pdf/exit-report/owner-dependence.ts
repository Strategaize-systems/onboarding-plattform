// V10.5 SLC-191 MT-2 — Owner-Dependence-Index (DEC-273), PURE + deterministisch, 0 LLM.
//
// Kette (MT-0-Grounding, RPT-625): pro Block die owner_dependency-Fragen → beantwortet?
// (ownerDepQuestions.answered) → verlinkte Diagnose-Subtopics (diagnosisSubtopics via
// q.frageId ∈ subtopic.question_keys) → deren ampel/risiko (aus fahrplan.blocks[].subtopics[].fields).
// Ohne diagnosis_schema degradiert es automatisch auf Block-Granularitaet (nur Blind-Spot).

import type { ExitReportInput } from "./types";

export type Ampel = "green" | "yellow" | "red";
export type OwnerDepLevel = "hoch" | "mittel" | "gering" | "nicht_ermittelbar";

/** Eine Scorecard-Dimension = ein Diagnose-Block mit ≥1 owner_dependency-Frage. */
export interface OwnerDepDimension {
  blockKey: string;
  blockTitle: string;
  ampel: Ampel;
  ownerDepCount: number;
  answeredCount: number;
  /** Mindestens eine owner-dep-Frage der Dimension ist unbeantwortet (Blind Spot). */
  blindSpot: boolean;
  /** Hoechstes risiko der verlinkten Subtopics (null wenn keine Verlinkung/kein risiko). */
  maxRisiko: number | null;
  /** Schlechteste ampel der verlinkten Subtopics (null wenn keine). */
  worstAmpel: Ampel | null;
}

export interface OwnerDependenceIndex {
  level: OwnerDepLevel;
  /** 0–10, hoeher = staerkere Owner-Abhaengigkeit (schlechter fuer den Kaeufer). null = nicht ermittelbar. */
  headline: number | null;
  dimensions: OwnerDepDimension[];
}

function normAmpel(v: unknown): Ampel | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s === "green" || s === "yellow" || s === "red" ? s : null;
}

function normRisiko(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const AMPEL_RANK: Record<Ampel, number> = { green: 0, yellow: 1, red: 2 };

function worse(a: Ampel | null, b: Ampel | null): Ampel | null {
  if (a === null) return b;
  if (b === null) return a;
  return AMPEL_RANK[a] >= AMPEL_RANK[b] ? a : b;
}

/**
 * PURE: berechnet den Owner-Dependence-Index (pro Dimension + Aggregat) aus dem ExitReportInput.
 * Deterministisch; keine Zufalls-/Zeit-Abhaengigkeit.
 */
export function computeOwnerDependenceIndex(input: ExitReportInput): OwnerDependenceIndex {
  // Subtopic-Feld-Lookup aus der Diagnose: `${blockKey}::${subtopicKey}` (lowercased) → fields.
  const fieldsByKey = new Map<string, Record<string, string | number | null>>();
  for (const block of input.fahrplan.blocks) {
    for (const st of block.subtopics) {
      fieldsByKey.set(`${block.block_key.toLowerCase()}::${st.key.toLowerCase()}`, st.fields);
    }
  }

  // owner-dep-Fragen nach Block gruppieren.
  const byBlock = new Map<string, ExitReportInput["ownerDepQuestions"]>();
  for (const q of input.ownerDepQuestions) {
    const arr = byBlock.get(q.blockKey) ?? [];
    arr.push(q);
    byBlock.set(q.blockKey, arr);
  }

  const dimensions: OwnerDepDimension[] = [];
  for (const [blockKey, qs] of byBlock) {
    const ownerDepCount = qs.length;
    const answeredCount = qs.filter((q) => q.answered).length;
    const blindSpot = answeredCount < ownerDepCount;

    // Verlinkte Subtopics: gleiche Dimension + question_keys ∩ frageIds der owner-dep-Fragen.
    const frageIds = new Set(qs.map((q) => q.frageId).filter((f) => f.length > 0));
    let worstAmpel: Ampel | null = null;
    let maxRisiko: number | null = null;
    for (const s of input.diagnosisSubtopics) {
      if (s.blockKey !== blockKey) continue;
      if (!s.questionKeys.some((k) => frageIds.has(k))) continue;
      const fields = fieldsByKey.get(`${blockKey.toLowerCase()}::${s.key.toLowerCase()}`);
      if (!fields) continue;
      worstAmpel = worse(worstAmpel, normAmpel(fields.ampel));
      const r = normRisiko(fields.risiko);
      if (r !== null) maxRisiko = maxRisiko === null ? r : Math.max(maxRisiko, r);
    }

    const isRed = worstAmpel === "red" || (maxRisiko !== null && maxRisiko >= 7);
    const isYellow =
      worstAmpel === "yellow" ||
      (maxRisiko !== null && maxRisiko >= 4 && maxRisiko <= 6) ||
      blindSpot;
    const ampel: Ampel = isRed ? "red" : isYellow ? "yellow" : "green";

    dimensions.push({
      blockKey,
      blockTitle: input.blockTitles[blockKey] ?? blockKey,
      ampel,
      ownerDepCount,
      answeredCount,
      blindSpot,
      maxRisiko,
      worstAmpel,
    });
  }

  dimensions.sort((a, b) => a.blockKey.localeCompare(b.blockKey));

  if (dimensions.length === 0) {
    return { level: "nicht_ermittelbar", headline: null, dimensions };
  }

  const score = dimensions.reduce(
    (sum, d) => sum + (d.ampel === "red" ? 2 : d.ampel === "yellow" ? 1 : 0),
    0,
  );
  const headline = Math.round((score / (2 * dimensions.length)) * 10);
  const level: OwnerDepLevel = headline >= 7 ? "hoch" : headline >= 4 ? "mittel" : "gering";

  return { level, headline, dimensions };
}
