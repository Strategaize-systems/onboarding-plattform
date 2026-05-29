// V8 SLC-149 MT-3 — Pure-Logic-Helper fuer ReflexionTextarea (FEAT-064).
//
// Pure Functions, kein React-Bezug, keine DOM-API. Testbar in vitest's
// node-environment ohne jsdom. Visual-Verification der Komponente passiert
// in /qa-Live-Smoke (Slice-Konvention, siehe helper-text-modal-logic.ts).

export type CounterState = "ok" | "warning" | "error";

/**
 * Liefert den Zeichen-Counter-Status fuer die Freitext-Textarea.
 *
 * Schwellen:
 *  - `'ok'`     : currentLength < 90% von maxChars
 *  - `'warning'`: 90% <= currentLength <= 100% von maxChars
 *  - `'error'`  : currentLength > maxChars (Block-Submit)
 */
export function getCounterState(
  currentLength: number,
  maxChars: number,
): CounterState {
  const warningThreshold = maxChars * 0.9;
  if (currentLength > maxChars) return "error";
  if (currentLength >= warningThreshold) return "warning";
  return "ok";
}

/**
 * Schneidet den Text auf maxChars zurueck, falls er laenger ist.
 * Andernfalls No-Op (Original-String unveraendert).
 */
export function truncateToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Soll der Submit-Button deaktiviert werden?
 *
 * True wenn `text.length > maxChars` — User darf zwar weiter tippen
 * (damit die Error-State sichtbar wird), aber Submit ist geblockt
 * bis er den Text gekuerzt hat.
 */
export function shouldDisableSubmit(text: string, maxChars: number): boolean {
  return text.length > maxChars;
}
