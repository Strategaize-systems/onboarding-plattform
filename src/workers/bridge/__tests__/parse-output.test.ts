import { describe, it, expect } from "vitest";
import { parseFreeFormOutput, parseTemplateRefineOutput } from "../parse-output";

describe("parseTemplateRefineOutput", () => {
  it("akzeptiert sauberes JSON mit allen Feldern", () => {
    const raw = JSON.stringify({
      proposed_employee_user_id: "11111111-1111-1111-1111-111111111111",
      proposed_employee_role_hint: "Operations Manager",
      adjusted_title: "Angepasster Titel",
      adjusted_description: "Neue Beschreibung",
      adjusted_questions: [
        { id: "EM-1", text: "Frage", required: true },
      ],
    });
    const out = parseTemplateRefineOutput(raw);
    expect(out.proposed_employee_user_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(out.adjusted_title).toBe("Angepasster Titel");
    expect(out.adjusted_questions).toHaveLength(1);
  });

  it("strippt Markdown-Code-Fences", () => {
    const raw = '```json\n{"proposed_employee_user_id":null,"adjusted_questions":null}\n```';
    const out = parseTemplateRefineOutput(raw);
    expect(out.proposed_employee_user_id).toBeNull();
    expect(out.adjusted_questions).toBeNull();
  });

  it("behandelt null/leere Strings als null", () => {
    const raw = JSON.stringify({
      proposed_employee_user_id: null,
      proposed_employee_role_hint: "",
      adjusted_title: "   ",
      adjusted_description: null,
      adjusted_questions: null,
    });
    const out = parseTemplateRefineOutput(raw);
    expect(out.proposed_employee_user_id).toBeNull();
    expect(out.proposed_employee_role_hint).toBeNull();
    expect(out.adjusted_title).toBeNull();
    expect(out.adjusted_description).toBeNull();
    expect(out.adjusted_questions).toBeNull();
  });

  it("wirft bei invalidem proposed_employee_user_id (nicht uuid)", () => {
    const raw = JSON.stringify({
      proposed_employee_user_id: "not-a-uuid",
      adjusted_questions: null,
    });
    expect(() => parseTemplateRefineOutput(raw)).toThrow(/uuid/);
  });

  it("filtert unvollstaendige Fragen raus", () => {
    const raw = JSON.stringify({
      proposed_employee_user_id: null,
      adjusted_questions: [
        { id: "EM-1", text: "OK" },
        { id: "", text: "invalid" },
        { text: "no id" },
        { id: "EM-2", text: "  " },
        { id: "EM-3", text: "valid", required: false },
      ],
    });
    const out = parseTemplateRefineOutput(raw);
    expect(out.adjusted_questions).toHaveLength(2);
    expect(out.adjusted_questions?.[0].id).toBe("EM-1");
    expect(out.adjusted_questions?.[1].id).toBe("EM-3");
  });
});

describe("parseFreeFormOutput", () => {
  it("akzeptiert Array mit 3 gueltigen Proposals", () => {
    const raw = JSON.stringify({
      proposals: [
        {
          block_title: "Vorschlag 1",
          description: "Desc",
          questions: [
            { id: "FF-1-1", text: "Q1", required: true },
            { id: "FF-1-2", text: "Q2" },
          ],
          proposed_employee_user_id: "22222222-2222-2222-2222-222222222222",
        },
        {
          block_title: "Vorschlag 2",
          questions: [
            { id: "FF-2-1", text: "Q1" },
            { id: "FF-2-2", text: "Q2" },
            { id: "FF-2-3", text: "Q3" },
          ],
          proposed_employee_role_hint: "Teamleiter",
        },
        {
          block_title: "Vorschlag 3",
          description: "Desc",
          questions: [
            { id: "FF-3-1", text: "Q1" },
            { id: "FF-3-2", text: "Q2" },
          ],
          proposed_employee_user_id: null,
        },
      ],
    });
    const out = parseFreeFormOutput(raw);
    expect(out.proposals).toHaveLength(3);
    expect(out.proposals[0].proposed_employee_user_id).toBe("22222222-2222-2222-2222-222222222222");
    expect(out.proposals[1].proposed_employee_role_hint).toBe("Teamleiter");
  });

  it("filtert Proposals mit < 2 Fragen raus", () => {
    const raw = JSON.stringify({
      proposals: [
        {
          block_title: "Zu wenige",
          questions: [{ id: "Q-1", text: "Einzig" }],
        },
        {
          block_title: "Genug",
          questions: [
            { id: "Q-1", text: "Q1" },
            { id: "Q-2", text: "Q2" },
          ],
        },
      ],
    });
    const out = parseFreeFormOutput(raw);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0].block_title).toBe("Genug");
  });

  it("leeres Array wenn LLM 'keine Vorschlaege' liefert", () => {
    const raw = JSON.stringify({ proposals: [] });
    const out = parseFreeFormOutput(raw);
    expect(out.proposals).toEqual([]);
  });

  it("wirft wenn proposals kein Array ist", () => {
    const raw = JSON.stringify({ proposals: "invalid" });
    expect(() => parseFreeFormOutput(raw)).toThrow(/array/);
  });

  it("setzt user_id auf null bei invalidem uuid-String, behaelt aber das Proposal", () => {
    const raw = JSON.stringify({
      proposals: [
        {
          block_title: "Vorschlag",
          questions: [
            { id: "Q-1", text: "Q1" },
            { id: "Q-2", text: "Q2" },
          ],
          proposed_employee_user_id: "garbage",
          proposed_employee_role_hint: "Operations Manager",
        },
      ],
    });
    const out = parseFreeFormOutput(raw);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0].proposed_employee_user_id).toBeNull();
    expect(out.proposals[0].proposed_employee_role_hint).toBe("Operations Manager");
  });
});
