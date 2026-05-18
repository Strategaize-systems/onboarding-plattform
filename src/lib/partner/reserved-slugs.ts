/**
 * Reserve-Slugs fuer V7 Partner-URLs.
 *
 * Diese System-Slugs duerfen nie als Partner-Organisation-Slug verwendet werden.
 * Sie werden vom Slug-Generator (`generateUniqueSlug`) wie eine Kollision
 * behandelt (→ Suffix `-2`) und vom Public-Resolve-Endpoint
 * (`GET /api/public/partner/[slug]`) als 404 returniert, ohne dass eine
 * DB-Query erfolgt.
 *
 * Defense-in-Depth-Plan:
 * - V7: Application-Layer-Check (hier).
 * - V8+: zusaetzlicher DB-CHECK-Constraint auf `partner_organization.slug`,
 *   so dass auch direkter SQL-INSERT nicht versehentlich einen Reserve-Slug
 *   setzen kann.
 *
 * Liste ist erweiterbar. Bei neuen Next.js-Routen unter `/p/[slug]` oder
 * `/api/public/partner/[slug]` muessen die Top-Level-Pfadsegmente hier
 * ergaenzt werden.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "public",
  "p",
  "partner",
  "strategaize",
  "auth",
  "assets",
  "_next",
  "favicon.ico",
]);

/**
 * Liefert `true`, wenn `slug` (case-insensitive) auf der Reserve-Liste steht.
 *
 * Reuse-Hinweis: `RESERVED_SLUGS` ist case-sensitive im Set, daher `lower()`
 * vor dem Lookup. Caller muessen nicht selbst lowercasen.
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
