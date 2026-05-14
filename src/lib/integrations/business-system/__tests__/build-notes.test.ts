// V6 SLC-106 — buildNotesFromDiagnose Vitest (FEAT-046, MT-4)
//
// 3 Faelle laut Slice-Spec: typische Struktur, leerer Bericht-Edge-Case,
// Score-Edge-Case (0/10/Decimal-Rounding).

import { describe, expect, it } from "vitest";
import { buildNotesFromDiagnose, MAX_NOTES_CHARS } from "../build-notes";
import type { DiagnoseReportSummary } from "../types";

describe("buildNotesFromDiagnose", () => {
  it("typical case — 4 sentences with partner, score, weakest block and closing", () => {
    const report: DiagnoseReportSummary = {
      partner_org_name: "Mueller Steuerberatung GmbH",
      average_score: 5.4,
      weakest_block_title: "Strategie und Vision",
    };

    const notes = buildNotesFromDiagnose(report);

    expect(notes).toContain("Mueller Steuerberatung GmbH");
    expect(notes).toContain("Durchschnittlicher Score: 5.4/10");
    expect(notes).toContain("Groesste Strukturluecke: Strategie und Vision");
    expect(notes).toContain("Mandant wuenscht Kontakt");
    // 4 Satzpunkte erwartet (3 Datenpunkt-Saetze + Schluss)
    expect(notes.split(". ").length).toBe(4);
    expect(notes.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
  });

  it("empty diagnosis — only intro and closing sentence when score and block are null", () => {
    const report: DiagnoseReportSummary = {
      partner_org_name: "Mueller Steuerberatung GmbH",
      average_score: null,
      weakest_block_title: null,
    };

    const notes = buildNotesFromDiagnose(report);

    expect(notes).toContain("Mueller Steuerberatung GmbH");
    expect(notes).toContain("Mandant wuenscht Kontakt");
    expect(notes).not.toContain("Score");
    expect(notes).not.toContain("Strukturluecke");
    expect(notes.split(". ").length).toBe(2);
  });

  it("score edge cases — 0 is rendered, 10 is rendered, decimals are rounded to one digit", () => {
    const zero = buildNotesFromDiagnose({
      partner_org_name: "Partner A",
      average_score: 0,
      weakest_block_title: "Block A",
    });
    expect(zero).toContain("Durchschnittlicher Score: 0.0/10");

    const ten = buildNotesFromDiagnose({
      partner_org_name: "Partner B",
      average_score: 10,
      weakest_block_title: "Block B",
    });
    expect(ten).toContain("Durchschnittlicher Score: 10.0/10");

    const rounded = buildNotesFromDiagnose({
      partner_org_name: "Partner C",
      average_score: 7.333333,
      weakest_block_title: "Block C",
    });
    expect(rounded).toContain("Durchschnittlicher Score: 7.3/10");
    expect(rounded).not.toContain("7.333");
  });
});
