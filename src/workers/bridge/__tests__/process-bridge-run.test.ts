import { describe, it, expect, vi } from "vitest";
import {
  processBridgeRun,
  subtopicKeyToBlockKey,
  type BedrockCaller,
} from "../process-bridge-run";
import type {
  BridgeEmployeeCaptureSchema,
  BridgeEmployee,
  BridgeKnowledgeUnit,
  BridgeDiagnosis,
} from "../types";

const MODEL = "eu.anthropic.claude-sonnet-4-20250514-v1:0";

const schema: BridgeEmployeeCaptureSchema = {
  subtopic_bridges: [
    {
      subtopic_key: "c1_kernablaeufe",
      block_template: {
        title: "Kernablaeufe",
        description: "Desc",
        questions: [
          { id: "EM-C1-1", text: "Q1", required: true },
          { id: "EM-C1-2", text: "Q2" },
        ],
      },
      typical_employee_role_hints: ["Operations Manager"],
      skip_if: null,
    },
    {
      subtopic_key: "e2_nutzung",
      block_template: {
        title: "Systemnutzung",
        description: "Desc E",
        questions: [{ id: "EM-E2-1", text: "Q1", required: true }],
      },
      typical_employee_role_hints: ["Administrator"],
      skip_if: null,
    },
  ],
  free_form_slot: { max_proposals: 2, system_prompt_addendum: "Addendum" },
};

const emp1: BridgeEmployee = {
  user_id: "11111111-1111-1111-1111-111111111111",
  display_name: "Anna",
  role_hint: "Operations Manager",
  department: null,
};
const emp2: BridgeEmployee = {
  user_id: "22222222-2222-2222-2222-222222222222",
  display_name: "Bob",
  role_hint: "Administrator",
  department: null,
};

const kuBlockC: BridgeKnowledgeUnit = {
  id: "ku-c",
  block_key: "C",
  subtopic_key: null,
  title: "KU C",
  body: "Body C",
  unit_type: "finding",
  confidence: "high",
  status: "accepted",
};
const kuBlockE: BridgeKnowledgeUnit = {
  id: "ku-e",
  block_key: "E",
  subtopic_key: null,
  title: "KU E",
  body: "Body E",
  unit_type: "finding",
  confidence: "medium",
  status: "accepted",
};

const diagBlockC: BridgeDiagnosis = {
  id: "d-c",
  block_key: "C",
  subtopic_key: null,
  ampel: "gelb",
  severity: "mittel",
  summary: "Diagnose C",
  status: "confirmed",
};

function mockBedrock(
  responses: Array<{ text: string; tokensIn?: number; tokensOut?: number }>
): BedrockCaller {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error(`Mock-Bedrock: keine weitere Response fuer Call ${i}`);
    return {
      text: r.text,
      tokensIn: r.tokensIn ?? 500,
      tokensOut: r.tokensOut ?? 200,
      durationMs: 123,
      modelId: MODEL,
    };
  });
}

describe("subtopicKeyToBlockKey", () => {
  it("extrahiert Block-Key aus subtopic_key", () => {
    expect(subtopicKeyToBlockKey("c1_kernablaeufe")).toBe("C");
    expect(subtopicKeyToBlockKey("e2_nutzung")).toBe("E");
    expect(subtopicKeyToBlockKey("F2_weitergabe")).toBe("F");
  });

  it("gibt null wenn pattern nicht passt", () => {
    expect(subtopicKeyToBlockKey("invalid")).toBeNull();
    expect(subtopicKeyToBlockKey("123_abc")).toBeNull();
  });
});

describe("processBridgeRun — Happy Path", () => {
  it("erzeugt 2 Template-Proposals + 2 Free-Form-Proposals, cost_entries passen", async () => {
    const templateResp1 = JSON.stringify({
      proposed_employee_user_id: emp1.user_id,
      adjusted_title: "C1 leicht angepasst",
    });
    const templateResp2 = JSON.stringify({
      proposed_employee_user_id: emp2.user_id,
    });
    const freeFormResp = JSON.stringify({
      proposals: [
        {
          block_title: "Extra Thema 1",
          description: "...",
          questions: [
            { id: "FF-1-1", text: "Q1" },
            { id: "FF-1-2", text: "Q2" },
          ],
          proposed_employee_user_id: emp1.user_id,
        },
        {
          block_title: "Extra Thema 2",
          questions: [
            { id: "FF-2-1", text: "Q1" },
            { id: "FF-2-2", text: "Q2" },
          ],
          proposed_employee_role_hint: "Teamleiter",
        },
      ],
    });

    const bedrock = mockBedrock([
      { text: templateResp1 },
      { text: templateResp2 },
      { text: freeFormResp, tokensIn: 2000, tokensOut: 800 },
    ]);

    const result = await processBridgeRun(
      {
        schema,
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals).toHaveLength(4);
    expect(result.proposals.filter((p) => p.proposal_mode === "template")).toHaveLength(2);
    expect(result.proposals.filter((p) => p.proposal_mode === "free_form")).toHaveLength(2);

    // Template-Proposal C: adjusted_title uebernommen, employee valid
    const cProp = result.proposals.find((p) => p.source_subtopic_key === "c1_kernablaeufe");
    expect(cProp).toBeDefined();
    expect(cProp?.proposed_block_title).toBe("C1 leicht angepasst");
    expect(cProp?.proposed_employee_user_id).toBe(emp1.user_id);
    expect(cProp?.proposed_questions).toHaveLength(2);

    // Template-Proposal E: kein adjust, Template-Titel beibehalten
    const eProp = result.proposals.find((p) => p.source_subtopic_key === "e2_nutzung");
    expect(eProp?.proposed_block_title).toBe("Systemnutzung");
    expect(eProp?.proposed_employee_user_id).toBe(emp2.user_id);

    // Cost-Entries
    expect(result.costEntries).toHaveLength(3);
    expect(result.costEntries[0].feature).toBe("bridge_template_refine");
    expect(result.costEntries[1].feature).toBe("bridge_template_refine");
    expect(result.costEntries[2].feature).toBe("bridge_free_form");
    expect(result.costEntries.every((e) => e.role === "bridge_engine")).toBe(true);

    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.generatedByModel).toBe(MODEL);
  });
});

describe("processBridgeRun — Edge Cases", () => {
  it("keine Employees -> Proposals mit role_hint statt user_id", async () => {
    const templateResp = JSON.stringify({
      proposed_employee_user_id: null,
      proposed_employee_role_hint: "Operations Manager",
    });
    const bedrock = mockBedrock([
      { text: templateResp },
      { text: templateResp },
      { text: JSON.stringify({ proposals: [] }) },
    ]);

    const result = await processBridgeRun(
      {
        schema,
        employees: [],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((p) => p.proposed_employee_user_id === null)).toBe(true);
    expect(result.proposals[0].proposed_employee_role_hint).toBe("Operations Manager");
  });

  it("keine Diagnose fuer ein Subtopic -> Subtopic wird trotzdem verarbeitet wenn KUs da sind", async () => {
    const templateResp = JSON.stringify({ proposed_employee_user_id: emp1.user_id });
    const bedrock = mockBedrock([
      { text: templateResp },
      { text: templateResp },
      { text: JSON.stringify({ proposals: [] }) },
    ]);

    const result = await processBridgeRun(
      {
        schema,
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [],
      },
      bedrock
    );

    expect(result.proposals).toHaveLength(2);
  });

  it("Subtopic weder in KUs noch in Diagnose -> uebersprungen mit Warning", async () => {
    const bedrock = mockBedrock([
      { text: JSON.stringify({ proposed_employee_user_id: emp1.user_id }) },
      { text: JSON.stringify({ proposals: [] }) },
    ]);

    const result = await processBridgeRun(
      {
        schema,
        employees: [emp1, emp2],
        kus: [kuBlockC], // nur Block C — Block E Subtopic skippt
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals.filter((p) => p.proposal_mode === "template")).toHaveLength(1);
    expect(result.proposals[0].source_subtopic_key).toBe("c1_kernablaeufe");
    expect(result.warnings.some((w) => w.includes("e2_nutzung"))).toBe(true);
  });

  it("LLM gibt ungueltige user_id zurueck -> Proposal hat user_id=null, role_hint als Fallback", async () => {
    const templateResp = JSON.stringify({
      proposed_employee_user_id: "99999999-9999-9999-9999-999999999999", // nicht in employees
    });
    const bedrock = mockBedrock([
      { text: templateResp },
      { text: templateResp },
      { text: JSON.stringify({ proposals: [] }) },
    ]);

    const result = await processBridgeRun(
      {
        schema,
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals[0].proposed_employee_user_id).toBeNull();
    expect(result.proposals[0].proposed_employee_role_hint).toBe("Operations Manager");
  });

  it("max_proposals=0 -> KEIN Free-Form-Call, nur Template-Proposals", async () => {
    const schemaNoFreeForm: BridgeEmployeeCaptureSchema = {
      ...schema,
      free_form_slot: { max_proposals: 0 },
    };
    const bedrock = mockBedrock([
      { text: JSON.stringify({ proposed_employee_user_id: emp1.user_id }) },
      { text: JSON.stringify({ proposed_employee_user_id: emp2.user_id }) },
    ]);

    const result = await processBridgeRun(
      {
        schema: schemaNoFreeForm,
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((p) => p.proposal_mode === "template")).toBe(true);
    expect(result.costEntries).toHaveLength(2);
    expect(result.costEntries.every((e) => e.feature === "bridge_template_refine")).toBe(true);
    // Bedrock wurde nur 2x gerufen (nicht 3x)
    expect(bedrock).toHaveBeenCalledTimes(2);
  });

  it("Free-Form liefert mehr als max_proposals -> gecapped", async () => {
    const freeFormResp = JSON.stringify({
      proposals: [
        { block_title: "T1", questions: [{ id: "1", text: "Q1" }, { id: "2", text: "Q2" }] },
        { block_title: "T2", questions: [{ id: "1", text: "Q1" }, { id: "2", text: "Q2" }] },
        { block_title: "T3", questions: [{ id: "1", text: "Q1" }, { id: "2", text: "Q2" }] },
        { block_title: "T4", questions: [{ id: "1", text: "Q1" }, { id: "2", text: "Q2" }] },
      ],
    });
    const bedrock = mockBedrock([
      { text: JSON.stringify({ proposed_employee_user_id: emp1.user_id }) },
      { text: JSON.stringify({ proposed_employee_user_id: emp2.user_id }) },
      { text: freeFormResp },
    ]);

    const result = await processBridgeRun(
      {
        schema, // max_proposals=2
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    const freeFormProps = result.proposals.filter((p) => p.proposal_mode === "free_form");
    expect(freeFormProps).toHaveLength(2);
    expect(freeFormProps[0].proposed_block_title).toBe("T1");
    expect(freeFormProps[1].proposed_block_title).toBe("T2");
  });

  it("LLM-Fehler im Template-Refine -> Fallback-Proposal mit Template-Defaults + Warning", async () => {
    const bedrock: BedrockCaller = vi.fn(async (_sys, _user, _opts) => {
      throw new Error("Bedrock Timeout");
    });

    const result = await processBridgeRun(
      {
        schema: { ...schema, free_form_slot: { max_proposals: 0 } },
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    // Beide Subtopics -> je 1 Fallback-Proposal
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((p) => p.proposal_mode === "template")).toBe(true);
    expect(result.proposals[0].proposed_block_title).toBe("Kernablaeufe");
    expect(result.proposals[0].proposed_employee_user_id).toBeNull();
    expect(result.proposals[0].proposed_employee_role_hint).toBe("Operations Manager");
    expect(result.warnings.length).toBe(2);
    expect(result.warnings[0]).toMatch(/Bedrock Timeout/);
  });

  it("LLM-Fehler im Free-Form -> 0 Free-Form-Proposals + Warning, Template-Proposals bleiben", async () => {
    let call = 0;
    const bedrock: BedrockCaller = vi.fn(async () => {
      call++;
      if (call <= 2) {
        return {
          text: JSON.stringify({ proposed_employee_user_id: emp1.user_id }),
          tokensIn: 500,
          tokensOut: 100,
          durationMs: 100,
          modelId: MODEL,
        };
      }
      throw new Error("Free-Form LLM Timeout");
    });

    const result = await processBridgeRun(
      {
        schema,
        employees: [emp1, emp2],
        kus: [kuBlockC, kuBlockE],
        diagnoses: [diagBlockC],
      },
      bedrock
    );

    expect(result.proposals.filter((p) => p.proposal_mode === "template")).toHaveLength(2);
    expect(result.proposals.filter((p) => p.proposal_mode === "free_form")).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("Free-Form"))).toBe(true);
  });
});
