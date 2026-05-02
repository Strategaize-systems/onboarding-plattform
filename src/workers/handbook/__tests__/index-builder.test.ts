// SLC-039 MT-4 — INDEX-Builder Tests
// SLC-052 MT-2 — TOC-Links sind jetzt In-App-Anchors `#section-{slug}`.

import { describe, expect, it } from "vitest";
import { buildIndexMarkdown } from "../index-builder";
import { buildSectionAnchorMap, buildSectionFileMap } from "../sections";
import type { HandbookSection } from "../types";

const FIXED_DATE = new Date("2026-04-27T08:00:00Z");

const SECTIONS: HandbookSection[] = [
  {
    key: "alpha",
    title: "Alpha",
    order: 1,
    sources: [],
    render: { subsections_by: "block_key" },
  },
  {
    key: "beta",
    title: "Beta",
    order: 2,
    sources: [],
    render: { subsections_by: "block_key" },
  },
];

const MULTIWORD_SECTIONS: HandbookSection[] = [
  {
    key: "operatives",
    title: "Operatives Tagesgeschaeft",
    order: 1,
    sources: [],
    render: { subsections_by: "block_key" },
  },
];

describe("buildIndexMarkdown", () => {
  it("schreibt H1 mit Tenant-Name", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      sectionAnchorMap: buildSectionAnchorMap(SECTIONS),
      tenantName: "ACME GmbH",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("# Unternehmerhandbuch — ACME GmbH");
  });

  it("schreibt UTC-Zeitstempel deterministisch", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      sectionAnchorMap: buildSectionAnchorMap(SECTIONS),
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("2026-04-27 08:00 UTC");
  });

  it("listet Sections mit Order-Praefix + In-App-Anchor (SLC-052 MT-2)", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      sectionAnchorMap: buildSectionAnchorMap(SECTIONS),
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("1. [Alpha](#section-alpha)");
    expect(md).toContain("2. [Beta](#section-beta)");
    // Garantie: keine alten Datei-Pfade mehr im TOC.
    expect(md).not.toContain("01_alpha.md");
    expect(md).not.toContain("02_beta.md");
  });

  it("slug aus section.title (nicht section.key) — Multiword-Title", () => {
    const md = buildIndexMarkdown({
      sections: MULTIWORD_SECTIONS,
      sectionFileMap: buildSectionFileMap(MULTIWORD_SECTIONS),
      sectionAnchorMap: buildSectionAnchorMap(MULTIWORD_SECTIONS),
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    // Title "Operatives Tagesgeschaeft" -> slug "operatives-tagesgeschaeft".
    // section.key "operatives" wuerde abweichen — wir nutzen den Title-Slug.
    expect(md).toContain("[Operatives Tagesgeschaeft](#section-operatives-tagesgeschaeft)");
  });

  it("nutzt Fallback 'Tenant' bei leerem Namen", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      sectionAnchorMap: buildSectionAnchorMap(SECTIONS),
      tenantName: "",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("# Unternehmerhandbuch — Tenant");
  });

  it("rendert Platzhalter bei leerer Section-Liste", () => {
    const md = buildIndexMarkdown({
      sections: [],
      sectionFileMap: {},
      sectionAnchorMap: {},
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("keine Abschnitte");
  });
});
