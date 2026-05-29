// V8 SLC-149 MT-1 — Pure-Logic-Helper fuer HygieneAnswerPills (FEAT-065).
//
// Pure Functions, kein React-Bezug, keine DOM-API. Testbar in vitest's
// node-environment ohne jsdom. Visual-Verification der Komponente passiert
// in /qa-Live-Smoke (Slice-Konvention, siehe helper-text-modal-logic.ts +
// WalkthroughCapture-Pattern).

export type HygieneValue = "ja" | "teilweise" | "nein";

/**
 * Liefert den naechsten Pill-Wert nach einem Klick.
 *
 * Toggle-off-Semantik: Klick auf den aktuell gewaehlten Wert deselektiert
 * (return null). Klick auf einen anderen Wert wechselt zu diesem.
 *
 * - `null` / `undefined` (kein Wert gesetzt) + Klick auf X -> X
 * - X bereits gesetzt + Klick auf X -> null (Deselect)
 * - X gesetzt + Klick auf Y -> Y
 */
export function getNextValue(
  currentValue: HygieneValue | null | undefined,
  clickedValue: HygieneValue,
): HygieneValue | null {
  if (currentValue === clickedValue) {
    return null;
  }
  return clickedValue;
}
