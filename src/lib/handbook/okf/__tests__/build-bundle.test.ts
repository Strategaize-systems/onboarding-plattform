// SLC-V9.7-B MT-4 — OKF Worker-Integrations-Helper Tests.
//
// Deckt den Worker-Integrationspunkt ohne DB ab: KU-Set-Inklusion, Diagnose-
// Selektion (confirmed) und die WEICHE Degradation (DEC-225): emit-Fehler und
// Konformitaets-Verstoss -> null + onError, NIE Throw.

import { describe, expect, it, vi } from "vitest";
import {
  buildOkfBundleOrNull,
  isConfirmedDiagnosis,
  type OkfRowInputs,
} from "../build-bundle";
import { checkOkfConformance } from "../conformance";
import type {
  DiagnosisInput,
  KnowledgeUnitInput,
  SopInput,
} from "../types";

const CTX = {
  tenantId: "tenant-abc",
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
    body: "Der Kunde fokussiert auf B2B.",
    confidence: "high",
    status: "accepted",
    evidence_refs: null,
    updated_at: "2026-06-15T14:25:00Z",
    ...overrides,
  };
}

function sop(overrides: Partial<SopInput> = {}): SopInput {
  return {
    id: "55556666-7777-8888-9999-aaaabbbbcccc",
    block_key: "c_prozesse",
    content: {
      title: "Onboarding-Prozess",
      objective: "Neue Kunden strukturiert aufnehmen.",
      steps: [{ action: "Erstgespraech", responsible: "Vertrieb" }],
    },
    updated_at: "2026-06-15T14:25:00Z",
    ...overrides,
  };
}

function emptyInputs(): OkfRowInputs {
  return { knowledgeUnits: [], diagnoses: [], sops: [] };
}

describe("isConfirmedDiagnosis", () => {
  it("selects only confirmed diagnoses", () => {
    const rows = [
      { status: "confirmed" },
      { status: "draft" },
      { status: "rejected" },
      { status: "confirmed" },
    ];
    expect(rows.filter(isConfirmedDiagnosis)).toHaveLength(2);
  });
});

describe("buildOkfBundleOrNull — happy path", () => {
  it("returns a conformant bundle containing the KU and SOP concepts", () => {
    const onError = vi.fn();
    const bundle = buildOkfBundleOrNull(
      { knowledgeUnits: [ku()], diagnoses: [], sops: [sop()] },
      CTX,
      onError,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(bundle).not.toBeNull();
    expect(checkOkfConformance(bundle as Record<string, string>).ok).toBe(true);
    // KU + SOP each produced a concept file (+ index.md + log.md)
    const paths = Object.keys(bundle as Record<string, string>);
    expect(paths.some((p) => p.includes("finding-"))).toBe(true);
    expect(paths.some((p) => p.includes("sop-"))).toBe(true);
    expect(paths).toContain("index.md");
    expect(paths).toContain("log.md");
  });

  it("handles an empty curated set (still conformant: index.md + log.md)", () => {
    const onError = vi.fn();
    const bundle = buildOkfBundleOrNull(emptyInputs(), CTX, onError);
    expect(onError).not.toHaveBeenCalled();
    expect(bundle).not.toBeNull();
    expect(checkOkfConformance(bundle as Record<string, string>).ok).toBe(true);
  });
});

describe("buildOkfBundleOrNull — weiche Degradation (DEC-225)", () => {
  it("returns null + calls onError when emit throws (unknown unit_type)", () => {
    const onError = vi.fn();
    const bundle = buildOkfBundleOrNull(
      { knowledgeUnits: [ku({ unit_type: "nonsense" })], diagnoses: [], sops: [] },
      CTX,
      onError,
    );
    expect(bundle).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("never throws even on bad input", () => {
    const onError = vi.fn();
    const badDiag = {
      // missing/garbage shape that will throw during emit/assemble
      id: "x",
      block_key: "a",
      status: "confirmed",
      content: null as unknown,
      updated_at: "2026-06-15T14:25:00Z",
    } as unknown as DiagnosisInput;
    expect(() =>
      buildOkfBundleOrNull(
        { knowledgeUnits: [], diagnoses: [badDiag], sops: [] },
        CTX,
        onError,
      ),
    ).not.toThrow();
  });
});
