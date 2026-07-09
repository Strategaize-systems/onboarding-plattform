// V10.5 SLC-191 MT-3 — Kaeufer-Framing (Devil's-Advocate, 3-Spalten, deterministisch).
//
// Reuse: prioritize() aus ../fahrplan-report/framing (identische Priorisierung).
// Erweitert das exitCoupling-Muster (dort EIN kombinierter Satz) zu DREI fokussierten
// Kaeufer-Spalten pro Finding: was ein Kaeufer sieht / wo die Buy-Side-DD ansetzt /
// welcher Schritt vor dem Verkauf abmildert. Alle Texte deterministisch aus den
// Diagnose-Bands (ampel/risiko/hebel/relevanz_90d/empfehlung) → band-stabil, 0 LLM.

import { prioritize } from "../fahrplan-report/framing";
import type { FahrplanTodo } from "../fahrplan-report/types";

/** Ein Finding im Kaeufer-Report mit 3-Spalten-Narrativ. */
export interface BuyerFinding {
  title: string;
  subtopicName: string;
  blockTitle: string;
  priority: "required" | "nice_to_have";
  ampel: string | null;
  /** Was ein Kaeufer bei diesem Punkt sieht. */
  kaeuferSicht: string;
  /** Wo die Buy-Side-Due-Diligence hier ansetzt. */
  ddAnsatz: string;
  /** Konkreter Schritt vor dem Verkauf, der den Punkt abmildert. */
  abmilderung: string;
}

type Band = "high" | "medium" | "low" | "unknown";

function scoreBand(v: number | null): Band {
  if (v === null) return "unknown";
  if (v >= 7) return "high";
  if (v >= 4) return "medium";
  return "low";
}

/** Kaeufer-sichtbarer Schweregrad: schlechteste aus ampel + risiko-Band. */
function severity(ampel: string | null, risiko: number | null): Band {
  const a = (ampel ?? "").trim().toLowerCase();
  const rb = scoreBand(risiko);
  if (a === "red" || rb === "high") return "high";
  if (a === "yellow" || rb === "medium") return "medium";
  if (a === "green" || rb === "low") return "low";
  return "unknown";
}

function kaeuferSicht(sev: Band): string {
  switch (sev) {
    case "high":
      return "Ein Käufer sieht hier sofort ein ungeklärtes Risiko — im Datenraum ein typischer Stolperstein.";
    case "medium":
      return "Ein Käufer sieht einen erklärungsbedürftigen Punkt, der Nachfragen auslöst.";
    case "low":
      return "Für einen Käufer unkritisch — sauber belegbar.";
    case "unknown":
      return "Noch nicht bewertet — ein Käufer würde hier gezielt nachfragen.";
  }
}

function ddAnsatz(risikoBand: Band): string {
  switch (risikoBand) {
    case "high":
      return "Die Buy-Side-Due-Diligence setzt hier an: ohne Belege drohen Preisabschlag oder Deal-Breaker.";
    case "medium":
      return "Die Due-Diligence fordert Nachweise an; fehlende Dokumentation erzeugt Verhandlungsdruck.";
    case "low":
      return "Geringe Due-Diligence-Angriffsfläche.";
    case "unknown":
      return "Due-Diligence-Relevanz vor dem Verkaufsprozess bewerten.";
  }
}

function abmilderung(empfehlung: string | null, hebelBand: Band): string {
  const empf = (empfehlung ?? "").trim();
  if (empf.length > 0) return `Vor dem Verkauf: ${empf}`;
  switch (hebelBand) {
    case "high":
      return "Früh adressieren — hoher Wert-Hebel für Bewertung und Verkaufbarkeit.";
    case "medium":
      return "Mittelfristig aufbereiten und im Datenraum dokumentieren.";
    case "low":
    case "unknown":
      return "Dokumentieren und im Datenraum belegbar machen.";
  }
}

/**
 * PURE: priorisiert die Todos (reuse prioritize) und erzeugt pro Finding das
 * 3-Spalten-Kaeufer-Narrativ. Deterministisch + band-stabil.
 */
export function buildBuyerFindings(todos: FahrplanTodo[]): BuyerFinding[] {
  return prioritize(todos).map((t) => ({
    title: t.title,
    subtopicName: t.subtopicName,
    blockTitle: t.blockTitle,
    priority: t.priority,
    ampel: t.ampel,
    kaeuferSicht: kaeuferSicht(severity(t.ampel, t.risiko)),
    ddAnsatz: ddAnsatz(scoreBand(t.risiko)),
    abmilderung: abmilderung(t.empfehlung, scoreBand(t.hebel)),
  }));
}
