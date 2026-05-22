// V7.3 SLC-140 MT-1 — Block-Color-Helper fuer Diagnose-Bericht-Section-Cards.
//
// 6 Tailwind-Default-Farben fuer 6 BlockSectionCards in der Reihenfolge der
// Bloecke aus `partner_diagnostic_v1`-Template. Block-Color != Score-Color:
// ScoreVisual.tsx nutzt eigene score-range-basierte Farben (red/amber/emerald
// je nach Score-Hoehe) — dieser Helper liefert reine Block-Identifier-Farben
// fuer die Section-Cards. Konsistenz zwischen ScoreVisual-Bars und
// BlockSectionCards laeuft ueber den Block-Index/Reihenfolge, nicht ueber
// Farbe.
//
// Pre-Audit-Finding (RPT-335 + Live-Verifikation MT-1a):
//   - Original SLC-140-Spec MT-1: "6 distinct Block-Akzent-Farben konsistent
//     zu ScoreVisual". Live ergab: ScoreVisual hat keine Block-Farben, sondern
//     Score-Range-Farben. Anpassung: Helper ist Block-only, ScoreVisual bleibt
//     unveraendert (DEC implizit, in RPT-336 dokumentiert).

export interface BlockColorSet {
  /** Tailwind class for solid accent (e.g. background of badges, top-strip). */
  accent: string;
  /** Tailwind class for soft background tint (card body wash). */
  bg: string;
  /** Tailwind class for matching border (card border, divider). */
  border: string;
  /** Tailwind class for matching foreground text on accent background. */
  textOnAccent: string;
  /** Tailwind class for dark-tone foreground (label text on tinted bg). */
  textTone: string;
  /** Human-readable color name (debug + tests). */
  name: string;
}

export const BLOCK_COLORS: readonly BlockColorSet[] = [
  {
    accent: "bg-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
    textOnAccent: "text-white",
    textTone: "text-blue-900",
    name: "blue",
  },
  {
    accent: "bg-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    textOnAccent: "text-white",
    textTone: "text-emerald-900",
    name: "emerald",
  },
  {
    accent: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    textOnAccent: "text-white",
    textTone: "text-amber-900",
    name: "amber",
  },
  {
    accent: "bg-violet-500",
    bg: "bg-violet-50",
    border: "border-violet-200",
    textOnAccent: "text-white",
    textTone: "text-violet-900",
    name: "violet",
  },
  {
    accent: "bg-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    textOnAccent: "text-white",
    textTone: "text-rose-900",
    name: "rose",
  },
  {
    accent: "bg-teal-500",
    bg: "bg-teal-50",
    border: "border-teal-200",
    textOnAccent: "text-white",
    textTone: "text-teal-900",
    name: "teal",
  },
] as const;

export function getBlockColor(index: number): BlockColorSet {
  // Modulo defensiv: wenn jemals mehr als 6 Bloecke kommen, wrappt der Helper
  // sauber statt undefined zu liefern. Aktuelles Template hat exakt 6, der
  // Wrap-Pfad ist defensive coding fuer Future-Templates.
  const safeIndex =
    Number.isFinite(index) && index >= 0 ? index % BLOCK_COLORS.length : 0;
  return BLOCK_COLORS[safeIndex];
}
