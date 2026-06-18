// V9.75 SLC-V9.75-B MT-2 — Verkaufs-Framing-Helfer (deterministisch).
//
// Keine LLM-Calls (DEC-222, AC-B-5): alle Narrative werden deterministisch aus den
// vorhandenen Diagnose-Feldern (ampel/risiko/hebel/relevanz_90d/empfehlung) abgeleitet.
// Reine Funktionen, vollstaendig unit-testbar (MT-2).

import type { FahrplanTodo } from "./types";

/** Gedruckter Scope-Satz fuer den Report-Kopf (AC-B-3: „Landkarte, nicht Handbuch"). */
export const SCOPE_SENTENCE =
  "Dieser Fahrplan ist eine priorisierte Standortbestimmung — eine Landkarte Ihrer Exit-Readiness, " +
  "kein fertiges Handbuch. Er zeigt, wo Sie stehen und welche Lücken den Unternehmenswert am stärksten beeinflussen.";

/** Owner-Feld mit Fallback (LLM laesst owner haeufig leer). */
export function ownerOrFallback(owner: string | null | undefined): string {
  const t = (owner ?? "").trim();
  return t.length > 0 ? t : "GF / noch zu benennen";
}

type Band = "high" | "medium" | "low" | "unknown";

/** 0–10-Score → Band (>=7 high, 4–6 medium, <=3 low, null unknown). */
function scoreBand(v: number | null): Band {
  if (v === null) return "unknown";
  if (v >= 7) return "high";
  if (v >= 4) return "medium";
  return "low";
}

/**
 * Deterministische Exit-Wert/Risiko-Kopplung pro Luecke. Koppelt risiko (Due-
 * Diligence-Risiko), hebel (Wert-Hebel), relevanz_90d und empfehlung zu einem
 * verkaufs-gerahmten Satz. Gleiche Eingabe → gleicher Text (Band-stabil).
 */
export function exitCoupling(input: {
  risiko: number | null;
  hebel: number | null;
  relevanz90d: string | null;
  empfehlung: string | null;
}): string {
  const parts: string[] = [];

  switch (scoreBand(input.risiko)) {
    case "high":
      parts.push(`Hohes Due-Diligence-Risiko (${input.risiko}/10) — eine ungeklärte Lücke hier ist im Datenraum ein häufiger Deal-Breaker oder Preisabschlag.`);
      break;
    case "medium":
      parts.push(`Mittleres Due-Diligence-Risiko (${input.risiko}/10) — im Datenraum erklärungsbedürftig.`);
      break;
    case "low":
      parts.push(`Geringes Due-Diligence-Risiko (${input.risiko}/10).`);
      break;
    case "unknown":
      parts.push("Exit-Risiko noch nicht bewertet.");
      break;
  }

  switch (scoreBand(input.hebel)) {
    case "high":
      parts.push(`Hoher Wert-Hebel (${input.hebel}/10): früh adressiert, steigert es Bewertung und Verkaufbarkeit spürbar.`);
      break;
    case "medium":
      parts.push(`Mittlerer Wert-Hebel (${input.hebel}/10).`);
      break;
    case "low":
      parts.push(`Geringer Wert-Hebel (${input.hebel}/10).`);
      break;
    case "unknown":
      break; // kein Satz, wenn Hebel unbekannt
  }

  if (input.relevanz90d === "high") parts.push("In den nächsten 90 Tagen prioritär.");
  else if (input.relevanz90d === "medium") parts.push("Mittelfristig anzugehen.");

  const empf = (input.empfehlung ?? "").trim();
  if (empf.length > 0) parts.push(`Empfehlung: ${empf}`);

  return parts.join(" ");
}

const RELEVANZ_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * Priorisierte To-Do-Reihenfolge (AC-B-2): required vor nice_to_have, dann
 * risiko*hebel absteigend, dann relevanz_90d (high>medium>low). Stabil (kopiert,
 * mutiert die Eingabe nicht).
 */
export function prioritize(todos: FahrplanTodo[]): FahrplanTodo[] {
  const score = (t: FahrplanTodo) => (t.risiko ?? 0) * (t.hebel ?? 0);
  const rel = (t: FahrplanTodo) => RELEVANZ_RANK[t.relevanz90d ?? ""] ?? 0;
  return [...todos].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "required" ? -1 : 1;
    const s = score(b) - score(a);
    if (s !== 0) return s;
    return rel(b) - rel(a);
  });
}

/** Scope-Schaetzung aus den Zaehlungen (deterministische Heuristik, AC-B-3). */
export function scopeEstimate(counts: {
  requiredGaps: number;
  niceToHaveGaps: number;
  missingSubtopics: number;
}): string {
  const critical = counts.requiredGaps + counts.missingSubtopics;
  if (critical === 0) {
    return "Keine kritischen Lücken offen — die Standortbestimmung ist weitgehend vollständig.";
  }
  if (critical <= 3) {
    return `Überschaubarer Aufbereitungs-Scope (${critical} kritische Punkte, grob 1–2 Tage gezielte Arbeit).`;
  }
  if (critical <= 8) {
    return `Mittlerer Aufbereitungs-Scope (${critical} kritische Punkte, grob 1–2 Wochen).`;
  }
  return `Größerer Aufbereitungs-Scope (${critical} kritische Punkte, mehrere Wochen — schrittweise nach Priorität).`;
}
