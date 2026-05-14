// V6 SLC-106 — Strukturtext fuer Lead-Intake `notes`-Feld (FEAT-046, MT-4)
//
// Pure-Function: aus DiagnoseReportSummary (drei Felder) wird ein 2-4 saetziger
// deutscher Strukturtext gebaut. Bewusst KEIN Roh-Bericht, KEINE Knowledge-Units,
// KEINE Antworten — DSGVO-Datensparsamkeit (siehe Slice-Spec In-Scope-B + AC-11).
//
// Truncation auf MAX_NOTES_CHARS (R-106-7 Mitigation): Business-System koennte
// `notes` z.B. auf 4096 chars limitieren. Realistische Ausgabe ist ~250 chars,
// 1500 ist defensive Obergrenze.

import type { DiagnoseReportSummary } from "./types";

export const MAX_NOTES_CHARS = 1500;

export function buildNotesFromDiagnose(report: DiagnoseReportSummary): string {
  const sentences: string[] = [];

  sentences.push(
    `Mandant von ${report.partner_org_name} hat das Strategaize-Diagnose-Werkzeug durchlaufen.`,
  );

  if (report.average_score !== null) {
    sentences.push(
      `Durchschnittlicher Score: ${report.average_score.toFixed(1)}/10.`,
    );
  }

  if (report.weakest_block_title) {
    sentences.push(`Groesste Strukturluecke: ${report.weakest_block_title}.`);
  }

  sentences.push("Mandant wuenscht Kontakt durch Strategaize.");

  const notes = sentences.join(" ");
  if (notes.length <= MAX_NOTES_CHARS) return notes;
  return notes.slice(0, MAX_NOTES_CHARS - 3) + "...";
}
