import { describe, it, expect } from "vitest";

import {
  isValidModulKey,
  modulKeyToSlug,
  modulBasePath,
  splitBlocksByStufe,
} from "../modul-capture";
import type { TemplateBlock } from "@/lib/db/template-queries";

function block(
  key: string,
  order: number,
  required: boolean,
  questions = 1
): TemplateBlock {
  return {
    id: `id-${key}`,
    key,
    title: { de: `Block ${key}`, en: `Block ${key}` },
    order,
    required,
    weight: 1,
    questions: Array.from({ length: questions }, (_, i) => ({
      id: `${key}-q${i}`,
      frage_id: `F-${key}-${i}`,
      text: `Frage ${i}`,
      ebene: required ? "Kern" : "Workspace",
      unterbereich: "x",
      position: i,
      owner_dependency: false,
      deal_blocker: false,
      sop_trigger: false,
      ko_hart: false,
      ko_soft: false,
    })),
  } satisfies TemplateBlock;
}

describe("isValidModulKey", () => {
  it("akzeptiert m + zwei Ziffern", () => {
    expect(isValidModulKey("m04")).toBe(true);
    expect(isValidModulKey("m06")).toBe(true);
    expect(isValidModulKey("m42")).toBe(true);
  });

  it("lehnt alles andere ab", () => {
    expect(isValidModulKey("m4")).toBe(false);
    expect(isValidModulKey("m004")).toBe(false);
    expect(isValidModulKey("M04")).toBe(false);
    expect(isValidModulKey("blueprint")).toBe(false);
    expect(isValidModulKey("../m04")).toBe(false);
    expect(isValidModulKey("")).toBe(false);
  });
});

describe("modulKeyToSlug", () => {
  it("baut den Seed-Slug", () => {
    expect(modulKeyToSlug("m04")).toBe("stb_modul_m04");
    expect(modulKeyToSlug("m06")).toBe("stb_modul_m06");
  });
});

describe("modulBasePath", () => {
  it("baut den Route-Praefix fuer die Wizard-Reuse (basePath)", () => {
    expect(modulBasePath("m04")).toBe("/dashboard/stb/modul/m04");
  });
});

describe("splitBlocksByStufe", () => {
  it("trennt Pflicht (Stufe-1) von optional (Stufe-2), nach order sortiert", () => {
    // M-04-Shape: stufe1_kern (required) + stufe2_vertiefung (optional)
    const blocks = [
      block("stufe2_vertiefung", 2, false, 16),
      block("stufe1_kern", 1, true, 10),
    ];
    const { stufe1, stufe2 } = splitBlocksByStufe(blocks);

    expect(stufe1.map((b) => b.key)).toEqual(["stufe1_kern"]);
    expect(stufe2.map((b) => b.key)).toEqual(["stufe2_vertiefung"]);
    expect(stufe1[0].questions).toHaveLength(10);
    expect(stufe2[0].questions).toHaveLength(16);
  });

  it("behandelt fehlendes required als optional (Stufe-2)", () => {
    const b = block("x", 1, false);
    // required explizit entfernen -> default-optional
    delete (b as { required?: boolean }).required;
    const { stufe1, stufe2 } = splitBlocksByStufe([b]);
    expect(stufe1).toHaveLength(0);
    expect(stufe2).toHaveLength(1);
  });

  it("sortiert mehrere Bloecke je Stufe nach order", () => {
    const blocks = [
      block("k2", 3, true),
      block("k1", 1, true),
      block("v2", 4, false),
      block("v1", 2, false),
    ];
    const { stufe1, stufe2 } = splitBlocksByStufe(blocks);
    expect(stufe1.map((b) => b.key)).toEqual(["k1", "k2"]);
    expect(stufe2.map((b) => b.key)).toEqual(["v1", "v2"]);
  });

  it("mutiert das Eingabe-Array nicht", () => {
    const blocks = [block("b", 2, true), block("a", 1, false)];
    const snapshot = blocks.map((b) => b.key);
    splitBlocksByStufe(blocks);
    expect(blocks.map((b) => b.key)).toEqual(snapshot);
  });
});
