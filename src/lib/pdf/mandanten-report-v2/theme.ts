// V8 SLC-150 MT-1 — Renderer Theme-Konstanten fuer Mandanten-Report V2.
//
// Quelle: docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html (Layout-Master
// 2026-05-28 freigegeben). RGB-Werte konsistent zu `src/lib/diagnose/
// wheel-paths.ts` (Tailwind red-600/amber-500/emerald-500).
//
// Custom-Fonts (Fraunces + JetBrains Mono) kommen in MT-2/MT-3 Cover-Page —
// fuer den MT-1 Spike reicht @react-pdf Default-Helvetica.

export const COLOR = {
  // Brand
  brandPrimary: "#0F172A", // slate-900
  brandPrimaryDark: "#020617", // slate-950
  textDark: "#0F172A",
  textMuted: "#64748B", // slate-500
  textLight: "#94A3B8", // slate-400
  borderSlate: "#E2E8F0", // slate-200
  bgSlate: "#F8FAFC", // slate-50
  bgWhite: "#FFFFFF",

  // Classification (3-Stufen, konsistent zu wheel-paths.ts COLOR_RGB)
  classification: {
    rot: "#DC2626", // red-600 — strukturluecke
    amber: "#F59E0B", // amber-500 — teil_reife
    gruen: "#10B981", // emerald-500 — tragbar
  },
} as const;

export const PAGE = {
  // A4 = 595 × 842 pt
  marginPt: 40, // ~14mm
} as const;

export const TYPOGRAPHY = {
  // Default-Helvetica fuer MT-1 Spike. MT-2/MT-3 ergaenzen Custom-Fonts.
  heroTitleSize: 36,
  heroSubtitleSize: 14,
  pageTitleSize: 24,
  sectionHeaderSize: 14,
  bodySize: 11,
  smallSize: 9,
  monoSize: 9,
  lineHeight: 1.5,
} as const;

export const WHEEL = {
  // SLC-148 MT-5 computeWheelPaths Defaults
  viewBox: "0 0 200 200",
  defaultRadius: 80,
  defaultCenterX: 100,
  defaultCenterY: 100,
} as const;

// MT-2 additive: Spacing-Tokens + Page-Sizes (A4 in pt) + Typography-Roles.

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  xxl: 40,
} as const;

export const PAGE_SIZE = {
  // A4 = 595 x 842 pt
  widthPt: 595,
  heightPt: 842,
} as const;

/**
 * Resolver fuer Classification-Farben aus dem SuiClassification.color-Feld.
 * Konsistent mit theme.COLOR.classification. Fallback auf textMuted bei
 * unbekanntem Color-Key (defensive).
 */
export type ClassificationColorKey = "rot" | "amber" | "gruen";

export function getClassificationColor(color: string): string {
  switch (color) {
    case "rot":
      return COLOR.classification.rot;
    case "amber":
      return COLOR.classification.amber;
    case "gruen":
      return COLOR.classification.gruen;
    default:
      return COLOR.textMuted;
  }
}
