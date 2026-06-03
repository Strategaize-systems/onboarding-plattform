// V9 SLC-166 MT-7 — Pattern-Scan-Helper fuer Live-Recall-Stichprobe nach
// dem Thread-Redact-Worker (AC-SLC-166-9 + Spec L219).
//
// Zweck: nach einem Live-Bedrock-Run koennen 10% der email_thread.redacted_body
// in QA oder Founder-Live-Smoke stichprobenartig auf zurueckgebliebene PII
// gescannt werden. Dieser Scanner findet KLAR-Klartext-Email-Adressen und
// KLAR-Klartext-Telefonnummern via regex — wenn der Bedrock-Redact den
// Original-Text korrekt ersetzt hat, sollten BEIDE Listen leer sein.
//
// Diese Pattern sind bewusst KONSERVATIV (lieber false-positives als
// false-negatives, weil der Zweck ist "Lecks finden"):
//   - Email: RFC-5322-Subset (local@domain.tld). Bekannte Pseudonyme
//     "P1@redacted" werden NICHT geflagged, weil sie nicht das Domain-TLD-
//     Pattern erfuellen (kein punkt-getrenntes Schema in domain).
//   - Telefon: deutsche/internationale Patterns (+49, 0..., (0..)/...).
//
// Stichproben-Helper samplePctThreads<T> liefert eine deterministische (per
// Seed) Auswahl von floor(pct * N) Elementen aus einem Array. Wird im QA-
// Workflow genutzt, um 10% der Threads sample-bar zu machen.
//
// Pattern-Reuse: V5 redaction-recall.test.ts (SLC-076 MT-3) liefert das
// V5-aequivalente Live-Recall-Konzept. Dieser Helper ist eine V9-spezifische
// statische Variante (kein Live-Bedrock-Call), die ENV-frei in Vitest laeuft.

/** RFC-5322-Subset, ASCII-only. Min. ein "." in der domain → schliesst
 *  "P1@redacted" oder "[EMAIL]"-Platzhalter aus. */
export const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Deutsche + internationale Telefon-Pattern. Drei alternative Praefixe:
 *  (a) `+CC <area>` — international, nach Land-Code optional die Vorabnull
 *      weglassend (Standard fuer deutsche Festnetz/Mobil nach +49).
 *  (b) `(NN)` / `(0NN)` — Klammer-Form fuer Vorwahl.
 *  (c) `0NN` — deutsche Vorwahl inkl. fuehrender Null.
 *  Danach mind. 3 + 2 Digits durch erlaubte Trenner. Schliesst kurze Zahlen
 *  (Pseudonym-IDs, Kontext-Erwaehnungen wie "P12") aus. */
export const PHONE_REGEX =
  /(?:\+\d{1,3}[\s.\-/]+\d{1,4}|\(0?\d{1,4}\)|0\d{1,4})[\s.\-/]*\d{3,}[\s.\-/]*\d{2,}\b/g;

export interface RedactedBodyScanResult {
  /** Geflaggte Klartext-Email-Adressen. Leer = clean. */
  emailLeaks: string[];
  /** Geflaggte Klartext-Telefonnummern. Leer = clean. */
  phoneLeaks: string[];
  /** Konvenience: true wenn beide Listen leer sind. */
  isClean: boolean;
}

/**
 * Scannt einen Redacted-Body-Text auf zurueckgebliebene Email-Adressen und
 * Telefonnummern. Returns ein Ergebnis-Objekt mit unique-deduplizierten
 * Treffern (kein Duplicate, falls dieselbe Adresse mehrfach im Text).
 */
export function scanRedactedBodyForLeaks(
  text: string | null | undefined,
): RedactedBodyScanResult {
  if (!text) {
    return { emailLeaks: [], phoneLeaks: [], isClean: true };
  }
  const emails = Array.from(new Set(text.match(EMAIL_REGEX) ?? []));
  const phones = Array.from(new Set(text.match(PHONE_REGEX) ?? []));
  return {
    emailLeaks: emails,
    phoneLeaks: phones,
    isClean: emails.length === 0 && phones.length === 0,
  };
}

/**
 * Liefert eine deterministische Stichprobe aus einem Array. Default-Anteil
 * 10% (AC-SLC-166-9 Spec L219). Bei Sample-Groesse 0 wird mindestens 1
 * Element zurueckgegeben (so dass die Stichprobe nie leer ist solange die
 * Quelle nicht leer ist).
 *
 * Sortier-Reihenfolge: Standard ist Index-modulo-Stride. Bei seed=true wird
 * mit einem festen LCG-PRNG geshuffelt (deterministisch reproduzierbar via
 * seed-Wert).
 */
export function samplePctThreads<T>(
  items: T[],
  pct: number = 0.1,
  options: { seed?: number } = {},
): T[] {
  if (items.length === 0) return [];
  const sampleCount = Math.max(1, Math.floor(items.length * pct));

  if (options.seed !== undefined) {
    // Linear Congruential Generator — deterministischer Shuffle.
    let state = options.seed >>> 0;
    const next = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleCount);
  }

  // Default: Index-modulo-Stride — deterministisch ohne PRNG.
  const stride = Math.max(1, Math.floor(items.length / sampleCount));
  const result: T[] = [];
  for (let i = 0; i < items.length && result.length < sampleCount; i += stride) {
    result.push(items[i]);
  }
  return result;
}
