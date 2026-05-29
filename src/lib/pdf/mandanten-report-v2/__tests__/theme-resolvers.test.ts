// V8 SLC-150 MT-2 — Vitest fuer Theme-Token-Konsistenz + Resolver.

import { describe, it, expect } from "vitest";

import { COLOR, PAGE, PAGE_SIZE, SPACING, TYPOGRAPHY, WHEEL, getClassificationColor } from "../theme";

describe("theme COLOR tokens", () => {
  it("exposes classification keys konsistent zu sui-engine", () => {
    expect(COLOR.classification.rot).toBeDefined();
    expect(COLOR.classification.amber).toBeDefined();
    expect(COLOR.classification.gruen).toBeDefined();
  });

  it("classification rot is red-600", () => {
    expect(COLOR.classification.rot).toBe("#DC2626");
  });
});

describe("getClassificationColor", () => {
  it("maps 'rot' to red-600", () => {
    expect(getClassificationColor("rot")).toBe("#DC2626");
  });

  it("maps 'amber' to amber-500", () => {
    expect(getClassificationColor("amber")).toBe("#F59E0B");
  });

  it("maps 'gruen' to emerald-500", () => {
    expect(getClassificationColor("gruen")).toBe("#10B981");
  });

  it("falls back to textMuted on unknown key", () => {
    expect(getClassificationColor("unknown")).toBe(COLOR.textMuted);
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
});

describe("typography tokens", () => {
  it("hero title > page title > body > small", () => {
    expect(TYPOGRAPHY.heroTitleSize).toBeGreaterThan(TYPOGRAPHY.pageTitleSize);
    expect(TYPOGRAPHY.pageTitleSize).toBeGreaterThan(TYPOGRAPHY.bodySize);
    expect(TYPOGRAPHY.bodySize).toBeGreaterThan(TYPOGRAPHY.smallSize);
  });
});

describe("wheel tokens", () => {
  it("viewBox is 0 0 200 200", () => {
    expect(WHEEL.viewBox).toBe("0 0 200 200");
  });

  it("defaultCenterX is centered for viewBox", () => {
    expect(WHEEL.defaultCenterX).toBe(100);
    expect(WHEEL.defaultCenterY).toBe(100);
  });
});
