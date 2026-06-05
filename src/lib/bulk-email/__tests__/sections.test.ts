// V9 SLC-167 MT-6 — Vitest fuer Section-Lookup-Helper
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap (FEAT-073)
// Spec MT-6 Verification (L192-197):
//   - Section-Lookup: V4.1-Template-Sections + "Andere..." appended
//   - "Andere..."-Wahl → curated_section enthaelt Free-Text-String
//
// Test-Strategie:
//   - Pure-Function-Vitest via Mock-Store (analog cost-cap.test.ts)
//   - Keine DB-Calls auf Modul-Ebene
//   - 4 Cases:
//     (a) Template hat handbook_schema → Sections + Sentinel
//     (b) Template-ID null → Fallback auf Default-Slug
//     (c) Template ohne handbook_schema → Fallback auf Default-Slug
//     (d) Auch Default-Slug ohne handbook_schema → nur Sentinel
//   - 2 Cases fuer isSentinelSection

import { describe, it, expect } from "vitest";

import {
  DEFAULT_TEMPLATE_SLUG,
  SECTION_OTHER_LABEL,
  SECTION_OTHER_SENTINEL,
  getAvailableSections,
  isSentinelSection,
  type SectionStore,
} from "../sections";

// ────────────────────────────────────────────────────────────────────────────
// Mock-Store
// ────────────────────────────────────────────────────────────────────────────

interface MockStoreOptions {
  byId?: Record<string, Array<{ key: string; title: string }> | null>;
  bySlug?: Record<string, Array<{ key: string; title: string }> | null>;
}

function makeMockStore(opts: MockStoreOptions = {}): SectionStore {
  return {
    async getHandbookSectionsForTemplate(templateId) {
      return opts.byId?.[templateId] ?? null;
    },
    async getHandbookSectionsForSlug(slug) {
      return opts.bySlug?.[slug] ?? null;
    },
  };
}

const EXIT_READINESS_SECTIONS = [
  { key: "geschaeftsmodell_und_markt", title: "Geschaeftsmodell & Markt" },
  { key: "fuehrung_und_organisation", title: "Fuehrung & Organisation" },
  { key: "prozesse_und_ablaeufe", title: "Prozesse & Ablaeufe" },
];

// ────────────────────────────────────────────────────────────────────────────
// getAvailableSections
// ────────────────────────────────────────────────────────────────────────────

describe("getAvailableSections", () => {
  it("Template mit Sections → Sections + Sentinel appended", async () => {
    const store = makeMockStore({
      byId: { "tpl-123": EXIT_READINESS_SECTIONS },
    });
    const result = await getAvailableSections("tenant-1", "tpl-123", store);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      key: "geschaeftsmodell_und_markt",
      label: "Geschaeftsmodell & Markt",
      isOther: false,
    });
    expect(result[3]).toEqual({
      key: SECTION_OTHER_SENTINEL,
      label: SECTION_OTHER_LABEL,
      isOther: true,
    });
  });

  it("templateId=null → Fallback auf Default-Slug exit_readiness", async () => {
    const store = makeMockStore({
      bySlug: { [DEFAULT_TEMPLATE_SLUG]: EXIT_READINESS_SECTIONS },
    });
    const result = await getAvailableSections("tenant-1", null, store);

    expect(result).toHaveLength(4);
    expect(result.map((o) => o.key)).toEqual([
      "geschaeftsmodell_und_markt",
      "fuehrung_und_organisation",
      "prozesse_und_ablaeufe",
      SECTION_OTHER_SENTINEL,
    ]);
  });

  it("Template ohne handbook_schema → Fallback auf Default-Slug", async () => {
    const store = makeMockStore({
      byId: { "tpl-empty": null },
      bySlug: { [DEFAULT_TEMPLATE_SLUG]: EXIT_READINESS_SECTIONS },
    });
    const result = await getAvailableSections("tenant-1", "tpl-empty", store);

    expect(result).toHaveLength(4);
    expect(result[0].key).toBe("geschaeftsmodell_und_markt");
    expect(result[3].isOther).toBe(true);
  });

  it("Template mit leerer Sections-Array → Fallback auf Default-Slug", async () => {
    const store = makeMockStore({
      byId: { "tpl-empty-arr": [] },
      bySlug: { [DEFAULT_TEMPLATE_SLUG]: EXIT_READINESS_SECTIONS },
    });
    const result = await getAvailableSections(
      "tenant-1",
      "tpl-empty-arr",
      store,
    );

    expect(result).toHaveLength(4);
    expect(result[0].key).toBe("geschaeftsmodell_und_markt");
  });

  it("Auch Default-Slug ohne Sections → nur Sentinel", async () => {
    const store = makeMockStore({});
    const result = await getAvailableSections("tenant-1", null, store);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: SECTION_OTHER_SENTINEL,
      label: SECTION_OTHER_LABEL,
      isOther: true,
    });
  });

  it("Sentinel-Option ist immer am Ende, nie in der Mitte", async () => {
    const store = makeMockStore({
      byId: { "tpl-many": EXIT_READINESS_SECTIONS },
    });
    const result = await getAvailableSections("tenant-1", "tpl-many", store);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].isOther).toBe(false);
    }
    expect(result[result.length - 1].isOther).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isSentinelSection
// ────────────────────────────────────────────────────────────────────────────

describe("isSentinelSection", () => {
  it("Sentinel-Wert → true", () => {
    expect(isSentinelSection(SECTION_OTHER_SENTINEL)).toBe(true);
  });

  it("Normaler Section-Key → false", () => {
    expect(isSentinelSection("geschaeftsmodell_und_markt")).toBe(false);
    expect(isSentinelSection("custom-free-text-input")).toBe(false);
    expect(isSentinelSection("")).toBe(false);
  });
});
