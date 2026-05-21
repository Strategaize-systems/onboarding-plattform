// V7.1 SLC-138 MT-4 — Pure-Logic-Helper fuer HelperTextModal (FEAT-057).
//
// Pure Functions, kein React-Bezug, keine DOM-API. Testbar in vitest's
// node-environment ohne jsdom. Visual-Verification der Komponente passiert
// in /qa-Live-Smoke (Slice-Konvention, siehe WalkthroughCapture-Pattern).

export interface HelperContent {
  helperText?: string | null;
  examplesMd?: string | null;
}

/**
 * Soll das Info-Icon neben einer Frage gerendert werden?
 *
 * Nur wenn mindestens eines der beiden Felder mit nicht-leerer Substanz
 * gefuellt ist. Whitespace-only oder NULL → false (kein leeres Modal).
 */
export function shouldShowInfoIcon(content: HelperContent): boolean {
  const hasHelper =
    typeof content.helperText === "string" &&
    content.helperText.trim().length > 0;
  const hasExamples =
    typeof content.examplesMd === "string" &&
    content.examplesMd.trim().length > 0;
  return hasHelper || hasExamples;
}

/**
 * Baut die kanonischen text_override-Keys fuer helper_text + examples_md
 * pro (Template, Frage).
 *
 * Konvention `template.<slug>.question.<questionKey>.<field>`. Konsistent mit
 * der Frage-Label-Konvention in QuestionFlow.tsx (SLC-137).
 */
export function buildHelperKeyPaths(
  templateSlug: string,
  questionKey: string,
): { helperTextKey: string; examplesMdKey: string } {
  const base = `template.${templateSlug}.question.${questionKey}`;
  return {
    helperTextKey: `${base}.helper_text`,
    examplesMdKey: `${base}.examples_md`,
  };
}

/**
 * Gibt das normalisierte HelperText- und ExamplesMd-Paar zurueck.
 *
 * Whitespace-only Strings werden zu null normalisiert, damit Render-Pfade
 * sauber Conditional rendern koennen.
 */
export function normalizeHelperContent(content: HelperContent): {
  helperText: string | null;
  examplesMd: string | null;
} {
  const ht =
    typeof content.helperText === "string" && content.helperText.trim().length > 0
      ? content.helperText.trim()
      : null;
  const ex =
    typeof content.examplesMd === "string" && content.examplesMd.trim().length > 0
      ? content.examplesMd.trim()
      : null;
  return { helperText: ht, examplesMd: ex };
}
