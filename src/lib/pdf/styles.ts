// SLC-141 MT-2 (FEAT-060) — PDF-Styles fuer Diagnose-Bericht.
//
// Eigener Style-Pfad via @react-pdf/renderer StyleSheet.create — KEINE
// Tailwind-Klassen (renderer ignoriert die). Werte sind absichtlich
// konservativ + nahe Strategaize-Brand (Slate-Skala + brand-primary
// #4454B8, identisch zu app-Tailwind-Token).
//
// A4 = 595 x 842 pt. Margins 20mm = ~56pt.

import { StyleSheet } from "@react-pdf/renderer";

export const BRAND_PRIMARY = "#4454B8";
export const BRAND_PRIMARY_DARK = "#36428F";
export const TEXT_DARK = "#0F172A";
export const TEXT_MUTED = "#64748B";
export const BORDER_SLATE = "#E2E8F0";
export const BG_SLATE = "#F8FAFC";
export const SCORE_LOW = "#DC2626";
export const SCORE_MID = "#F59E0B";
export const SCORE_HIGH = "#059669";

export const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 10,
    color: TEXT_DARK,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    borderBottom: 1,
    borderBottomColor: BORDER_SLATE,
    paddingBottom: 10,
  },
  headerLogoBlock: {
    flexDirection: "column",
    alignItems: "flex-start",
    width: "50%",
  },
  headerPartnerBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    width: "50%",
  },
  brandLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: BRAND_PRIMARY,
  },
  brandSubtitle: {
    fontSize: 8,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  partnerDisplayName: {
    fontSize: 9,
    color: TEXT_MUTED,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: TEXT_DARK,
    marginTop: 18,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: TEXT_MUTED,
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "bold",
    color: TEXT_DARK,
    marginTop: 16,
    marginBottom: 6,
  },
  scoreVisualContainer: {
    backgroundColor: BG_SLATE,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  scoreLabel: {
    width: "55%",
    fontSize: 9,
    color: TEXT_DARK,
  },
  scoreTrack: {
    width: "35%",
    height: 6,
    backgroundColor: BORDER_SLATE,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreFill: {
    height: 6,
    borderRadius: 3,
  },
  scoreValue: {
    width: "10%",
    fontSize: 9,
    color: TEXT_MUTED,
    textAlign: "right",
  },
  blockSection: {
    marginBottom: 14,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: BRAND_PRIMARY,
    marginBottom: 4,
  },
  blockIntro: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginBottom: 4,
    fontStyle: "italic",
  },
  blockComment: {
    fontSize: 10,
    color: TEXT_DARK,
    lineHeight: 1.45,
  },
  closingStatement: {
    backgroundColor: BG_SLATE,
    borderLeft: 3,
    borderLeftColor: BRAND_PRIMARY,
    padding: 10,
    marginTop: 16,
    fontSize: 9,
    color: TEXT_DARK,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    fontSize: 8,
    color: TEXT_MUTED,
    borderTop: 1,
    borderTopColor: BORDER_SLATE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function scoreColor(score: number): string {
  if (score < 40) return SCORE_LOW;
  if (score < 70) return SCORE_MID;
  return SCORE_HIGH;
}
