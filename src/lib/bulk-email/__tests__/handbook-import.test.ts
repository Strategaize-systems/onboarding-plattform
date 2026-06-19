// V9 SLC-168 MT-1 — Vitest fuer handbook-import.ts (Pure-Function-Layer)
// V9.5 SLC-V9.5-D MT-3 — Curation-Contract-Shift: Mapper-Source ist
//   email_synthesized_unit (mapSynthesizedUnitToKnowledgeUnit), Pseudonym-
//   Lookup ENTFAELLT (DEC-214 / AC-D-2). Attribution via evidence_count +
//   source_pattern_ids (R-D-4).
//
// Spec MT-3 Verification:
//   - mapSynthesizedUnitToKnowledgeUnit liefert valid KnowledgeUnitInsertInput
//     mit allen Pflicht-Feldern — Promotion-TARGET unveraendert (AC-D-1)
//   - body enthaelt Source-Attribution-Markdown-Block OHNE Pseudonym-Zeile
//   - confidence-Tier korrekt aus aggregated_confidence abgeleitet
//
// DB-Tests fuer getOrCreatePseudoBlockCheckpoint + triggerHandbookSnapshot
// laufen im importToHandbook-Integration-Test gegen Coolify-DB.
// Pattern-Konvention identisch zu cost-cap.test.ts (Pure-Function only hier).

import { describe, expect, it } from "vitest";

import {
  mapConfidenceToTier,
  mapSynthesizedUnitToKnowledgeUnit,
  renderSourceAttributionMarkdown,
  type BulkRunForImport,
  type SynthesizedUnitForImport,
} from "../handbook-import";

// ────────────────────────────────────────────────────────────────────────────
// Test-Fixtures
// ────────────────────────────────────────────────────────────────────────────

function makeUnit(
  overrides: Partial<SynthesizedUnitForImport> = {},
): SynthesizedUnitForImport {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Einwand zu teuer souveraen entkraeftet",
    description:
      "Wir reagieren auf den Einwand mit Wertargumentation statt Preisnachlass. Erfolg in 4 von 5 Faellen dokumentiert.",
    evidence_snippets: [],
    themes: ["vertrieb", "einwand-behandlung"],
    aggregated_confidence: 0.9,
    evidence_count: 3,
    source_pattern_ids: [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    ],
    curated_section: "vertrieb/einwand-behandlung",
    ...overrides,
  };
}

const BULK_RUN_BASE: BulkRunForImport = {
  id: "33333333-3333-3333-3333-333333333333",
  tenant_id: "44444444-4444-4444-4444-444444444444",
  capture_session_id: "55555555-5555-5555-5555-555555555555",
  source_file_name: "mailbox-q1-2026.mbox",
};

const CURATOR_USER_ID = "66666666-6666-6666-6666-666666666666";
const BLOCK_CHECKPOINT_ID = "77777777-7777-7777-7777-777777777777";
const EXTRACTED_AT_ISO = "2026-06-05T10:00:00.000Z";

function mapArgs(
  unitOverrides: Partial<SynthesizedUnitForImport> = {},
) {
  return {
    unit: makeUnit(unitOverrides),
    bulkRun: BULK_RUN_BASE,
    captureSessionId: BULK_RUN_BASE.capture_session_id!,
    blockCheckpointId: BLOCK_CHECKPOINT_ID,
    curatorUserId: CURATOR_USER_ID,
    extractedAt: EXTRACTED_AT_ISO,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// mapConfidenceToTier
// ────────────────────────────────────────────────────────────────────────────

describe("mapConfidenceToTier", () => {
  it("returns 'high' for confidence >= 0.85", () => {
    expect(mapConfidenceToTier(1.0)).toBe("high");
    expect(mapConfidenceToTier(0.9)).toBe("high");
    expect(mapConfidenceToTier(0.85)).toBe("high");
  });

  it("returns 'medium' for 0.7 <= confidence < 0.85", () => {
    expect(mapConfidenceToTier(0.8499)).toBe("medium");
    expect(mapConfidenceToTier(0.75)).toBe("medium");
    expect(mapConfidenceToTier(0.7)).toBe("medium");
  });

  it("returns 'low' for confidence < 0.7", () => {
    expect(mapConfidenceToTier(0.6999)).toBe("low");
    expect(mapConfidenceToTier(0.5)).toBe("low");
    expect(mapConfidenceToTier(0.0)).toBe("low");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// renderSourceAttributionMarkdown
// ────────────────────────────────────────────────────────────────────────────

describe("renderSourceAttributionMarkdown", () => {
  it("renders all sections with evidence count (plural)", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-abc",
      sourceFileName: "mailbox.mbox",
      extractedAt: "2026-06-05T10:00:00.000Z",
      confidence: 0.9,
      evidenceCount: 3,
    });
    expect(md).toContain("---");
    expect(md).toContain(
      "**Quelle**: Aus Email-Bulk-Import vom 2026-06-05 (Datei `mailbox.mbox`).",
    );
    expect(md).toContain("**Confidence**: high (raw 0.90)");
    expect(md).toContain(
      "**Belege**: 3 Quell-Patterns. Klarnamen wurden bereits in der Synthese entfernt.",
    );
    expect(md).toContain(
      "**Run-Detail**: [Quelle ansehen](/dashboard/bulk-email-import/run-abc)",
    );
  });

  it("uses singular label for a single evidence pattern", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-def",
      sourceFileName: "x.eml",
      extractedAt: "2026-06-04T08:30:00.000Z",
      confidence: 0.5,
      evidenceCount: 1,
    });
    expect(md).toContain("**Belege**: 1 Quell-Pattern.");
    expect(md).toContain("**Confidence**: low (raw 0.50)");
  });

  it("contains no Pseudonym/Beteiligte line (AC-D-2 — Synthese entfernt P1/P2)", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-ghi",
      sourceFileName: "y.mbox",
      extractedAt: "2026-06-04T08:30:00.000Z",
      confidence: 0.8,
      evidenceCount: 2,
    });
    expect(md).not.toContain("**Pseudonyme**");
    expect(md).not.toContain("Beteiligte:");
  });

  it("uses ISO-date prefix from extractedAt regardless of UTC time component", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-jkl",
      sourceFileName: "y.mbox",
      extractedAt: "2026-12-31T23:59:59.999Z",
      confidence: 0.8,
      evidenceCount: 2,
    });
    expect(md).toContain("vom 2026-12-31");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// mapSynthesizedUnitToKnowledgeUnit
// ────────────────────────────────────────────────────────────────────────────

describe("mapSynthesizedUnitToKnowledgeUnit", () => {
  it("returns all required knowledge_unit-INSERT fields with V9-fixed values (AC-D-1: Target unveraendert)", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(mapArgs());

    expect(result.tenant_id).toBe(BULK_RUN_BASE.tenant_id);
    expect(result.capture_session_id).toBe(BULK_RUN_BASE.capture_session_id);
    expect(result.block_checkpoint_id).toBe(BLOCK_CHECKPOINT_ID);
    expect(result.block_key).toBe("vertrieb/einwand-behandlung");
    expect(result.unit_type).toBe("observation");
    expect(result.source).toBe("email_bulk");
    expect(result.status).toBe("accepted");
    expect(result.title).toBe("Einwand zu teuer souveraen entkraeftet");
    expect(result.confidence).toBe("high");
    expect(result.updated_by).toBe(CURATOR_USER_ID);
  });

  it("attaches Source-Attribution metadata with synthesized_unit_id + source_pattern_ids + evidence_count", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(mapArgs());

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.source_type).toBe("email_bulk");
    expect(result.metadata?.bulk_run_id).toBe(BULK_RUN_BASE.id);
    expect(result.metadata?.synthesized_unit_id).toBe(makeUnit().id);
    expect(result.metadata?.source_pattern_ids).toEqual(
      makeUnit().source_pattern_ids,
    );
    expect(result.metadata?.evidence_count).toBe(3);
    expect(result.metadata?.confidence_raw).toBe(0.9);
    expect(result.metadata?.extracted_at).toBe(EXTRACTED_AT_ISO);
  });

  it("defaults metadata.source_pattern_ids to [] when null (R-D-4: keine leeren Felder)", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({ source_pattern_ids: null }),
    );
    expect(result.metadata?.source_pattern_ids).toEqual([]);
  });

  it("propagates themes 1:1 to knowledge_unit.themes (V9.8 AC-A-2 / DEC-228)", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({ themes: ["pricing", "prozesse", "fuehrung"] }),
    );
    expect(result.themes).toEqual(["pricing", "prozesse", "fuehrung"]);
  });

  it("defaults themes to [] when unit.themes is null (AC-A-2: null/leer → '{}')", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(mapArgs({ themes: null }));
    expect(result.themes).toEqual([]);
  });

  it("preserves theme order (Reihenfolge erhalten, AC-A-2)", () => {
    const ordered = ["z-thema", "a-thema", "m-thema"];
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({ themes: ordered }),
    );
    expect(result.themes).toEqual(ordered);
  });

  it("renders body with original description + Source-Attribution Markdown block (no pseudonyms)", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({
        description:
          "Wir entkraeften den Einwand 'zu teuer' mit Wertargumentation.",
      }),
    );

    expect(
      result.body.startsWith(
        "Wir entkraeften den Einwand 'zu teuer' mit Wertargumentation.",
      ),
    ).toBe(true);
    expect(result.body).toContain("\n---\n");
    expect(result.body).toContain(
      "**Quelle**: Aus Email-Bulk-Import vom 2026-06-05",
    );
    expect(result.body).toContain("**Belege**: 3 Quell-Patterns.");
    expect(result.body).not.toContain("**Pseudonyme**");
    expect(result.body).toContain(
      `[Quelle ansehen](/dashboard/bulk-email-import/${BULK_RUN_BASE.id})`,
    );
  });

  it("throws when curated_section is null (Section ist Pflicht bei accept/edit)", () => {
    expect(() =>
      mapSynthesizedUnitToKnowledgeUnit(mapArgs({ curated_section: null })),
    ).toThrow(/curated_section/);
  });

  it("throws when curated_section is whitespace-only", () => {
    expect(() =>
      mapSynthesizedUnitToKnowledgeUnit(mapArgs({ curated_section: "   " })),
    ).toThrow(/curated_section/);
  });

  it("preserves evidence_snippets when provided as array (knowledge_unit.evidence_refs)", () => {
    const snippets = [
      { text: "snippet a", source_pattern_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      { text: "snippet b", source_pattern_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    ];
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({ evidence_snippets: snippets }),
    );

    expect(result.evidence_refs).toEqual(snippets);
  });

  it("defaults evidence_refs to [] when unit.evidence_snippets is null", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({ evidence_snippets: null }),
    );

    expect(result.evidence_refs).toEqual([]);
  });

  it("trims whitespace from title and description before persisting", () => {
    const result = mapSynthesizedUnitToKnowledgeUnit(
      mapArgs({
        title: "  Padded Title  ",
        description: "  Padded description.  ",
      }),
    );

    expect(result.title).toBe("Padded Title");
    expect(result.body.startsWith("Padded description.")).toBe(true);
  });
});
