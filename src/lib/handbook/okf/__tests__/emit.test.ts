// SLC-V9.7-A — OKF Concept-Emitter Tests (TDD).
//
// MT-1: Pure-Helper (Mapper, Frontmatter-Serializer, Pfad-Bildung).
// MT-2..4: emitKnowledgeUnitConcept / emitDiagnosisConcept / emitSopConcept.

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  conceptFilename,
  emitDiagnosisConcept,
  emitKnowledgeUnitConcept,
  emitSopConcept,
  firstSentence,
  mapConfidence,
  mapCurationStatus,
  mapUnitTypeToOkf,
  serializeConcept,
  serializeFrontmatter,
} from "../emit";
import type {
  DiagnosisInput,
  KnowledgeUnitInput,
  OkfConcept,
  OkfEmitContext,
  OkfFrontmatter,
  SopInput,
} from "../types";

const CTX: OkfEmitContext = { tenantId: "tenant-abc" };

function makeKnowledgeUnit(
  overrides: Partial<KnowledgeUnitInput> = {},
): KnowledgeUnitInput {
  return {
    id: "11112222-3333-4444-5555-666677778888",
    block_key: "a_zielgruppe",
    unit_type: "finding",
    title: "Zielgruppe ist B2B",
    body: "Der Kunde fokussiert auf B2B. Das ergibt sich aus dem Gespraech.",
    confidence: "high",
    status: "accepted",
    evidence_refs: [
      { recorded_by_user_id: "user-secret-1", walkthrough_session_id: "wt-1" },
      { recorded_by_user_id: "user-secret-2", walkthrough_session_id: "wt-2" },
    ],
    updated_at: "2026-06-15T14:25:00Z",
    ...overrides,
  };
}

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

describe("emitKnowledgeUnitConcept", () => {
  it("produces full profile frontmatter from a finding row", () => {
    const concept = emitKnowledgeUnitConcept(makeKnowledgeUnit(), CTX);
    expect(concept.type).toBe("finding");
    expect(concept.sourceTable).toBe("knowledge_unit");
    expect(concept.blockKey).toBe("a_zielgruppe");
    expect(concept.sectionKey).toBe("a_zielgruppe");
    expect(concept.frontmatter).toEqual({
      type: "finding",
      title: "Zielgruppe ist B2B",
      description: "Der Kunde fokussiert auf B2B.",
      timestamp: "2026-06-15T14:25:00Z",
      strategaize_source: "op",
      strategaize_tenant: "tenant-abc",
      confidence: "high",
      curation_status: "accepted",
      evidence_count: 2,
      strategaize_id: "11112222-3333-4444-5555-666677778888",
    });
  });

  it("maps an ai_draft row to type observation", () => {
    const concept = emitKnowledgeUnitConcept(
      makeKnowledgeUnit({ unit_type: "ai_draft" }),
      CTX,
    );
    expect(concept.type).toBe("observation");
    expect(concept.frontmatter.type).toBe("observation");
  });

  it("builds a deterministic section-scoped path", () => {
    const concept = emitKnowledgeUnitConcept(makeKnowledgeUnit(), CTX);
    expect(concept.path).toBe(
      "a_zielgruppe/finding-zielgruppe-ist-b2b-11112222.md",
    );
  });

  it("DSGVO: evidence_refs raw values never appear in output, only the count (DEC-223)", () => {
    const concept = emitKnowledgeUnitConcept(makeKnowledgeUnit(), CTX);
    const { content } = serializeConcept(concept);
    expect(content).not.toMatch(/user-secret-1/);
    expect(content).not.toMatch(/walkthrough_session_id/);
    expect(content).not.toMatch(/recorded_by_user_id/);
    expect(content).not.toMatch(/evidence_refs/);
    expect(concept.frontmatter.evidence_count).toBe(2);
  });

  it("treats null evidence_refs as evidence_count 0", () => {
    const concept = emitKnowledgeUnitConcept(
      makeKnowledgeUnit({ evidence_refs: null }),
      CTX,
    );
    expect(concept.frontmatter.evidence_count).toBe(0);
  });

  it("emits no tags key (DEC-224) and a parseable, non-empty type (SC-V9.7-1)", () => {
    const concept = emitKnowledgeUnitConcept(makeKnowledgeUnit(), CTX);
    const { content } = serializeConcept(concept);
    const fm = parseYaml(content.split("---\n")[1]);
    expect(content).not.toMatch(/^tags:/m);
    expect(fm.type).toBe("finding");
    expect(String(fm.type).length).toBeGreaterThan(0);
  });

  it("falls back to the title for description when body is empty (R-A-1)", () => {
    const concept = emitKnowledgeUnitConcept(
      makeKnowledgeUnit({ body: "" }),
      CTX,
    );
    expect(concept.frontmatter.description).toBe("Zielgruppe ist B2B");
  });
});

function makeDiagnosis(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    id: "aaaabbbb-cccc-dddd-eeee-ffff00001111",
    block_key: "a_zielgruppe",
    status: "confirmed",
    updated_at: "2026-06-15T10:00:00Z",
    content: {
      block_key: "a_zielgruppe",
      subtopics: [
        {
          key: "a1_zielgruppe",
          name: "Zielgruppe",
          fields: { segment: "B2B", region: "DACH" },
        },
        {
          key: "a2_value_proposition",
          name: "Value Proposition",
          fields: { kern: "Zeitersparnis" },
        },
        { key: "a3_pricing", name: "Pricing", fields: {} },
      ],
    },
    ...overrides,
  };
}

describe("emitDiagnosisConcept", () => {
  it("produces exactly one diagnosis concept per row (DEC-222)", () => {
    const concept = emitDiagnosisConcept(makeDiagnosis(), CTX);
    expect(concept.type).toBe("diagnosis");
    expect(concept.sourceTable).toBe("block_diagnosis");
    expect(concept.frontmatter).toEqual({
      type: "diagnosis",
      title: "Diagnose: a_zielgruppe",
      timestamp: "2026-06-15T10:00:00Z",
      strategaize_source: "op",
      strategaize_tenant: "tenant-abc",
      curation_status: "accepted",
      strategaize_id: "aaaabbbb-cccc-dddd-eeee-ffff00001111",
    });
  });

  it("has no confidence (column absent)", () => {
    const concept = emitDiagnosisConcept(makeDiagnosis(), CTX);
    expect(concept.frontmatter.confidence).toBeUndefined();
  });

  it("renders subtopics as ## subsections with field bullet lists", () => {
    const concept = emitDiagnosisConcept(makeDiagnosis(), CTX);
    expect(concept.body).toContain("## Zielgruppe");
    expect(concept.body).toContain("- **segment:** B2B");
    expect(concept.body).toContain("- **region:** DACH");
    expect(concept.body).toContain("## Value Proposition");
    expect(concept.body).toContain("- **kern:** Zeitersparnis");
    expect(concept.body).toContain("## Pricing");
  });

  it("produces a parseable, deterministic path and frontmatter", () => {
    const concept = emitDiagnosisConcept(makeDiagnosis(), CTX);
    expect(concept.path).toBe(
      "a_zielgruppe/diagnosis-diagnose-a_zielgruppe-aaaabbbb.md",
    );
    const { content } = serializeConcept(concept);
    expect(parseYaml(content.split("---\n")[1]).type).toBe("diagnosis");
  });

  it("falls back to row.block_key when content.block_key missing and tolerates no subtopics", () => {
    const concept = emitDiagnosisConcept(
      makeDiagnosis({ content: {} }),
      CTX,
    );
    expect(concept.frontmatter.title).toBe("Diagnose: a_zielgruppe");
    expect(() => serializeConcept(concept)).not.toThrow();
  });
});

function makeSop(overrides: Partial<SopInput> = {}): SopInput {
  return {
    id: "99998888-7777-6666-5555-444433332222",
    block_key: "f_prozesse",
    updated_at: "2026-06-15T09:30:00Z",
    content: {
      title: "Onboarding-Prozess",
      objective: "Neue Mitarbeiter strukturiert einarbeiten.",
      steps: [
        {
          number: 1,
          action: "Arbeitsplatz vorbereiten",
          responsible: "IT",
          timeframe: "Tag 1",
          success_criterion: "Laptop einsatzbereit",
        },
        {
          number: 2,
          action: "Einfuehrungsgespraech",
          responsible: "Teamlead",
        },
      ],
    },
    ...overrides,
  };
}

describe("emitSopConcept", () => {
  it("produces sop frontmatter without confidence/curation_status", () => {
    const concept = emitSopConcept(makeSop(), CTX);
    expect(concept.type).toBe("sop");
    expect(concept.sourceTable).toBe("sop");
    expect(concept.frontmatter).toEqual({
      type: "sop",
      title: "Onboarding-Prozess",
      description: "Neue Mitarbeiter strukturiert einarbeiten.",
      timestamp: "2026-06-15T09:30:00Z",
      strategaize_source: "op",
      strategaize_tenant: "tenant-abc",
      strategaize_id: "99998888-7777-6666-5555-444433332222",
    });
  });

  it("renders generator-format steps in order, action before title", () => {
    const concept = emitSopConcept(makeSop(), CTX);
    const idxFirst = concept.body.indexOf("Arbeitsplatz vorbereiten");
    const idxSecond = concept.body.indexOf("Einfuehrungsgespraech");
    expect(idxFirst).toBeGreaterThan(-1);
    expect(idxSecond).toBeGreaterThan(idxFirst);
    expect(concept.body).toContain("1. Arbeitsplatz vorbereiten");
    expect(concept.body).toContain("Verantwortlich: IT");
    expect(concept.body).toContain("Erfolgskriterium: Laptop einsatzbereit");
  });

  it("renders legacy-format steps (title + detail)", () => {
    const concept = emitSopConcept(
      makeSop({
        content: {
          title: "Legacy SOP",
          objective: "Ziel.",
          steps: [
            { title: "Schritt A", detail: "Mach A zuerst." },
            { title: "Schritt B" },
          ],
        },
      }),
      CTX,
    );
    expect(concept.body).toContain("1. Schritt A");
    expect(concept.body).toContain("Mach A zuerst.");
    expect(concept.body).toContain("2. Schritt B");
  });

  it("falls back to SOP: <block_key> when content.title missing", () => {
    const concept = emitSopConcept(
      makeSop({ content: { objective: "Ziel.", steps: [] } }),
      CTX,
    );
    expect(concept.frontmatter.title).toBe("SOP: f_prozesse");
    expect(concept.frontmatter.description).toBe("Ziel.");
  });

  it("produces a deterministic path and parseable frontmatter", () => {
    const concept = emitSopConcept(makeSop(), CTX);
    expect(concept.path).toBe("f_prozesse/sop-onboarding-prozess-99998888.md");
    const { content } = serializeConcept(concept);
    expect(parseYaml(content.split("---\n")[1]).type).toBe("sop");
  });
});
