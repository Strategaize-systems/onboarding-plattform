// V8 SLC-151 MT-1 — Vitest fuer Pure-Logic-Helpers der ModulPage-Component.

import { describe, it, expect } from "vitest";

import type { V8StufenLookup } from "@/lib/diagnose/types";
import {
  modulIdxFromKey,
  resolveStufenInfo,
} from "../modul-page-resolvers";

const mockLookup: V8StufenLookup = {
  m1: {
    s1: { was_es_bedeutet: "m1-s1-bedeutung", unsere_empfehlung: "m1-s1-empfehlung" },
    s2: { was_es_bedeutet: "m1-s2-bedeutung", unsere_empfehlung: "m1-s2-empfehlung" },
    s3: { was_es_bedeutet: "m1-s3-bedeutung", unsere_empfehlung: "m1-s3-empfehlung" },
    s4: { was_es_bedeutet: "m1-s4-bedeutung", unsere_empfehlung: "m1-s4-empfehlung" },
    s5: { was_es_bedeutet: "m1-s5-bedeutung", unsere_empfehlung: "m1-s5-empfehlung" },
  },
  m2: {
    s1: { was_es_bedeutet: "m2-s1-bedeutung", unsere_empfehlung: "m2-s1-empfehlung" },
    s2: { was_es_bedeutet: "m2-s2-bedeutung", unsere_empfehlung: "m2-s2-empfehlung" },
    s3: { was_es_bedeutet: "m2-s3-bedeutung", unsere_empfehlung: "m2-s3-empfehlung" },
    s4: { was_es_bedeutet: "m2-s4-bedeutung", unsere_empfehlung: "m2-s4-empfehlung" },
    s5: { was_es_bedeutet: "m2-s5-bedeutung", unsere_empfehlung: "m2-s5-empfehlung" },
  },
} as unknown as V8StufenLookup;

describe("modulIdxFromKey", () => {
  it("maps m1 -> 0", () => {
    expect(modulIdxFromKey("m1")).toBe(0);
  });

  it("maps m9 -> 8", () => {
    expect(modulIdxFromKey("m9")).toBe(8);
  });

  it("maps m5 -> 4", () => {
    expect(modulIdxFromKey("m5")).toBe(4);
  });
});

describe("resolveStufenInfo — happy path", () => {
  it("returns correct entry for m1.stufe=3", () => {
    const info = resolveStufenInfo("m1", 3, mockLookup);
    expect(info.was_es_bedeutet).toBe("m1-s3-bedeutung");
    expect(info.unsere_empfehlung).toBe("m1-s3-empfehlung");
  });

  it("returns correct entry for m2.stufe=5", () => {
    const info = resolveStufenInfo("m2", 5, mockLookup);
    expect(info.was_es_bedeutet).toBe("m2-s5-bedeutung");
    expect(info.unsere_empfehlung).toBe("m2-s5-empfehlung");
  });

  it("returns correct entry for boundary stufe=1", () => {
    const info = resolveStufenInfo("m1", 1, mockLookup);
    expect(info.was_es_bedeutet).toBe("m1-s1-bedeutung");
  });
});

describe("resolveStufenInfo — defensive checks", () => {
  it("throws on stufe=0 (below valid range)", () => {
    expect(() => resolveStufenInfo("m1", 0, mockLookup)).toThrow(
      /invalid stufe 0/,
    );
  });

  it("throws on stufe=6 (above valid range)", () => {
    expect(() => resolveStufenInfo("m1", 6, mockLookup)).toThrow(
      /invalid stufe 6/,
    );
  });

  it("throws on stufe=2.5 (non-integer)", () => {
    expect(() => resolveStufenInfo("m1", 2.5, mockLookup)).toThrow(
      /invalid stufe 2\.5/,
    );
  });

  it("throws on unknown modulKey (lookup missing)", () => {
    expect(() =>
      resolveStufenInfo("m99" as never, 3, mockLookup),
    ).toThrow(/stufen_lookup missing for m99/);
  });

  it("throws when modulKey exists but stufe-entry incomplete (empty was_es_bedeutet)", () => {
    const incomplete: V8StufenLookup = {
      m1: {
        ...mockLookup.m1,
        s3: { was_es_bedeutet: "", unsere_empfehlung: "ok" },
      },
    } as unknown as V8StufenLookup;
    expect(() => resolveStufenInfo("m1", 3, incomplete)).toThrow(
      /missing or incomplete for m1\.s3/,
    );
  });

  it("throws when modulKey exists but stufe-entry incomplete (empty unsere_empfehlung)", () => {
    const incomplete: V8StufenLookup = {
      m1: {
        ...mockLookup.m1,
        s3: { was_es_bedeutet: "ok", unsere_empfehlung: "" },
      },
    } as unknown as V8StufenLookup;
    expect(() => resolveStufenInfo("m1", 3, incomplete)).toThrow(
      /missing or incomplete for m1\.s3/,
    );
  });
});

describe("modulIdxFromKey — defensive", () => {
  it("throws on invalid modulKey", () => {
    expect(() => modulIdxFromKey("m99" as never)).toThrow(
      /invalid modulKey/,
    );
  });
});
