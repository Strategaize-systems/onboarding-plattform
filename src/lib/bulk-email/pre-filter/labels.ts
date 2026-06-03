// V9 SLC-166 MT-2 — Pre-Filter Klassifikations-Labels (6 kanonisch)
//
// Slice: SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md (MT-2)
// DEC-184: V9.0 = 6-Labels hardcoded kanonisch, V9.2+ Tenant-Custom
//
// Diese Konstante ist die SINGLE SOURCE OF TRUTH fuer:
//   1. Haiku-Prompt (renderLabelDescriptionsForPrompt) — Modell-Anweisung
//   2. Strict-JSON-Schema-Validation (PRE_FILTER_LABEL_SCHEMA) — zod-Schema
//   3. Migration 106 email_message.pre_filter_label CHECK-Constraint
//      (manuell sync gehalten — Drift waere ein Bug, der Worker-INSERTs bricht)

import { z } from "zod";

/**
 * Kanonische 6-Label-Liste (DEC-184).
 *
 * Reihenfolge entspricht Pre-Filter-Verarbeitungs-Hierarchie:
 *   - Inhalts-Labels zuerst (content, short_reply) — interessant fuer Pattern-Extraktion
 *   - Operational-Labels danach (notification, newsletter) — Skip in Pattern-Extraktion
 *   - Sensible-Labels (private) — bewusster Skip
 *   - Fallback (unclear) — Confidence-Schwellen-Default
 */
export const PRE_FILTER_LABELS = [
  "content",
  "short_reply",
  "notification",
  "newsletter",
  "private",
  "unclear",
] as const;

/**
 * TypeScript-Type fuer ein einzelnes Label-Token.
 * Wird vom Worker, von der UI und vom Schema gemeinsam verwendet.
 */
export type PreFilterLabel = (typeof PRE_FILTER_LABELS)[number];

/**
 * Menschen-lesbare Beschreibungen pro Label.
 *
 * Werden im Haiku-Prompt als Klassifikations-Hilfe gerendert. Beschreibungen
 * sind bewusst PRAGMATISCH formuliert — kein Marketing-Sprech, kein "AI Wow":
 * der GF muss spaeter im Review nachvollziehen koennen, warum eine Email so
 * gelabelt wurde.
 */
export const PRE_FILTER_LABEL_DESCRIPTIONS: Record<PreFilterLabel, string> = {
  content:
    "Inhaltliche Kunden-Email mit relevantem Text fuer Pattern-Extraktion (Verkaufsdialog, Argumentation, Beratung, Methodik, Anekdoten, fachliche Erklaerungen).",
  short_reply:
    "Kurze Bestaetigungs- oder Smalltalk-Antwort ohne fachlichen Inhalt (z.B. 'Danke', 'OK', 'passt', 'gerne so'). Kein Pattern-Material.",
  notification:
    "Maschinell generierte Benachrichtigung (Auto-Reply, Out-of-Office, System-Bestaetigung, Lieferbestaetigung, Bounce-Notification, Mailing-List-Digest).",
  newsletter:
    "Marketing-/Newsletter-Versand an Verteiler (Werbung, Branchen-Update, Marketing-Funnel-Mail). Unabhaengig von Sender.",
  private:
    "Private, sensible oder persoenliche Kommunikation ohne geschaeftlichen Bezug (Familie, Gesundheit, intime Themen). Bewusster Skip aus Daten-Schutz.",
  unclear:
    "Klassifikation nicht eindeutig moeglich (Confidence unter Schwellenwert). Default-Fallback — GF entscheidet im Review.",
};

/**
 * zod-Schema fuer Single-Email-Klassifikations-Output von Haiku.
 *
 * Format: { message_id, label, confidence }
 *   - message_id: UUID der Email aus email_message-Tabelle (Pass-Through)
 *   - label: einer der 6 kanonischen Labels
 *   - confidence: [0, 1], Konfidenz des Modells
 */
export const PRE_FILTER_SINGLE_RESULT_SCHEMA = z.object({
  message_id: z.string().min(1),
  label: z.enum(PRE_FILTER_LABELS),
  confidence: z.number().min(0).max(1),
});

/**
 * zod-Schema fuer Batch-Klassifikations-Output von Haiku.
 * Erwartet ein JSON-Array von Single-Result-Objekten.
 *
 * Batch-Groesse 50 (SLC-166 MT-2 Spec) — pruefen wir nicht hier, weil Modell
 * theoretisch auch weniger zurueckgeben darf (z.B. wenn eine Email leer war).
 * Worker matched Output gegen Input via message_id und faellt fehlende auf
 * 'unclear' zurueck.
 */
export const PRE_FILTER_BATCH_RESULT_SCHEMA = z.array(
  PRE_FILTER_SINGLE_RESULT_SCHEMA,
);

/**
 * TypeScript-Types abgeleitet aus den zod-Schemas.
 */
export type PreFilterSingleResult = z.infer<typeof PRE_FILTER_SINGLE_RESULT_SCHEMA>;
export type PreFilterBatchResult = z.infer<typeof PRE_FILTER_BATCH_RESULT_SCHEMA>;

/**
 * Hilfsfunktion fuer den Prompt: rendert die kanonische Label-Liste mit
 * Beschreibungen in Markdown-Bullet-Form. Wird von prompt.ts genutzt, damit
 * Prompt-Text + Schema-Validator NIE auseinanderdriften.
 */
export function renderLabelDescriptionsForPrompt(): string {
  return PRE_FILTER_LABELS.map(
    (label) => `- ${label}: ${PRE_FILTER_LABEL_DESCRIPTIONS[label]}`,
  ).join("\n");
}
