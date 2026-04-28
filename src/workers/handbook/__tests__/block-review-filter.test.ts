// SLC-041 MT-2 — Tests fuer Worker-Pre-Filter Helper.
// Drei Pflicht-Cases aus Slice-Spec AC-7/AC-8:
//   1. Empty block_review-Tabelle  -> Backwards-Compat (alle KUs durch)
//   2. Mixed approved/pending      -> nur approved Mitarbeiter-KUs durch, GF-KUs unbeeinflusst
//   3. All rejected                -> Mitarbeiter-KUs leer, GF-KUs vollstaendig

import { describe, expect, it } from "vitest";
import {
  applyBlockReviewFilter,
  countBlockReviewStatuses,
  type BlockReviewState,
} from "../block-review-filter";
import type { KnowledgeUnitRow } from "../types";

const KU_GF_BLOCK_A: KnowledgeUnitRow = {
  id: "ku-gf-a",
  block_key: "A",
  source: "questionnaire",
  unit_type: "fact",
  title: "GF-Sicht Block A",
  body: "Inhalt",
  confidence: "high",
  status: "accepted",
};

const KU_GF_BLOCK_B: KnowledgeUnitRow = {
  id: "ku-gf-b",
  block_key: "B",
  source: "dialogue",
  unit_type: "fact",
  title: "GF-Sicht Block B",
  body: "Inhalt",
  confidence: "high",
  status: "accepted",
};

const KU_EMP_BLOCK_A: KnowledgeUnitRow = {
  id: "ku-emp-a",
  block_key: "A",
  source: "employee_questionnaire",
  unit_type: "fact",
  title: "Mitarbeiter-Sicht Block A",
  body: "Inhalt",
  confidence: "medium",
  status: "accepted",
};

const KU_EMP_BLOCK_B: KnowledgeUnitRow = {
  id: "ku-emp-b",
  block_key: "B",
  source: "employee_questionnaire",
  unit_type: "fact",
  title: "Mitarbeiter-Sicht Block B",
  body: "Inhalt",
  confidence: "medium",
  status: "accepted",
};

const KU_EMP_BLOCK_C: KnowledgeUnitRow = {
  id: "ku-emp-c",
  block_key: "C",
  source: "employee_questionnaire",
  unit_type: "fact",
  title: "Mitarbeiter-Sicht Block C",
  body: "Inhalt",
  confidence: "low",
  status: "accepted",
};

const ALL_KUS: KnowledgeUnitRow[] = [
  KU_GF_BLOCK_A,
  KU_GF_BLOCK_B,
  KU_EMP_BLOCK_A,
  KU_EMP_BLOCK_B,
  KU_EMP_BLOCK_C,
];

function makeState(overrides: Partial<BlockReviewState> = {}): BlockReviewState {
  return {
    approved: new Set<string>(),
    pending: new Set<string>(),
    rejected: new Set<string>(),
    hasAnyRows: false,
    ...overrides,
  };
}

describe("applyBlockReviewFilter — Backwards-Compat (AC-7)", () => {
  it("laesst alle KUs durch, wenn keine block_review-Daten existieren", () => {
    const state = makeState({ hasAnyRows: false });
    const result = applyBlockReviewFilter(ALL_KUS, state);
    expect(result).toEqual(ALL_KUS);
    expect(result).toHaveLength(5);
  });

  it("liefert leeres Array, wenn Eingabe leer ist (egal ob hasAnyRows)", () => {
    expect(applyBlockReviewFilter([], makeState())).toEqual([]);
    expect(
      applyBlockReviewFilter([], makeState({ hasAnyRows: true })),
    ).toEqual([]);
  });
});

describe("applyBlockReviewFilter — Mixed approved/pending (AC-7, AC-8)", () => {
  it("filtert pending-Mitarbeiter-KUs raus, GF-KUs bleiben unbeeinflusst", () => {
    const state = makeState({
      hasAnyRows: true,
      approved: new Set(["A"]),
      pending: new Set(["B"]),
      rejected: new Set(),
    });

    const result = applyBlockReviewFilter(ALL_KUS, state);

    expect(result.map((ku) => ku.id).sort()).toEqual(
      ["ku-emp-a", "ku-gf-a", "ku-gf-b"].sort(),
    );
    expect(result.find((ku) => ku.id === "ku-emp-b")).toBeUndefined();
    expect(result.find((ku) => ku.id === "ku-gf-a")).toBeDefined();
    expect(result.find((ku) => ku.id === "ku-gf-b")).toBeDefined();
  });

  it("Block C ohne Eintrag wird als pending behandelt (default-deny der Backend-Logik)", () => {
    // Wichtig: Wenn hasAnyRows=true UND Block-Key NICHT in approved-Set ist,
    // wird die Mitarbeiter-KU rausgefiltert (egal ob explizit pending oder gar nicht reviewed).
    const state = makeState({
      hasAnyRows: true,
      approved: new Set(["A"]),
      pending: new Set(["B"]),
      rejected: new Set(),
    });

    const result = applyBlockReviewFilter(ALL_KUS, state);
    expect(result.find((ku) => ku.id === "ku-emp-c")).toBeUndefined();
  });
});

describe("applyBlockReviewFilter — All rejected (AC-7, AC-8)", () => {
  it("entfernt alle Mitarbeiter-KUs, GF-KUs bleiben vollstaendig", () => {
    const state = makeState({
      hasAnyRows: true,
      approved: new Set(),
      pending: new Set(),
      rejected: new Set(["A", "B", "C"]),
    });

    const result = applyBlockReviewFilter(ALL_KUS, state);

    expect(result.map((ku) => ku.id).sort()).toEqual(["ku-gf-a", "ku-gf-b"].sort());
    expect(result.every((ku) => ku.source !== "employee_questionnaire")).toBe(true);
  });
});

describe("countBlockReviewStatuses (AC-14)", () => {
  it("zaehlt Block-Counts pro Status", () => {
    const state = makeState({
      hasAnyRows: true,
      approved: new Set(["A", "B"]),
      pending: new Set(["C"]),
      rejected: new Set(["D", "E", "F"]),
    });

    expect(countBlockReviewStatuses(state)).toEqual({
      pending_blocks: 1,
      approved_blocks: 2,
      rejected_blocks: 3,
    });
  });

  it("liefert 0/0/0 fuer leeren State", () => {
    expect(countBlockReviewStatuses(makeState())).toEqual({
      pending_blocks: 0,
      approved_blocks: 0,
      rejected_blocks: 0,
    });
  });
});
