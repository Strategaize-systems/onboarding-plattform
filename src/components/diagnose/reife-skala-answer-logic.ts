// V8 SLC-149 MT-2 — Pure-Logic-Helper fuer ReifeSkalaAnswer (FEAT-064).
//
// Pure Functions, kein React-Bezug, keine DOM-API. Testbar in vitest's
// node-environment ohne jsdom. Visual-Verification der Komponente passiert
// in /qa-Live-Smoke (Slice-Konvention, siehe helper-text-modal-logic.ts-Pattern).

export type Stufe = 1 | 2 | 3 | 4 | 5;

export type ScoreMapping = Record<Stufe, number>;

/**
 * Liefert den Score fuer eine gegebene Stufe via direkter Lookup ins
 * scoreMapping. Beispiel: stufeToScore(3, {1:0,2:2,3:5,4:8,5:10}) -> 5.
 */
export function stufeToScore(stufe: Stufe, scoreMapping: ScoreMapping): number {
  return scoreMapping[stufe];
}

/**
 * Reverse-Lookup: ermittelt die Stufe, deren gemappter Score exakt dem
 * Input entspricht. Gibt `null` zurueck, wenn kein exakter Match existiert
 * (Defensive — schuetzt vor Drift, wenn currentValue nicht aus scoreMapping
 * stammt).
 */
export function scoreToStufe(
  score: number,
  scoreMapping: ScoreMapping,
): Stufe | null {
  const stufen: Stufe[] = [1, 2, 3, 4, 5];
  for (const s of stufen) {
    if (scoreMapping[s] === score) {
      return s;
    }
  }
  return null;
}

/**
 * Liefert das deutsche Reifegrad-Label pro Stufe (FEAT-064 Spec-Wortlaut).
 */
export function formatStufeLabel(stufe: Stufe): string {
  switch (stufe) {
    case 1:
      return "Noch gar nicht vorhanden";
    case 2:
      return "Erste Ansaetze";
    case 3:
      return "Teilweise implementiert";
    case 4:
      return "Weitgehend etabliert";
    case 5:
      return "Vollstaendig etabliert + belastbar";
  }
}
