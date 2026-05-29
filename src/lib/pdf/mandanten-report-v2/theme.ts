// V8 SLC-150 MT-2 + Polish-Round-1 — Renderer Theme-Konstanten fuer
// Mandanten-Report V2.
//
// 1:1-Port der CSS-Variables aus
// `docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (Layout-Master
// 2026-05-28 freigegeben).
//
// Brand-Theme: tiefes Indigo (#0a0641 Deep, #120774 Primary-Dark,
// #4454b8 Primary) mit gruenem Akzent (#4dcb8b Accent-Light,
// #00a84f Accent-Dark) — NICHT Slate/Amber.
//
// 5-Stufen-Klassifizierung fuer Modul-Scores (s1..s5) — separat von
// SUI-Klassifizierung (3 Bereiche).

export const COLOR = {
  // Brand-Skala (Indigo)
  brandDeep: "#0a0641",
  brandPrimaryDark: "#120774",
  brandPrimary: "#4454b8",
  brandPrimaryLight: "#6b7bd0",

  // Accent (Gruen)
  brandAccent: "#4dcb8b",
  brandAccentDark: "#00a84f",

  // Semantic
  success: "#00a84f",
  successLight: "#4dcb8b",
  warning: "#f59e0b",
  warningLight: "#fbbf24",
  warningText: "#b45309",
  danger: "#dc2626",
  dangerLight: "#ef4444",

  // Neutral-Skala
  neutral50: "#fafbfc",
  neutral100: "#f4f6fa",
  neutral200: "#e8ecf3",
  neutral300: "#d1d8e3",
  neutral400: "#94a3b8",
  neutral500: "#64748b",
  neutral600: "#475569",
  neutral700: "#334155",
  neutral800: "#1e293b",
  neutral900: "#0f172a",

  // Text-Aliases
  textDark: "#1e293b",
  textMuted: "#64748b",
  textLight: "#94a3b8",

  // Backgrounds
  bgWhite: "#FFFFFF",
  bgNeutralLight: "#f4f6fa",

  // SUI-Klassifizierung (3 Bereiche, fuer SUI-Hero-Badge)
  classification: {
    rot: "#dc2626", // strukturluecke
    amber: "#f59e0b", // teil_reife
    gruen: "#4dcb8b", // tragbar (brand-accent-light, NICHT pure success)
  },

  // Modul-Stufen-Farben (5 Stufen, fuer Wheel-Sektoren + Stufe-Pills)
  stufen: {
    s1: "#dc2626", // Stufe 1 = kritisch (danger)
    s2: "#f59e0b", // Stufe 2 = Ansaetze (warning)
    s3: "#4454b8", // Stufe 3 = teilweise (brand-primary)
    s4: "#4dcb8b", // Stufe 4 = etabliert (brand-accent)
    s5: "#00a84f", // Stufe 5 = belastbar (success)
  },
} as const;

export const PAGE = {
  // A4 = 595 × 842 pt
  marginPt: 40, // ~14mm
} as const;

export const PAGE_SIZE = {
  widthPt: 595,
  heightPt: 842,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  xxl: 40,
} as const;

export const TYPOGRAPHY = {
  // Reflektiert Master-CSS (rem→pt-Konvertierung mit 16px Base):
  // cover-title 3rem=48px, section-title 2.25rem=36px, etc.
  heroTitleSize: 38, // cover-title, slightly reduziert fuer A4
  heroSubtitleSize: 14,
  pageTitleSize: 30, // section-title
  sectionHeaderSize: 14,
  bodySize: 11,
  smallSize: 9,
  monoSize: 9,
  lineHeight: 1.5,
} as const;

export const WHEEL = {
  // SLC-148 MT-5 computeWheelPaths Defaults (kompatibel mit alter Pure-Function)
  viewBox: "0 0 200 200",
  defaultRadius: 80,
  defaultCenterX: 100,
  defaultCenterY: 100,
} as const;

// Polish-Round-1: Wheel-V2 nach Master-Vorlage Page 3 (Annulus-Sectoren).
// ViewBox -20 -20 600 600. Center (280, 280). Inner-Hole r=90. Outer-Limit r=255.
export const WHEEL_V2 = {
  viewBox: "-20 -20 600 600",
  centerX: 280,
  centerY: 280,
  innerRadius: 90,
  maxOuterRadius: 255,
  outerCircleRadius: 263,
  // 3 Grid-Ringe als Reife-Indikator (basierend auf Master: r=144.45, r=198.90, r=255)
  // Diese entsprechen Score 3.3, 6.6, 10 (lineare Skala 90→255).
  gridRings: [144.45, 198.9, 255.0],
} as const;

export type ClassificationColorKey = "rot" | "amber" | "gruen";
export type StufeKey = "s1" | "s2" | "s3" | "s4" | "s5";

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

export function getStufeColor(stufe: number): string {
  if (stufe <= 1) return COLOR.stufen.s1;
  if (stufe === 2) return COLOR.stufen.s2;
  if (stufe === 3) return COLOR.stufen.s3;
  if (stufe === 4) return COLOR.stufen.s4;
  return COLOR.stufen.s5;
}
