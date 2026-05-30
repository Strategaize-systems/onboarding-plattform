// V8 SLC-150 MT-2 + Polish-Round-1 — Vitest fuer Theme-Token-Konsistenz +
// Resolver. Verifiziert 1:1-Port aus MANDANTEN_REPORT_PROTOTYP.html CSS-Variables.

import { describe, it, expect } from "vitest";

import {
  COLOR,
  PAGE,
  PAGE_SIZE,
  SPACING,
  TYPOGRAPHY,
  WHEEL,
  WHEEL_V2,
  getClassificationColor,
  getStufeColor,
} from "../theme";

describe("theme COLOR tokens (1:1 Master CSS-Variables)", () => {
  it("brand-deep matches #0a0641", () => {
    expect(COLOR.brandDeep).toBe("#0a0641");
  });

  it("brand-primary-dark matches #120774", () => {
    expect(COLOR.brandPrimaryDark).toBe("#120774");
  });

  it("brand-primary matches #4454b8 (Indigo)", () => {
    expect(COLOR.brandPrimary).toBe("#4454b8");
  });

  it("brand-accent matches #4dcb8b (Gruen)", () => {
    expect(COLOR.brandAccent).toBe("#4dcb8b");
  });

  it("brand-accent-dark matches #00a84f", () => {
    expect(COLOR.brandAccentDark).toBe("#00a84f");
  });

  it("exposes 5 stufen-Farben", () => {
    expect(COLOR.stufen.s1).toBe("#dc2626"); // kritisch
    expect(COLOR.stufen.s2).toBe("#f59e0b"); // Ansaetze
    expect(COLOR.stufen.s3).toBe("#4454b8"); // teilweise
    expect(COLOR.stufen.s4).toBe("#4dcb8b"); // etabliert
    expect(COLOR.stufen.s5).toBe("#00a84f"); // belastbar
  });

  it("classification rot = danger, amber = warning, gruen = accent", () => {
    expect(COLOR.classification.rot).toBe("#dc2626");
    expect(COLOR.classification.amber).toBe("#f59e0b");
    expect(COLOR.classification.gruen).toBe("#4dcb8b");
  });
});

describe("getClassificationColor", () => {
  it("maps 'rot' to danger #dc2626", () => {
    expect(getClassificationColor("rot")).toBe("#dc2626");
  });

  it("maps 'amber' to warning #f59e0b", () => {
    expect(getClassificationColor("amber")).toBe("#f59e0b");
  });

  it("maps 'gruen' to brand-accent #4dcb8b", () => {
    expect(getClassificationColor("gruen")).toBe("#4dcb8b");
  });

  it("falls back to textMuted on unknown key", () => {
    expect(getClassificationColor("unknown")).toBe(COLOR.textMuted);
  });
});

describe("getStufeColor (5-Stufen-Mapping)", () => {
  it("Stufe 1 -> kritisch danger", () => {
    expect(getStufeColor(1)).toBe("#dc2626");
  });

  it("Stufe 2 -> Ansaetze warning", () => {
    expect(getStufeColor(2)).toBe("#f59e0b");
  });

  it("Stufe 3 -> teilweise brand-primary", () => {
    expect(getStufeColor(3)).toBe("#4454b8");
  });

  it("Stufe 4 -> etabliert brand-accent", () => {
    expect(getStufeColor(4)).toBe("#4dcb8b");
  });

  it("Stufe 5 -> belastbar success", () => {
    expect(getStufeColor(5)).toBe("#00a84f");
  });

  it("Stufe <= 0 fallback auf Stufe 1", () => {
    expect(getStufeColor(0)).toBe("#dc2626");
    expect(getStufeColor(-1)).toBe("#dc2626");
  });
});

describe("page + spacing tokens", () => {
  it("PAGE.marginPt is positive number", () => {
    expect(PAGE.marginPt).toBeGreaterThan(0);
  });

  it("PAGE_SIZE matches A4 (595 x 842 pt)", () => {
    expect(PAGE_SIZE.widthPt).toBe(595);
    expect(PAGE_SIZE.heightPt).toBe(842);
  });

  it("SPACING scale increases monotonically", () => {
    expect(SPACING.xs).toBeLessThan(SPACING.sm);
    expect(SPACING.sm).toBeLessThan(SPACING.md);
    expect(SPACING.md).toBeLessThan(SPACING.lg);
    expect(SPACING.lg).toBeLessThan(SPACING.xl);
    expect(SPACING.xl).toBeLessThan(SPACING.xxl);
  });

  it("SPACING.outroSectionGap is positive (V8.1 SLC-162 Card-Gap)", () => {
    expect(SPACING.outroSectionGap).toBeGreaterThan(0);
  });
});

describe("V8.1 SLC-162 Outro-Tokens (DEC-171 Verkaufs-Style)", () => {
  const HEX = /^#[0-9a-fA-F]{6}$/;

  it("outro.cardBg is valid hex", () => {
    expect(COLOR.outro.cardBg).toMatch(HEX);
  });

  it("outro.cardBorder is valid hex", () => {
    expect(COLOR.outro.cardBorder).toMatch(HEX);
  });

  it("outro.accent matches brandAccent #4dcb8b (Strategaize-Akzent per DEC-171)", () => {
    expect(COLOR.outro.accent).toBe("#4dcb8b");
    expect(COLOR.outro.accent).toBe(COLOR.brandAccent);
  });

  it("outro.videoBoxBg matches brandPrimaryDark #120774 (Strategaize-Brand-Box)", () => {
    expect(COLOR.outro.videoBoxBg).toBe("#120774");
    expect(COLOR.outro.videoBoxBg).toBe(COLOR.brandPrimaryDark);
  });

  it("outro.badgeAktuelleStufeBg is valid hex", () => {
    expect(COLOR.outro.badgeAktuelleStufeBg).toMatch(HEX);
  });
});

describe("typography tokens", () => {
  it("hero title > page title > body > small", () => {
    expect(TYPOGRAPHY.heroTitleSize).toBeGreaterThan(TYPOGRAPHY.pageTitleSize);
    expect(TYPOGRAPHY.pageTitleSize).toBeGreaterThan(TYPOGRAPHY.bodySize);
    expect(TYPOGRAPHY.bodySize).toBeGreaterThan(TYPOGRAPHY.smallSize);
  });
});

describe("wheel tokens", () => {
  it("WHEEL viewBox 0 0 200 200 (Legacy MT-1)", () => {
    expect(WHEEL.viewBox).toBe("0 0 200 200");
  });

  it("WHEEL_V2 viewBox -20 -20 600 600 (Polish-Round-1)", () => {
    expect(WHEEL_V2.viewBox).toBe("-20 -20 600 600");
  });

  it("WHEEL_V2 center (280, 280)", () => {
    expect(WHEEL_V2.centerX).toBe(280);
    expect(WHEEL_V2.centerY).toBe(280);
  });

  it("WHEEL_V2 inner-hole r=90, outer-max r=255", () => {
    expect(WHEEL_V2.innerRadius).toBe(90);
    expect(WHEEL_V2.maxOuterRadius).toBe(255);
  });

  it("WHEEL_V2 hat 3 Grid-Ringe", () => {
    expect(WHEEL_V2.gridRings).toHaveLength(3);
  });
});
