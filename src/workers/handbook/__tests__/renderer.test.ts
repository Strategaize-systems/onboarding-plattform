// SLC-039 MT-3 — Renderer-Tests (deterministisch, fixture-basiert)

import { describe, expect, it } from "vitest";
import { renderHandbook, HANDBOOK_INDEX_FILENAME } from "../renderer";
import {
  DIAG_BLOCK_A,
  DIAG_BLOCK_A_DRAFT,
  KU_BLOCK_A,
  KU_BLOCK_A_EMPLOYEE,
  KU_BLOCK_E,
  SCHEMA_MINIMAL,
  SOP_BLOCK_A,
} from "./fixtures";
import type { RendererInput } from "../types";

const FIXED_DATE = new Date("2026-04-27T08:00:00Z");

function baseInput(overrides: Partial<RendererInput> = {}): RendererInput {
  return {
    schema: SCHEMA_MINIMAL,
    tenantName: "Beispiel GmbH",
    knowledgeUnits: [],
    diagnoses: [],
    sops: [],
    generatedAt: FIXED_DATE,
    ...overrides,
  };
}

describe("renderHandbook", () => {
  it("erzeugt INDEX.md + Section-Files mit deterministischer Filename-Konvention", () => {
    const result = renderHandbook(baseInput());
    expect(Object.keys(result.files).sort()).toEqual([
      "01_geschaeftsmodell.md",
      "02_operatives.md",
      HANDBOOK_INDEX_FILENAME,
    ]);
  });

  it("liefert Counts = 0 bei leerer Eingabe", () => {
    const result = renderHandbook(baseInput());
    expect(result.counts).toEqual({
      section_count: 2,
      knowledge_unit_count: 0,
      diagnosis_count: 0,
      sop_count: 0,
    });
  });

  it("schreibt Tenant-Name + Datum in INDEX.md", () => {
    const result = renderHandbook(baseInput());
    const idx = result.files[HANDBOOK_INDEX_FILENAME];
    expect(idx).toContain("# Unternehmerhandbuch — Beispiel GmbH");
    expect(idx).toContain("_Generiert am 2026-04-27 08:00 UTC_");
    expect(idx).toContain("[Geschaeftsmodell](01_geschaeftsmodell.md)");
    expect(idx).toContain("[Operatives Tagesgeschaeft](02_operatives.md)");
  });

  it("filtert KUs nach block_keys + exclude_source (GF-Sicht ignoriert employee_questionnaire)", () => {
    const result = renderHandbook(
      baseInput({
        knowledgeUnits: [KU_BLOCK_A, KU_BLOCK_A_EMPLOYEE],
      }),
    );
    const sectionA = result.files["01_geschaeftsmodell.md"];
    expect(sectionA).toContain("Kerngeschaeft beschrieben");
    expect(sectionA).not.toContain("Tagesablauf Mitarbeiter");
    // Globale Counts: KU_BLOCK_A in geschaeftsmodell + KU_BLOCK_A_EMPLOYEE in operatives = 2
    expect(result.counts.knowledge_unit_count).toBe(2);
  });

  it("filtert KUs nach source_in (Mitarbeiter-Sicht zeigt nur employee_questionnaire)", () => {
    const result = renderHandbook(
      baseInput({
        knowledgeUnits: [KU_BLOCK_A, KU_BLOCK_A_EMPLOYEE, KU_BLOCK_E],
      }),
    );
    const sectionEmp = result.files["02_operatives.md"];
    expect(sectionEmp).toContain("Tagesablauf Mitarbeiter");
    expect(sectionEmp).toContain("Genutzte Tools");
    expect(sectionEmp).not.toContain("Kerngeschaeft beschrieben");
  });

  it("filtert Diagnosen nach min_status (draft wird verworfen, confirmed bleibt)", () => {
    const result = renderHandbook(
      baseInput({ diagnoses: [DIAG_BLOCK_A, DIAG_BLOCK_A_DRAFT] }),
    );
    expect(result.counts.diagnosis_count).toBe(1);
    const sectionA = result.files["01_geschaeftsmodell.md"];
    expect(sectionA).toContain("Grundverstaendnis");
  });

  it("rendert Diagnose-Subtopics als Tabellen", () => {
    const result = renderHandbook(baseInput({ diagnoses: [DIAG_BLOCK_A] }));
    const sectionA = result.files["01_geschaeftsmodell.md"];
    expect(sectionA).toContain("## Grundverstaendnis");
    expect(sectionA).toContain('<a id="subtopic-a1_grundverstaendnis"></a>');
    expect(sectionA).toMatch(/\| Feld \| Wert \|/);
    expect(sectionA).toContain("ampel");
    expect(sectionA).toContain("green");
  });

  it("rendert SOP-Steps im Generator-Format (action/responsible/timeframe/success_criterion)", () => {
    const result = renderHandbook(
      baseInput({ diagnoses: [DIAG_BLOCK_A], sops: [SOP_BLOCK_A] }),
    );
    const sectionA = result.files["01_geschaeftsmodell.md"];
    expect(sectionA).toContain("Onboarding neuer Mieter");
    expect(sectionA).toContain("1. **Vertrag pruefen**");
    expect(sectionA).toContain("_Verantwortlich:_ Vermietungs-Manager");
    expect(sectionA).toContain("_Frist:_ 1 Tag");
    expect(sectionA).toContain("_Erfolg:_ SCHUFA + Selbstauskunft vollstaendig.");
    expect(sectionA).toContain("2. **Schluessel uebergeben**");
    expect(sectionA).toContain("_Voraussetzungen:_ Schritt 1");
  });

  it("setzt Cross-Link-Anker oben in der Quell-Section", () => {
    const result = renderHandbook(
      baseInput({ knowledgeUnits: [KU_BLOCK_A_EMPLOYEE] }),
    );
    const employees = result.files["02_operatives.md"];
    expect(employees).toContain("**Querverweise:**");
    expect(employees).toContain("[geschaeftsmodell](01_geschaeftsmodell.md)");
  });

  it("rendert Platzhalter-Text bei leerer Section", () => {
    const result = renderHandbook(baseInput());
    const empty = result.files["01_geschaeftsmodell.md"];
    expect(empty).toContain("aktuell noch keine erfassten Inhalte");
  });

  it("ist deterministisch — gleiche Eingabe ergibt gleiches Output", () => {
    const a = renderHandbook(
      baseInput({ knowledgeUnits: [KU_BLOCK_A], diagnoses: [DIAG_BLOCK_A], sops: [SOP_BLOCK_A] }),
    );
    const b = renderHandbook(
      baseInput({ knowledgeUnits: [KU_BLOCK_A], diagnoses: [DIAG_BLOCK_A], sops: [SOP_BLOCK_A] }),
    );
    expect(a.files).toEqual(b.files);
  });

  it("Markdown-Syntax-Check: keine '#' ohne Leerzeichen, keine kaputten Tabellen", () => {
    const result = renderHandbook(
      baseInput({
        knowledgeUnits: [KU_BLOCK_A, KU_BLOCK_A_EMPLOYEE],
        diagnoses: [DIAG_BLOCK_A],
        sops: [SOP_BLOCK_A],
      }),
    );
    for (const md of Object.values(result.files)) {
      // Heading-Marker am Zeilenanfang muss Leerzeichen haben
      const badHeadings = md.split("\n").filter((l) => /^#+[^# ]/.test(l));
      expect(badHeadings, `bad headings in:\n${md}`).toEqual([]);
      // Wenn Zeile mit | beginnt, muss sie auch mit | enden (Tabellenzeile)
      const badTable = md.split("\n").filter((l) => /^\|/.test(l) && !/\|\s*$/.test(l));
      expect(badTable, `bad table rows in:\n${md}`).toEqual([]);
    }
  });

  it("zaehlt Sources korrekt fuer Counts-Output", () => {
    const result = renderHandbook(
      baseInput({
        knowledgeUnits: [KU_BLOCK_A, KU_BLOCK_A_EMPLOYEE, KU_BLOCK_E],
        diagnoses: [DIAG_BLOCK_A],
        sops: [SOP_BLOCK_A],
      }),
    );
    expect(result.counts).toEqual({
      section_count: 2,
      knowledge_unit_count: 3, // 1 in geschaeftsmodell + 2 in operatives
      diagnosis_count: 1,
      sop_count: 1,
    });
  });
});
