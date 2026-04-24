import { describe, it, expect } from "vitest";
import { buildTemplatePromptForSubtopic, buildFreeFormPrompt } from "../prompts";
import type {
  BridgeDiagnosis,
  BridgeEmployee,
  BridgeKnowledgeUnit,
  BridgeSubtopicBridge,
} from "../types";

const emp1: BridgeEmployee = {
  user_id: "11111111-1111-1111-1111-111111111111",
  display_name: "Anna Mueller",
  role_hint: "Operations Manager",
  department: "Ops",
};

const emp2: BridgeEmployee = {
  user_id: "22222222-2222-2222-2222-222222222222",
  display_name: "Bob Schmidt",
  role_hint: "Teamleiter",
  department: null,
};

const subtopicBridge: BridgeSubtopicBridge = {
  subtopic_key: "c1_kernablaeufe",
  block_template: {
    title: "Mitarbeiter-Sicht: Kernablaeufe",
    description: "Wie fuehlen sich Prozesse an?",
    questions: [
      { id: "EM-C1-1", text: "Deine 3 wichtigsten Schritte?", required: true },
      { id: "EM-C1-2", text: "Wo verlierst du Zeit?", required: false },
    ],
  },
  typical_employee_role_hints: ["Operations Manager", "Teamleiter"],
  skip_if: null,
};

const ku1: BridgeKnowledgeUnit = {
  id: "ku-1",
  block_key: "C",
  subtopic_key: "c1_kernablaeufe",
  title: "Kernprozess Lagerung",
  body: "Die Lagerung laeuft ueber SAP, aber es gibt manuelle Uebergaben.",
  unit_type: "finding",
  confidence: "high",
  status: "accepted",
};

const diag1: BridgeDiagnosis = {
  id: "d-1",
  block_key: "C",
  subtopic_key: "c1_kernablaeufe",
  ampel: "gelb",
  severity: "mittel",
  summary: "Uebergaben sind dokumentiert, aber nicht konsistent gelebt.",
  status: "confirmed",
};

describe("buildTemplatePromptForSubtopic", () => {
  it("erzeugt system + user prompt mit JSON-Output-Schema", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [emp1, emp2],
    });

    expect(p.system).toContain("JSON-Objekt");
    expect(p.system).toContain("proposed_employee_user_id");
    expect(p.system).toContain("adjusted_questions");
    expect(p.system).toContain("Kein Markdown");
  });

  it("user prompt enthaelt Subtopic-Key, Template-Titel, alle Fragen", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [emp1],
    });

    expect(p.user).toContain("c1_kernablaeufe");
    expect(p.user).toContain("Mitarbeiter-Sicht: Kernablaeufe");
    expect(p.user).toContain("EM-C1-1");
    expect(p.user).toContain("Deine 3 wichtigsten Schritte?");
    expect(p.user).toContain("[required]");
  });

  it("user prompt enthaelt KU-Body und Diagnose-Summary", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [emp1],
    });

    expect(p.user).toContain("SAP");
    expect(p.user).toContain("Uebergaben sind dokumentiert");
    expect(p.user).toContain("gelb");
  });

  it("user prompt listet Mitarbeiter mit user_id, name, role_hint", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [emp1, emp2],
    });

    expect(p.user).toContain("user_id=11111111-1111-1111-1111-111111111111");
    expect(p.user).toContain("Anna Mueller");
    expect(p.user).toContain("Operations Manager");
    expect(p.user).toContain("Bob Schmidt");
    expect(p.user).toContain("Teamleiter");
  });

  it("user prompt listet typical_employee_role_hints als Anhaltspunkt", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [emp1],
    });

    expect(p.user).toContain("Operations Manager, Teamleiter");
  });

  it("Edge-Case: keine Mitarbeiter -> Hinweis statt Liste", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [ku1],
      subtopicDiagnoses: [diag1],
      employees: [],
    });

    expect(p.user).toContain("Keine aktiven Mitarbeiter");
  });

  it("Edge-Case: keine KUs und keine Diagnose -> Placeholder-Hinweise", () => {
    const p = buildTemplatePromptForSubtopic({
      subtopicBridge,
      subtopicKus: [],
      subtopicDiagnoses: [],
      employees: [emp1],
    });

    expect(p.user).toContain("Keine Knowledge Units fuer dieses Subtopic");
    expect(p.user).toContain("Keine Diagnose fuer dieses Subtopic");
  });
});

describe("buildFreeFormPrompt", () => {
  it("erzeugt system + user prompt mit JSON-Output-Schema fuer Vorschlaege-Array", () => {
    const p = buildFreeFormPrompt({
      maxProposals: 3,
      systemPromptAddendum: "Generiere max 3 Vorschlaege.",
      existingSubtopicKeys: ["c1_kernablaeufe"],
      allKus: [ku1],
      allDiagnoses: [diag1],
      employees: [emp1, emp2],
    });

    expect(p.system).toContain("proposals");
    expect(p.system).toContain("block_title");
    expect(p.system).toContain("questions");
    expect(p.system).toContain("proposed_employee_user_id");
  });

  it("system prompt enthaelt max_proposals-Limit explizit", () => {
    const p = buildFreeFormPrompt({
      maxProposals: 3,
      existingSubtopicKeys: [],
      allKus: [ku1],
      allDiagnoses: [],
      employees: [],
    });

    expect(p.system).toContain("bis zu 3 Themen");
  });

  it("system prompt enthaelt system_prompt_addendum wenn vorhanden", () => {
    const addendum = "CUSTOM ADDENDUM XYZ123";
    const p = buildFreeFormPrompt({
      maxProposals: 3,
      systemPromptAddendum: addendum,
      existingSubtopicKeys: [],
      allKus: [],
      allDiagnoses: [],
      employees: [],
    });

    expect(p.system).toContain(addendum);
  });

  it("user prompt listet existing_subtopic_keys zum Ausschluss", () => {
    const p = buildFreeFormPrompt({
      maxProposals: 3,
      existingSubtopicKeys: ["c1_kernablaeufe", "e2_nutzung", "f2_weitergabe"],
      allKus: [ku1],
      allDiagnoses: [],
      employees: [],
    });

    expect(p.user).toContain("c1_kernablaeufe");
    expect(p.user).toContain("e2_nutzung");
    expect(p.user).toContain("f2_weitergabe");
    expect(p.user).toContain("NICHT doppeln");
  });

  it("user prompt listet alle KUs mit block_key und subtopic_key", () => {
    const p = buildFreeFormPrompt({
      maxProposals: 3,
      existingSubtopicKeys: [],
      allKus: [ku1],
      allDiagnoses: [diag1],
      employees: [],
    });

    expect(p.user).toContain("[C/c1_kernablaeufe]");
    expect(p.user).toContain("SAP");
  });

  it("Edge-Case: max_proposals=0 wird trotzdem im Prompt reflektiert (aber Caller skippt)", () => {
    const p = buildFreeFormPrompt({
      maxProposals: 0,
      existingSubtopicKeys: [],
      allKus: [ku1],
      allDiagnoses: [],
      employees: [],
    });

    expect(p.system).toContain("bis zu 0 Themen");
  });
});
