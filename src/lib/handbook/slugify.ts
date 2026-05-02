// SLC-052 MT-1 — slugifyHeading: shared util used by Worker (TOC + section
// anchor injection) and consumed indirectly by the Reader through rehype-slug
// (which uses the same github-slugger algorithm, so worker-generated anchor IDs
// match rehype-slug-generated IDs on h2/h3 inside the same render).
//
// Diacritics are NOT stripped (e.g. "Über" -> "über") because rehype-slug
// behaves the same way. The slice spec example "ÜberArbeit -> uberarbeit" is
// inaccurate against github-slugger's actual behavior; consistency with
// rehype-slug wins (AC-2).

import { slug } from "github-slugger";

export function slugifyHeading(text: string): string {
  return slug(text);
}
