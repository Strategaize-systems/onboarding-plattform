// V9 SLC-166 MT-3 — Pure helpers + constants fuer Filter-Review-UI.
//
// Trennung von actions.ts: Next.js "use server"-Files erlauben nur async-
// Function-Exports. Konstanten + Types + Pure-Helpers landen hier.
//
// Pattern-Reuse aus:
//   - src/app/dashboard/bulk-email-import/helpers.ts (SLC-165 MT-4) —
//     Constants/Types-Trennung von "use server"-actions.ts
//   - src/lib/bulk-email/pre-filter/labels.ts (SLC-166 MT-2) —
//     PRE_FILTER_LABELS Single-Source-of-Truth, hier nur re-exportiert
//     damit Page + Client-Component sie ohne Worker-Lib-Import ziehen
//   - src/workers/bulk-email/job-types.ts (SLC-165 MT-5 pre-declared) —
//     JOB_TYPE_EMAIL_BULK_THREAD_REDACT als String-Konstante (L-1-Hint
//     aus RPT-391 wird in MT-3 noch nicht behoben; hier mirror gehalten).

import {
  PRE_FILTER_LABELS,
  PRE_FILTER_LABEL_DESCRIPTIONS,
  type PreFilterLabel,
} from "@/lib/bulk-email/pre-filter/labels";

export { PRE_FILTER_LABELS, PRE_FILTER_LABEL_DESCRIPTIONS };
export type { PreFilterLabel };

/** Job-Type fuer den Thread-Redact-Worker (SLC-166 MT-6, FEAT-072). */
export const JOB_TYPE_EMAIL_BULK_THREAD_REDACT = "email_bulk_thread_redact" as const;

/**
 * Maximale Anzahl Updates pro `updateEmailClassifications`-Call.
 * Bulk-Reclassify "alle unclear -> content" kann groesser werden; wir lassen
 * 500 pro Call zu (das deckt ~99% der V9.0-Test-Corpus-Faelle). Bei sehr
 * grossen Runs muss die Client-Component splitten.
 */
export const MAX_UPDATES_PER_CALL = 500;

/**
 * Maximale Body-Excerpt-Laenge im Email-Card. Spec L116 "Pro-Email-Detail-Card
 * mit Klassifikation + Confidence + Korrektur-Dropdown" — Body ist als Quick-
 * Scan gedacht, nicht als Detail-Lese-Ansicht. 200 Zeichen reichen fuer den
 * Klassifikations-Sanity-Check, ohne die Liste zu sprengen.
 */
export const BODY_EXCERPT_CHARS = 200;

/**
 * Klassifikations-Counts pro Label, fuer das Counts-Card oben in der UI.
 * Spec L115 "342 Emails: 87 content, 200 short_reply, 35 notification, 18
 * newsletter, 0 private, 2 unclear".
 */
export type ClassificationCounts = Record<PreFilterLabel, number>;

export function emptyClassificationCounts(): ClassificationCounts {
  return PRE_FILTER_LABELS.reduce(
    (acc, label) => ({ ...acc, [label]: 0 }),
    {} as ClassificationCounts,
  );
}

/**
 * Eine einzelne Email-Row in der Review-Liste. Felder aus email_message:
 * - id: UUID, Pass-Through
 * - subject, from_address, body_text: fuer Quick-Scan
 * - pre_filter_label: aktuelles Label (nullable theoretisch, in dieser View
 *   filtern wir aber auf "Run ist im pre_filtered-Status" → alle Emails
 *   haben ein Label)
 * - pre_filter_confidence: Konfidenz aus Haiku (0..1, numeric(3,2))
 * - pre_filter_corrected: GF-Manuelle-Korrektur-Marker
 */
export interface EmailReviewItem {
  id: string;
  subject: string | null;
  from_address: string | null;
  body_text: string | null;
  pre_filter_label: PreFilterLabel;
  pre_filter_confidence: number | null;
  pre_filter_corrected: boolean;
}

/** Aggregierter Bulk-Run-Status fuer das Page-Header. */
export interface FilterReviewRunHeader {
  id: string;
  source_file_name: string;
  status: string;
  email_count: number;
}

/** Vollstaendige Page-Data, geladen via getFilterReviewData. */
export interface FilterReviewData {
  run: FilterReviewRunHeader;
  items: EmailReviewItem[];
  counts: ClassificationCounts;
}

/**
 * Result-Type fuer Server-Action `updateEmailClassifications`. ok-Pfad enthaelt
 * Anzahl tatsaechlich applizierter Updates; bei Re-Runs koennen Updates skip-
 * pen wenn das Label schon dem Ziel entspricht (No-Op).
 */
export type UpdateClassificationsResult =
  | { ok: true; updatedCount: number }
  | { ok: false; error: string };

export type ApprovePreFilterResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

/**
 * Pre-Server-Validation eines einzelnen Update-Eintrags. Server-Action ruft
 * das auch nochmal — hier exportieren wir es, damit die Client-Component
 * dieselbe Logik fuer die Disable-State-Pruefung des Korrektur-Dropdowns
 * benutzen kann.
 */
export function isValidClassificationUpdate(value: unknown): value is {
  message_id: string;
  new_label: PreFilterLabel;
} {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.message_id !== "string" || obj.message_id.length === 0) {
    return false;
  }
  if (typeof obj.new_label !== "string") return false;
  return (PRE_FILTER_LABELS as readonly string[]).includes(obj.new_label);
}

/**
 * Excerpt aus body_text fuer das Email-Card. NULL bzw. leer → "(kein Body)".
 * Trimmt + truncated bei BODY_EXCERPT_CHARS + Suffix `…` bei Truncate.
 */
export function buildBodyExcerpt(bodyText: string | null): string {
  if (!bodyText) return "(kein Body)";
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) return "(kein Body)";
  if (trimmed.length <= BODY_EXCERPT_CHARS) return trimmed;
  return `${trimmed.slice(0, BODY_EXCERPT_CHARS)}…`;
}
