// V10.5 SLC-192 MT-2 — Coverage-/Ehrlichkeits-Sektion (PURE, deterministisch, 0 LLM).
//
// Leitet aus dem bereits geladenen Fahrplan-Material (quality_report → todos, DEC-272)
// ab, was der Report mangels Input NICHT bewerten konnte: fehlende Subtopics
// (coverage.missing_subtopics) + required Gap-Fragen. nice_to_have-Gaps sind Anreicherung,
// keine Ehrlichkeits-Luecke → ausgeschlossen. Reuse-Muster: parseQualityReport-Ableitung
// aus fahrplan-report/data.ts (nicht exportiert → hier ueber die normalisierten todos genutzt).
//
// R-V10.5-4: fehlende/leere Datengrundlage darf nicht als „nichts zu bemängeln" erscheinen.
// Deshalb ein 3-Zustands-Diskriminator statt einer bloß leeren Liste:
//   - "assessed"     = es gibt konkrete nicht-bewertbare Punkte (items gefüllt).
//   - "full"         = Diagnose lag vor, keine required-Lücken (positive, ehrliche Aussage).
//   - "undetermined" = gar keine Diagnose-/Coverage-Daten → Coverage nicht ermittelbar.

import type { ExitReportInput } from "./types";

/** Grund, warum ein Punkt nicht bewertbar war. */
export type CoverageReason = "missing_subtopic" | "required_gap";

/** Ein nicht-bewertbarer Punkt der Ehrlichkeits-Sektion. */
export interface CoverageItem {
  /** Anzeige-Label (Subtopic-Name bzw. Gap-Frage-Text). */
  label: string;
  /** Block-Titel des Bezugs (sonst ""). */
  blockTitle: string;
  reason: CoverageReason;
}

export type CoverageStatus = "assessed" | "full" | "undetermined";

/** Ergebnis der Coverage-/Ehrlichkeits-Ableitung. */
export interface CoverageSection {
  status: CoverageStatus;
  /** Menschlicher Einleitungssatz passend zum Status. */
  headline: string;
  /** Nicht-bewertbare Punkte, dedupliziert, fehlende Subtopics zuerst. */
  items: CoverageItem[];
}

const HEADLINE: Record<CoverageStatus, string> = {
  assessed:
    "Diese Bereiche konnten wir mangels ausreichender Angaben nicht belastbar bewerten — " +
    "ein Käufer würde hier gezielt nachfragen.",
  full:
    "Alle bewertungsrelevanten Bereiche waren mit ausreichenden Angaben hinterlegt — " +
    "keine offenen Ehrlichkeits-Lücken in der Datengrundlage.",
  undetermined:
    "Coverage nicht ermittelbar: Es lagen keine ausgewerteten Diagnose-Daten vor, " +
    "auf deren Basis sich Bewertungslücken benennen ließen.",
};

// Reason-Reihenfolge: fehlendes Subtopic (gar nicht erfasst) ist der schwerere Blind
// Spot und steht vor der required Gap-Frage (erfasst, aber unvollständig).
const REASON_ORDER: Record<CoverageReason, number> = {
  missing_subtopic: 0,
  required_gap: 1,
};

/**
 * PURE: leitet aus ExitReportInput die Coverage-/Ehrlichkeits-Sektion ab.
 * Deterministisch — gleiche Eingabe → gleicher Output.
 */
export function buildCoverageSection(input: ExitReportInput): CoverageSection {
  const { blocks, todos, missingSubtopics } = input.fahrplan;

  // Defensiver Nicht-ermittelbar-Fall (R-V10.5-4): keinerlei Diagnose-Substanz geladen.
  if (blocks.length === 0 && todos.length === 0 && missingSubtopics.length === 0) {
    return { status: "undetermined", headline: HEADLINE.undetermined, items: [] };
  }

  const items: CoverageItem[] = [];
  const seen = new Set<string>();
  for (const t of todos) {
    let reason: CoverageReason | null = null;
    if (t.source === "missing_subtopic") reason = "missing_subtopic";
    else if (t.source === "gap" && t.priority === "required") reason = "required_gap";
    if (!reason) continue; // nice_to_have-Gaps sind keine Ehrlichkeits-Lücke.

    const label =
      reason === "missing_subtopic" ? t.subtopicName || t.subtopic || t.title : t.title;
    const blockTitle = t.blockTitle ?? "";
    const dedup = `${reason}|${label}|${blockTitle}`.toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    items.push({ label, blockTitle, reason });
  }

  // Stabile Sortierung: fehlende Subtopics zuerst, Reihenfolge sonst erhalten.
  items.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]);

  if (items.length === 0) {
    // Diagnose lag vor, aber keine required-Lücken → ehrliche positive Aussage.
    return { status: "full", headline: HEADLINE.full, items: [] };
  }
  return { status: "assessed", headline: HEADLINE.assessed, items };
}
