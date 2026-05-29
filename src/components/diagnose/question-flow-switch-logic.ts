// V8 SLC-149 MT-4 — Pure-Logic-Switch fuer V8-Antwort-Schema-Branching.
//
// V8-Templates (`exit-readiness-teaser-v1`, MIG-047) tragen `answer_schema_kind`
// am Block-Level (siehe V8TemplateBlock in lib/diagnose/types.ts). Die V8-Run-
// Component (V8QuestionFlow.tsx) entscheidet pro Block welche der drei neuen
// Antwort-Components rendert. V6.3-Bestand (`partner_diagnostic_v1`) hat dieses
// Feld nicht — die Default-Branche `'unknown'` faengt das ab. V6.3 wird
// strukturell nicht ueber diesen Switch geroutet, weil V6.3 die bestehende
// QuestionFlow.tsx weiternutzt. Dieser Helper existiert primaer fuer V8 + als
// Defensive-Schicht.
//
// Pure Functions, kein React-Bezug. Vitest in node-env ohne jsdom.

import type { AnswerSchemaKind } from "@/lib/diagnose/types";

export type AnswerComponentKind =
  | "hygiene"
  | "reife_skala"
  | "reflexion"
  | "choice_5"
  | "unknown";

export interface AnswerSchemaInput {
  answer_schema_kind?: AnswerSchemaKind | string | null;
}

/**
 * Mappt `answer_schema_kind` auf die zu rendernde Component-Kind.
 *
 * - `'hygiene_yes_partial_no'` → `'hygiene'` (HygieneAnswerPills)
 * - `'reife_skala_5'` → `'reife_skala'` (ReifeSkalaAnswer)
 * - `'reflexion_freitext'` → `'reflexion'` (ReflexionTextarea)
 * - `'choice_5'` → `'choice_5'` (V6.3-Bestand AnswerOptionCard)
 * - Sonst (inkl. undefined, null, leerer String, unbekannter Wert) → `'unknown'`
 *
 * Default ist BEWUSST `'unknown'` statt `'choice_5'` — V6.3 wird ueber den
 * Run-Page-Switch auf `usage_kind` geroutet, nicht ueber diesen Helper. Wer
 * hier hinkommt ohne valides `answer_schema_kind` ist ein Konfigurations-
 * Fehler und sollte defensive einen sichtbaren Error rendern.
 */
export function getAnswerComponentKind(
  input: AnswerSchemaInput,
): AnswerComponentKind {
  const kind = input.answer_schema_kind;
  switch (kind) {
    case "hygiene_yes_partial_no":
      return "hygiene";
    case "reife_skala_5":
      return "reife_skala";
    case "reflexion_freitext":
      return "reflexion";
    case "choice_5":
      return "choice_5";
    default:
      return "unknown";
  }
}
