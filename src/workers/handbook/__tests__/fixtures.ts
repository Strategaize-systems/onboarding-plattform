// Fixtures fuer Renderer-Tests (SLC-039 MT-3 / MT-4).

import type {
  DiagnosisRow,
  HandbookSchema,
  KnowledgeUnitRow,
  SopRow,
} from "../types";

export const SCHEMA_MINIMAL: HandbookSchema = {
  sections: [
    {
      key: "geschaeftsmodell",
      title: "Geschaeftsmodell",
      order: 1,
      sources: [
        {
          type: "knowledge_unit",
          filter: { block_keys: ["A"], exclude_source: ["employee_questionnaire"] },
        },
        { type: "diagnosis", filter: { block_keys: ["A"], min_status: "confirmed" } },
        { type: "sop", filter: { block_keys: ["A"] } },
      ],
      render: { subsections_by: "subtopic", intro_template: "Geschaeftsmodell-Sicht GF." },
    },
    {
      key: "operatives",
      title: "Operatives Tagesgeschaeft",
      order: 2,
      sources: [
        { type: "knowledge_unit", filter: { source_in: ["employee_questionnaire"] } },
      ],
      render: { subsections_by: "block_key", intro_template: "Mitarbeiter-Sicht." },
    },
  ],
  cross_links: [
    {
      from_section: "operatives",
      to_section: "geschaeftsmodell",
      anchor_match: "subtopic_key",
    },
  ],
};

export const KU_BLOCK_A: KnowledgeUnitRow = {
  id: "ku-a-1",
  block_key: "A",
  source: "questionnaire",
  unit_type: "fact",
  title: "Kerngeschaeft beschrieben",
  body: "Wir vermieten Wohnimmobilien an Privatpersonen.",
  confidence: "high",
  status: "accepted",
};

export const KU_BLOCK_A_EMPLOYEE: KnowledgeUnitRow = {
  id: "ku-a-employee",
  block_key: "A",
  source: "employee_questionnaire",
  unit_type: "fact",
  title: "Tagesablauf Mitarbeiter",
  body: "Vermietungs-Mitarbeiter trifft taeglich 5-7 Interessenten.",
  confidence: "medium",
  status: "accepted",
};

export const KU_BLOCK_E: KnowledgeUnitRow = {
  id: "ku-e-1",
  block_key: "E",
  source: "employee_questionnaire",
  unit_type: "tool",
  title: "Genutzte Tools",
  body: "Outlook + ImmoScout-Backend + Excel.",
  confidence: "high",
  status: "accepted",
};

export const DIAG_BLOCK_A: DiagnosisRow = {
  id: "diag-a-1",
  block_key: "A",
  status: "confirmed",
  content: {
    block_key: "A",
    subtopics: [
      {
        key: "a1_grundverstaendnis",
        name: "Grundverstaendnis",
        fields: {
          ampel: "green",
          hebel: 4,
          reifegrad: 3,
          ist_situation: "Klar dokumentiert.",
          empfehlung: "Beibehalten.",
        },
      },
      {
        key: "a2_leistung",
        name: "Leistung & Angebot",
        fields: { ampel: "yellow", hebel: 6, ist_situation: "Teilweise unklar." },
      },
    ],
  },
};

export const DIAG_BLOCK_A_DRAFT: DiagnosisRow = {
  ...DIAG_BLOCK_A,
  id: "diag-a-draft",
  status: "draft",
};

export const SOP_BLOCK_A: SopRow = {
  id: "sop-a-1",
  block_key: "A",
  content: {
    title: "Onboarding neuer Mieter",
    objective: "Schnelle Einzugsbereitschaft.",
    steps: [
      { title: "Vertrag pruefen", detail: "SCHUFA + Selbstauskunft." },
      { title: "Schluessel uebergeben", detail: "Im Buero." },
    ],
  },
};
