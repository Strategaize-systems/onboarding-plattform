// V9 SLC-168 MT-1 — Vitest fuer handbook-import.ts (Pure-Function-Layer)
//
// Slice: SLC-168 — V9 Handbuch-Integration + Audit + Source-Attribution-View
// Spec MT-1 Verification:
//   - mapPatternToKnowledgeUnit liefert valid KnowledgeUnitInsertInput mit
//     allen Pflicht-Feldern
//   - body enthaelt Source-Attribution-Markdown-Block
//   - confidence-Tier korrekt aus numerischer Confidence abgeleitet
//
// Test-Strategie:
//   - mapConfidenceToTier: Schwellen-Tests (3 Klassen + Boundary)
//   - renderSourceAttributionMarkdown: 3 Varianten
//   - mapPatternToKnowledgeUnit: Pflicht-Felder + body-Struktur + Edge-Cases
//
// DB-Tests fuer getOrCreatePseudoBlockCheckpoint + triggerHandbookSnapshot
// laufen in MT-2 importToHandbook-Integration-Test gegen Coolify-DB
// (End-to-End-Test schlaegt 2 Fliegen + spart Test-Setup-Duplikation).
// Pattern-Konvention identisch zu cost-cap.test.ts (Pure-Function only hier).

import { describe, expect, it } from "vitest";

import {
  mapConfidenceToTier,
  mapPatternToKnowledgeUnit,
  renderSourceAttributionMarkdown,
  type BulkRunForImport,
  type PatternForImport,
} from "../handbook-import";

// ────────────────────────────────────────────────────────────────────────────
// Test-Fixtures
// ────────────────────────────────────────────────────────────────────────────

function makePattern(
  overrides: Partial<PatternForImport> = {},
): PatternForImport {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    thread_id: "22222222-2222-2222-2222-222222222222",
    title: "Einwand zu teuer souveraen entkraeftet",
    description:
      "GF reagiert auf Einwand mit Wertargumentation statt Preisnachlass. Erfolg in 4 von 5 Faellen dokumentiert.",
    evidence_snippets: [],
    confidence: 0.9,
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
  it("renders all sections with pseudonyms when provided", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-abc",
      sourceFileName: "mailbox.mbox",
      extractedAt: "2026-06-05T10:00:00.000Z",
      confidence: 0.9,
      participantPseudonyms: { p1: "Person A", p2: "Person B" },
    });
    expect(md).toContain("---");
    expect(md).toContain(
      "**Quelle**: Aus Email-Bulk-Import vom 2026-06-05 (Datei `mailbox.mbox`).",
    );
    expect(md).toContain("**Confidence**: high (raw 0.90)");
    expect(md).toContain("Beteiligte: Person A | Person B.");
    expect(md).toContain(
      "**Run-Detail**: [Quelle ansehen](/dashboard/bulk-email-import/run-abc)",
    );
  });

  it("falls back to generic Pseudonym-Hinweis when no pseudonyms provided", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-def",
      sourceFileName: "x.eml",
      extractedAt: "2026-06-04T08:30:00.000Z",
      confidence: 0.5,
    });
    expect(md).toContain("**Pseudonyme**: Klarnamen wurden pseudonymisiert.");
    expect(md).not.toContain("Beteiligte:");
    expect(md).toContain("**Confidence**: low (raw 0.50)");
  });

  it("falls back to generic Pseudonym-Hinweis when pseudonym values are empty strings", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-ghi",
      sourceFileName: "y.mbox",
      extractedAt: "2026-06-04T08:30:00.000Z",
      confidence: 0.8,
      participantPseudonyms: { p1: "", p2: "" },
    });
    expect(md).toContain("**Pseudonyme**: Klarnamen wurden pseudonymisiert.");
    expect(md).not.toContain("Beteiligte:");
  });

  it("uses ISO-date prefix from extractedAt regardless of UTC time component", () => {
    const md = renderSourceAttributionMarkdown({
      bulkRunId: "run-jkl",
      sourceFileName: "y.mbox",
      extractedAt: "2026-12-31T23:59:59.999Z",
      confidence: 0.8,
    });
    expect(md).toContain("vom 2026-12-31");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// mapPatternToKnowledgeUnit
// ────────────────────────────────────────────────────────────────────────────

describe("mapPatternToKnowledgeUnit", () => {
  it("returns all required knowledge_unit-INSERT fields with V9-fixed values", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern(),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
      participantPseudonyms: { p1: "Person A" },
    });

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

  it("attaches Source-Attribution metadata with bulk_run_id + pattern_id + thread_id + pseudonyms", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern(),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
      participantPseudonyms: { p1: "Person A", p2: "Person B" },
    });

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.source_type).toBe("email_bulk");
    expect(result.metadata?.bulk_run_id).toBe(BULK_RUN_BASE.id);
    expect(result.metadata?.pattern_id).toBe(makePattern().id);
    expect(result.metadata?.thread_id).toBe(makePattern().thread_id);
    expect(result.metadata?.participant_pseudonyms).toEqual({
      p1: "Person A",
      p2: "Person B",
    });
    expect(result.metadata?.confidence_raw).toBe(0.9);
    expect(result.metadata?.extracted_at).toBe(EXTRACTED_AT_ISO);
  });

  it("omits participant_pseudonyms in metadata when not provided", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern(),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
    });

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.participant_pseudonyms).toBeUndefined();
  });

  it("renders body with original description + Source-Attribution Markdown block", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern({
        description: "Pattern: Einwand 'zu teuer' wird mit Wertargumentation entkraeftet.",
      }),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
    });

    expect(
      result.body.startsWith(
        "Pattern: Einwand 'zu teuer' wird mit Wertargumentation entkraeftet.",
      ),
    ).toBe(true);
    expect(result.body).toContain("\n---\n");
    expect(result.body).toContain(
      "**Quelle**: Aus Email-Bulk-Import vom 2026-06-05",
    );
    expect(result.body).toContain(
      `[Quelle ansehen](/dashboard/bulk-email-import/${BULK_RUN_BASE.id})`,
    );
  });

  it("throws when curated_section is null (Section ist Pflicht bei accept/edit)", () => {
    expect(() =>
      mapPatternToKnowledgeUnit({
        pattern: makePattern({ curated_section: null }),
        bulkRun: BULK_RUN_BASE,
        captureSessionId: BULK_RUN_BASE.capture_session_id!,
        blockCheckpointId: BLOCK_CHECKPOINT_ID,
        curatorUserId: CURATOR_USER_ID,
        extractedAt: EXTRACTED_AT_ISO,
      }),
    ).toThrow(/curated_section/);
  });

  it("throws when curated_section is whitespace-only", () => {
    expect(() =>
      mapPatternToKnowledgeUnit({
        pattern: makePattern({ curated_section: "   " }),
        bulkRun: BULK_RUN_BASE,
        captureSessionId: BULK_RUN_BASE.capture_session_id!,
        blockCheckpointId: BLOCK_CHECKPOINT_ID,
        curatorUserId: CURATOR_USER_ID,
        extractedAt: EXTRACTED_AT_ISO,
      }),
    ).toThrow(/curated_section/);
  });

  it("preserves evidence_snippets when provided as array (knowledge_unit.evidence_refs)", () => {
    const snippets = [
      { idx: 0, text: "snippet a" },
      { idx: 1, text: "snippet b" },
    ];
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern({ evidence_snippets: snippets }),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
    });

    expect(result.evidence_refs).toEqual(snippets);
  });

  it("defaults evidence_refs to [] when pattern.evidence_snippets is null", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern({ evidence_snippets: null }),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
    });

    expect(result.evidence_refs).toEqual([]);
  });

  it("trims whitespace from title and description before persisting", () => {
    const result = mapPatternToKnowledgeUnit({
      pattern: makePattern({
        title: "  Padded Title  ",
        description: "  Padded description.  ",
      }),
      bulkRun: BULK_RUN_BASE,
      captureSessionId: BULK_RUN_BASE.capture_session_id!,
      blockCheckpointId: BLOCK_CHECKPOINT_ID,
      curatorUserId: CURATOR_USER_ID,
      extractedAt: EXTRACTED_AT_ISO,
    });

    expect(result.title).toBe("Padded Title");
    expect(result.body.startsWith("Padded description.")).toBe(true);
  });
});
