// V9.1 SLC-V9.1-B MT-1 — Per-Email-Approval Pre-Cost-Estimate (FEAT-077).
//
// Slice: SLC-V9.1-B (MT-1) / Spec L29
// DECs:  DEC-197 (Per-Email-Approval > 0.50 EUR/Email als Outlier-Guard),
//        DEC-179 (~5 EUR Sonnet pro 1000 Emails Baseline).
//
// Continuous-Mode hat keinen User-getriggerten Pre-Cost-Estimate wie V9.0
// (pattern-start/page.tsx). Stattdessen schaetzt der Worker (MT-3) vor dem
// Sonnet-Pattern-Call die Per-Email-Kosten anhand der Email-Anzahl + Baseline.
// Ueberschreitet die Per-Email-Schaetzung die Approval-Schwelle (Default 0.50
// EUR/Email, DEC-197), pausiert der Worker auf 'awaiting_approval' bis der GF
// approved.
//
// WICHTIG zur Schwellen-Semantik (DEC-197): Die Baseline ~0.006 EUR/Email liegt
// WEIT unter 0.50 EUR/Email — Per-Email-Approval ist deshalb ein OUTLIER-GUARD,
// kein Routine-Gate. Bei ueblichen Continuous-Runs (kurze Forward-Mails)
// triggert es nie. Es greift nur, wenn die effektive Per-Email-Schaetzung die
// Schwelle reisst (z.B. via ENV `V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR`-Override
// fuer pathologisch teure Runs). Das matched DEC-197 "extreme Outlier triggern
// Modal ... ohne ueblichem-Run-Friction".
//
// Spec-Drift-Note (dokumentiert): Slice-Spec MT-1 und MT-3 nennen widerspruech-
// liche Per-Email-Zahlen (MT-1: 100 Mails -> 0.05 EUR/Mail "nicht-required";
// MT-3: 100 Mails -> 0.6 EUR/Mail "required"). Aufgeloest ueber ein flaches,
// parametrisierbares Baseline-Modell: Default-Baseline 0.006 EUR/Mail -> Approval
// triggert nie (MT-1-Konklusion "nicht-required" haelt); ein erhoehtes Baseline
// (Param/ENV) -> Approval triggert (MT-3-Pause-Pfad testbar).

/** Sonnet-Baseline-Kosten pro 1000 Emails (EUR) vor Safety-Buffer. DEC-179. */
export const SONNET_BASELINE_EUR_PER_1000 = 5;
/** Safety-Buffer-Faktor auf die Baseline (+20%, konservativ ueber-schaetzen). */
export const ESTIMATE_SAFETY_BUFFER = 1.2;
/**
 * Effektive Per-Email-Baseline (EUR/Email) inkl. Safety-Buffer:
 *   (5 / 1000) * 1.2 = 0.006 EUR/Email.
 */
export const DEFAULT_PER_EMAIL_BASELINE_EUR =
  (SONNET_BASELINE_EUR_PER_1000 / 1000) * ESTIMATE_SAFETY_BUFFER;
/** Default Per-Email-Approval-Schwelle (EUR/Email) per DEC-197 Option B. */
export const DEFAULT_PER_EMAIL_APPROVAL_THRESHOLD_EUR = 0.5;

export interface PatternExtractionEstimate {
  /** Anzahl Emails im akkumulierten Continuous-Run. */
  emailCount: number;
  /** Geschaetzte Kosten pro Email (EUR). */
  perEmailEur: number;
  /** Geschaetzte Gesamtkosten (EUR) = emailCount * perEmailEur. */
  totalEur: number;
}

/**
 * Resolved Per-Email-Baseline (EUR/Email) aus ENV
 * `V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR`, Fallback DEFAULT_PER_EMAIL_BASELINE_EUR.
 * Erlaubt dem Worker (MT-3) + Tests, die effektive Per-Email-Schaetzung zu
 * ueberschreiben (Outlier-Pfad / pathologisch teure Runs).
 */
export function resolvePerEmailBaselineEur(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PER_EMAIL_BASELINE_EUR;
}

/**
 * Resolved Per-Email-Approval-Schwelle (EUR/Email) aus ENV
 * `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR`, Fallback 0.50.
 */
export function resolvePerEmailApprovalThresholdEur(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0
    ? n
    : DEFAULT_PER_EMAIL_APPROVAL_THRESHOLD_EUR;
}

/**
 * Pure-Function Pre-Cost-Estimate fuer einen Continuous-Pattern-Extraction-Run.
 *
 * @param emailCount  Anzahl Emails im akkumulierten Continuous-Run.
 * @param perEmailEur Per-Email-Baseline (EUR). Default = resolvePerEmailBaselineEur().
 *
 * Negative/nicht-finite Inputs werden auf 0 normalisiert (defensive).
 */
export function estimatePatternExtractionCost(
  emailCount: number,
  perEmailEur: number = resolvePerEmailBaselineEur(),
): PatternExtractionEstimate {
  const count =
    Number.isFinite(emailCount) && emailCount > 0 ? Math.floor(emailCount) : 0;
  const perEmail =
    Number.isFinite(perEmailEur) && perEmailEur > 0 ? perEmailEur : 0;
  return {
    emailCount: count,
    perEmailEur: perEmail,
    totalEur: count * perEmail,
  };
}

/**
 * true wenn die Per-Email-Schaetzung die Approval-Schwelle ueberschreitet
 * (`perEmailEur > thresholdEur`) -> Worker (MT-3) pausiert auf 'awaiting_approval'.
 * Strikt groesser: genau auf der Schwelle = KEIN Approval (analog V9.0
 * checkPreApprovalThreshold-Semantik).
 */
export function requiresPerEmailApproval(
  estimate: PatternExtractionEstimate,
  thresholdEur: number = resolvePerEmailApprovalThresholdEur(),
): boolean {
  return estimate.perEmailEur > thresholdEur;
}
