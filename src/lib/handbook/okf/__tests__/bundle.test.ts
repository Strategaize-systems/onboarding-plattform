// SLC-V9.7-B MT-2 — OKF-Bundle-Assembly Tests.
//
// Verifiziert root index.md (Frontmatter + Section-Gruppierung), log.md-Eintrag,
// Cross-Link-Injektion (bundle-root-absolut + aufloesbar, R-B-3) und die
// Integration MT-1<->MT-2 (assembliertes Bundle ist konform).

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { assembleOkfBundle } from "../bundle";
import {
  emitDiagnosisConcept,
  emitKnowledgeUnitConcept,
} from "../emit";
import { checkOkfConformance } from "../conformance";
import type {
  DiagnosisInput,
  KnowledgeUnitInput,
  OkfConcept,
  OkfEmitContext,
} from "../types";

const CTX: OkfEmitContext = { tenantId: "tenant-abc" };

const BUNDLE_CTX = {
  tenantName: "Acme GmbH",
  generatedAt: new Date("2026-06-15T14:25:00Z"),
  snapshotId: "1a2b3c4d-5555-6666-7777-888899990000",
};

function ku(overrides: Partial<KnowledgeUnitInput> = {}): KnowledgeUnitInput {
  return {
    id: "11112222-3333-4444-5555-666677778888",
    block_key: "a_zielgruppe",
    unit_type: "finding",
    title: "Zielgruppe ist B2B",
    body: "Der Kunde fokussiert auf B2B. Begruendung folgt.",
    confidence: "high",
    status: "accepted",
    evidence_refs: [{ recorded_by_user_id: "u1", walkthrough_session_id: "w1" }],
    updated_at: "2026-06-15T14:25:00Z",
    ...overrides,
  };
}

function diag(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    id: "99998888-7777-6666-5555-444433332222",
    block_key: "a_zielgruppe",
    status: "confirmed",
    content: {
      block_key: "a_zielgruppe",
      subtopics: [
        { key: "ampel", name: "Ampel", fields: { status: "gruen" } },
      ],
    },
    updated_at: "2026-06-15T14:25:00Z",
    ...overrides,
  };
}

function bundleWith(concepts: OkfConcept[]): Record<string, string> {
  return assembleOkfBundle(concepts, BUNDLE_CTX);
}

describe("assembleOkfBundle — root index.md", () => {
  it("declares okf_version 0.1 + strategaize_okf_profile 1.0", () => {
    const files = bundleWith([emitKnowledgeUnitConcept(ku(), CTX)]);
    const index = files["index.md"];
    expect(index).toBeDefined();
    const fm = parseYaml(index.split("---")[1]) as Record<string, unknown>;
    expect(fm.okf_version).toBe("0.1");
    expect(fm.strategaize_okf_profile).toBe("1.0");
  });

  it("groups bullets by section (block_key) and links to the concept path", () => {
    const concept = emitKnowledgeUnitConcept(ku(), CTX);
    const files = bundleWith([concept]);
    const index = files["index.md"];
    expect(index).toContain("## a_zielgruppe");
    expect(index).toContain(`* [Zielgruppe ist B2B](/${concept.path})`);
  });
});

describe("assembleOkfBundle — log.md", () => {
  it("contains one dated Creation entry with snapshot id8 + count", () => {
    const files = bundleWith([
      emitKnowledgeUnitConcept(ku(), CTX),
      emitDiagnosisConcept(diag(), CTX),
    ]);
    const log = files["log.md"];
    expect(log).toContain("## 2026-06-15");
    expect(log).toContain("Creation: Bundle aus Snapshot 1a2b3c4d, 2 Concepts");
  });
});

describe("assembleOkfBundle — cross-links", () => {
  it("injects a ## Verwandte section linking siblings of same block_key, resolvable in the file set", () => {
    const kuConcept = emitKnowledgeUnitConcept(ku(), CTX);
    const diagConcept = emitDiagnosisConcept(diag(), CTX);
    const files = bundleWith([kuConcept, diagConcept]);

    const kuFile = files[kuConcept.path];
    expect(kuFile).toContain("## Verwandte");
    // bundle-root-absolute link to the diagnosis sibling
    expect(kuFile).toContain(`(/${diagConcept.path})`);
    // and the link target actually exists in the bundle
    expect(files[diagConcept.path]).toBeDefined();
  });

  it("R-B-3: no ## Verwandte section when a block_key has only one concept", () => {
    const lonely = emitKnowledgeUnitConcept(
      ku({ block_key: "b_solo", id: "deadbeef-0000-0000-0000-000000000001" }),
      CTX,
    );
    const files = bundleWith([lonely]);
    expect(files[lonely.path]).not.toContain("## Verwandte");
  });

  it("does not cross-link concepts from a different block_key", () => {
    const a = emitKnowledgeUnitConcept(ku({ block_key: "a_x" }), CTX);
    const b = emitKnowledgeUnitConcept(
      ku({ block_key: "b_y", id: "cafe0000-0000-0000-0000-000000000002" }),
      CTX,
    );
    const files = bundleWith([a, b]);
    expect(files[a.path]).not.toContain("## Verwandte");
    expect(files[b.path]).not.toContain("## Verwandte");
  });
});

describe("assembleOkfBundle — conformance integration (MT-1 <-> MT-2)", () => {
  it("produces a bundle that passes checkOkfConformance", () => {
    const files = bundleWith([
      emitKnowledgeUnitConcept(ku(), CTX),
      emitDiagnosisConcept(diag(), CTX),
      emitKnowledgeUnitConcept(
        ku({
          block_key: "c_prozesse",
          id: "abcdef00-0000-0000-0000-000000000003",
          unit_type: "risk",
          title: "Single Point of Failure",
        }),
        CTX,
      ),
    ]);
    const result = checkOkfConformance(files);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
