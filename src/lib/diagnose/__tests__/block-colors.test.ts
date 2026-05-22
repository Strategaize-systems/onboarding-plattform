// V7.3 SLC-140 MT-1 — Tests fuer Block-Color-Helper.

import { describe, it, expect } from "vitest";
import { BLOCK_COLORS, getBlockColor } from "../block-colors";

describe("block-colors", () => {
  it("liefert genau 6 Block-Color-Sets (eines pro Diagnose-Baustein)", () => {
    expect(BLOCK_COLORS).toHaveLength(6);
  });

  it("hat 6 distinkte Farbnamen (kein Duplikat zwischen Bloecken)", () => {
    const names = BLOCK_COLORS.map((c) => c.name);
    expect(new Set(names).size).toBe(6);
  });

  it("getBlockColor liefert deterministisch und wrappt bei Index >= 6", () => {
    // In-range: jeder Index 0..5 trifft den passenden Slot.
    for (let i = 0; i < BLOCK_COLORS.length; i++) {
      expect(getBlockColor(i)).toBe(BLOCK_COLORS[i]);
    }
    // Out-of-range: 6 -> 0, 7 -> 1, negative -> 0 (defensive Fallback).
    expect(getBlockColor(6)).toBe(BLOCK_COLORS[0]);
    expect(getBlockColor(7)).toBe(BLOCK_COLORS[1]);
    expect(getBlockColor(-1)).toBe(BLOCK_COLORS[0]);
    expect(getBlockColor(Number.NaN)).toBe(BLOCK_COLORS[0]);
  });
});
