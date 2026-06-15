// SLC-V9.7-A — OKF Concept-Emitter Tests (TDD).
//
// MT-1: Pure-Helper (Mapper, Frontmatter-Serializer, Pfad-Bildung).
// MT-2..4: emitKnowledgeUnitConcept / emitDiagnosisConcept / emitSopConcept.

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  conceptFilename,
  firstSentence,
  mapConfidence,
  mapCurationStatus,
  mapUnitTypeToOkf,
  serializeConcept,
  serializeFrontmatter,
} from "../emit";
import type { OkfConcept, OkfFrontmatter } from "../types";

describe("mapUnitTypeToOkf", () => {
  it("passes through finding/risk/action/observation 1:1", () => {
    expect(mapUnitTypeToOkf("finding")).toBe("finding");
    expect(mapUnitTypeToOkf("risk")).toBe("risk");
    expect(mapUnitTypeToOkf("action")).toBe("action");
    expect(mapUnitTypeToOkf("observation")).toBe("observation");
  });

  it("maps ai_draft -> observation (DEC-224)", () => {
    expect(mapUnitTypeToOkf("ai_draft")).toBe("observation");
  });

  it("throws on unknown unit_type", () => {
    expect(() => mapUnitTypeToOkf("nonsense")).toThrow(/unknown unit_type/i);
  });
});

describe("mapConfidence", () => {
  it("passes through low/medium/high (DEC-224, no numeric mapping)", () => {
    expect(mapConfidence("low")).toBe("low");
    expect(mapConfidence("medium")).toBe("medium");
    expect(mapConfidence("high")).toBe("high");
  });

  it("rejects numeric/unknown confidence values", () => {
    expect(() => mapConfidence("0.9")).toThrow(/confidence/i);
    expect(() => mapConfidence("very-high")).toThrow(/confidence/i);
  });
});

describe("mapCurationStatus", () => {
  it("passes through proposed/accepted/edited 1:1", () => {
    expect(mapCurationStatus("proposed")).toBe("proposed");
    expect(mapCurationStatus("accepted")).toBe("accepted");
    expect(mapCurationStatus("edited")).toBe("edited");
  });

  it("throws on unknown status", () => {
    expect(() => mapCurationStatus("archived")).toThrow(/status/i);
  });
});

describe("firstSentence", () => {
  it("returns the first sentence up to a terminator", () => {
    expect(firstSentence("Hello world. Second one.", "fb")).toBe("Hello world.");
    expect(firstSentence("Frage? Antwort.", "fb")).toBe("Frage?");
  });

  it("falls back to title for empty/whitespace body (R-A-1)", () => {
    expect(firstSentence("", "Fallback title")).toBe("Fallback title");
    expect(firstSentence("   \n  ", "Fallback title")).toBe("Fallback title");
  });

  it("uses the first line when there is no sentence terminator", () => {
    expect(firstSentence("Eine Zeile ohne Punkt\nzweite Zeile", "fb")).toBe(
      "Eine Zeile ohne Punkt",
    );
  });
});

describe("serializeFrontmatter", () => {
  const fm: OkfFrontmatter = {
    type: "finding",
    title: "Titel",
    description: "Eine Beschreibung.",
    timestamp: "2026-06-15T14:25:00Z",
    strategaize_source: "op",
    strategaize_tenant: "tenant-123",
    confidence: "high",
    curation_status: "accepted",
    evidence_count: 2,
    strategaize_id: "abcdef12-3456-7890-abcd-ef1234567890",
  };

  it("produces a deterministic key order", () => {
    const out = serializeFrontmatter(fm);
    const keysInOrder = out
      .split("\n")
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(keysInOrder).toEqual([
      "type",
      "title",
      "description",
      "timestamp",
      "strategaize_source",
      "strategaize_tenant",
      "confidence",
      "curation_status",
      "evidence_count",
      "strategaize_id",
    ]);
  });

  it("omits undefined optional fields", () => {
    const minimal: OkfFrontmatter = {
      type: "sop",
      title: "Nur Pflicht",
      strategaize_source: "op",
      strategaize_tenant: "t1",
      strategaize_id: "id1",
    };
    const out = serializeFrontmatter(minimal);
    expect(out).not.toMatch(/confidence/);
    expect(out).not.toMatch(/curation_status/);
    expect(out).not.toMatch(/description/);
    expect(out).not.toMatch(/tags/);
  });

  it("round-trips via yaml.parse", () => {
    const parsed = parseYaml(serializeFrontmatter(fm));
    expect(parsed).toEqual(fm);
  });
});

describe("conceptFilename", () => {
  it("builds <type>-<slug>-<id8>.md", () => {
    expect(
      conceptFilename("finding", "Zielgruppe ist B2B", "abcdef12-3456-7890"),
    ).toBe("finding-zielgruppe-ist-b2b-abcdef12.md");
  });

  it("slices the id to 8 chars", () => {
    const name = conceptFilename("sop", "Onboarding", "1234567890abcdef");
    expect(name).toBe("sop-onboarding-12345678.md");
  });
});

describe("serializeConcept", () => {
  const concept: OkfConcept = {
    type: "finding",
    frontmatter: {
      type: "finding",
      title: "Titel",
      strategaize_source: "op",
      strategaize_tenant: "t1",
      strategaize_id: "id1",
    },
    body: "Der Body-Text.",
    blockKey: "a_zielgruppe",
    sourceTable: "knowledge_unit",
    sectionKey: "a_zielgruppe",
    path: "a_zielgruppe/finding-titel-id1.md",
  };

  it("wraps frontmatter in --- fences followed by the body", () => {
    const { path, content } = serializeConcept(concept);
    expect(path).toBe("a_zielgruppe/finding-titel-id1.md");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain("\n---\n\n");
    expect(content.trimEnd().endsWith("Der Body-Text.")).toBe(true);
  });

  it("round-trips the frontmatter block via yaml.parse", () => {
    const { content } = serializeConcept(concept);
    const fmBlock = content.split("---\n")[1];
    expect(parseYaml(fmBlock)).toEqual(concept.frontmatter);
  });
});
