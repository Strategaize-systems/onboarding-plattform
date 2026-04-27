// SLC-039 MT-4 — INDEX-Builder Tests

import { describe, expect, it } from "vitest";
import { buildIndexMarkdown } from "../index-builder";
import { buildSectionFileMap } from "../sections";
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

describe("buildIndexMarkdown", () => {
  it("schreibt H1 mit Tenant-Name", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      tenantName: "ACME GmbH",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("# Unternehmerhandbuch — ACME GmbH");
  });

  it("schreibt UTC-Zeitstempel deterministisch", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("2026-04-27 08:00 UTC");
  });

  it("listet Sections mit Order-Praefix + Markdown-Link", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("1. [Alpha](01_alpha.md)");
    expect(md).toContain("2. [Beta](02_beta.md)");
  });

  it("nutzt Fallback 'Tenant' bei leerem Namen", () => {
    const md = buildIndexMarkdown({
      sections: SECTIONS,
      sectionFileMap: buildSectionFileMap(SECTIONS),
      tenantName: "",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("# Unternehmerhandbuch — Tenant");
  });

  it("rendert Platzhalter bei leerer Section-Liste", () => {
    const md = buildIndexMarkdown({
      sections: [],
      sectionFileMap: {},
      tenantName: "X",
      generatedAt: FIXED_DATE,
    });
    expect(md).toContain("keine Abschnitte");
  });
});
