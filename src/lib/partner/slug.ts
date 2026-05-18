/**
 * Slug-Generator fuer V7 Partner-Organisationen.
 *
 * Pure Functions — keine DB-Calls, keine I/O. Reuse-Anker: `slugifyHeading`
 * aus `src/lib/handbook/slugify.ts` (github-slugger) erfuellt unsere
 * Anforderungen nicht (a) keine deutsche Umlaut-Behandlung `ae/oe/ue/ss`
 * und (b) Diakritika werden nicht gestrippt sondern uebernommen. Daher
 * eigenstaendige Implementierung mit NFD-Normalisierung + expliziter
 * Umlaut-Translit. Die SQL-Backfill-Translit in Migration 097 ist eine
 * naive ASCII-Variante (`ä→a` statt `ä→ae`); der TS-Generator ist die
 * authoritative Variante fuer alle Neu-Anlagen ab V7.
 *
 * Pattern-Reuse-Eintrag (per strategaize-pattern-reuse.md): in keinem
 * Strategaize-Repo bisher fuer Tenant-Entities umgesetzt. Memory-File
 * `reference_partner_slug_pattern.md` wird in MT-7 angelegt fuer
 * naechste Projekte.
 */

import { isReservedSlug } from "./reserved-slugs";

const GERMAN_UMLAUTS: ReadonlyArray<readonly [string, string]> = [
  ["ä", "ae"],
  ["ö", "oe"],
  ["ü", "ue"],
  ["Ä", "Ae"],
  ["Ö", "Oe"],
  ["Ü", "Ue"],
  ["ß", "ss"],
];

const MAX_SLUG_LENGTH = 60;

/**
 * Wandelt einen Display-Name (z.B. "Mueller & Partner StB") in einen
 * URL-baren Kebab-Case-Slug (z.B. "mueller-partner-stb") um.
 *
 * Schritte:
 * 1) Deutsche Umlaute `ae/oe/ue/ss` ersetzen (case-erhaltend).
 * 2) Lowercase.
 * 3) NFD-Decompose + Combining-Marks-Strip (entfernt Accent-Diakritika wie
 *    `é → e`, `ô → o`).
 * 4) Alle Nicht-`[a-z0-9]` zu `-` ersetzen.
 * 5) Mehrfach-Hyphens kollabieren + Leading/Trailing-Hyphens entfernen.
 * 6) Auf max 60 chars truncate + Trailing-Hyphen nach Truncate entfernen.
 *
 * Wirft `Error` wenn der Input leer ist oder nach der Bereinigung leer waere
 * (z.B. nur Sonderzeichen). Caller-Pflicht: bei Edge-Cases manuellen
 * Fallback-Slug erzeugen (`partner-<id-prefix>` analog Migration 097).
 */
export function generateSlug(displayName: string): string {
  if (!displayName || displayName.trim().length === 0) {
    throw new Error("cannot generate slug from empty string");
  }

  let normalized = displayName;
  for (const [from, to] of GERMAN_UMLAUTS) {
    normalized = normalized.replaceAll(from, to);
  }

  normalized = normalized.toLowerCase();

  // NFD-Decompose + Combining-Marks-Strip (U+0300..U+036F) entfernt
  // Accent-Diakritika wie `é → e`, `ô → o`.
  normalized = normalized.normalize("NFD").replace(/[̀-ͯ]/g, "");

  normalized = normalized.replace(/[^a-z0-9]+/g, "-");
  normalized = normalized.replace(/-+/g, "-");
  normalized = normalized.replace(/^-+|-+$/g, "");

  if (normalized.length > MAX_SLUG_LENGTH) {
    normalized = normalized.substring(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  }

  if (normalized.length === 0) {
    throw new Error(
      "cannot generate slug from input — no alphanumeric chars after normalization",
    );
  }

  return normalized;
}

/**
 * Wie `generateSlug`, aber stellt Eindeutigkeit gegenueber einer existierenden
 * Slug-Menge sicher. Bei Kollision ODER Reserve-Slug-Treffer wird ein numerisches
 * Suffix `-2`, `-3`, ... angehaengt bis der Slug frei ist.
 *
 * `existingSlugs` darf case-sensitive sein — der Compare nutzt lowercase
 * (Vergleich passt zum DB-UNIQUE-Index `partner_organization_slug_lower_unique`).
 *
 * Reserve-Slugs werden wie Kollisionen behandelt (Caller hat keine andere
 * Option als Suffix anzuhaengen).
 */
export function generateUniqueSlug(
  displayName: string,
  existingSlugs: Set<string>,
): string {
  const baseSlug = generateSlug(displayName);
  const existingLower = new Set(
    Array.from(existingSlugs).map((s) => s.toLowerCase()),
  );

  const isTaken = (candidate: string): boolean =>
    existingLower.has(candidate.toLowerCase()) || isReservedSlug(candidate);

  if (!isTaken(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  let candidate = `${baseSlug}-${suffix}`;
  while (isTaken(candidate)) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
  return candidate;
}
