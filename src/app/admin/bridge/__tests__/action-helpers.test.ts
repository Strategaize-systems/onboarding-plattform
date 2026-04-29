import { describe, it, expect } from "vitest";
import {
  buildCleanEditedPayload,
  validateApproveInput,
  validateRejectInput,
  validateTriggerInput,
} from "../action-helpers";

const validUuid = "00000000-0000-0000-0000-000000000001";
const otherUuid = "11111111-1111-1111-1111-111111111111";

describe("validateTriggerInput", () => {
  it("akzeptiert valide UUID", () => {
    expect(validateTriggerInput(validUuid)).toBeNull();
  });

  it("lehnt leeren String ab", () => {
    expect(validateTriggerInput("")).toBe("invalid_capture_session_id");
  });

  it("lehnt Junk-String ab", () => {
    expect(validateTriggerInput("not-a-uuid")).toBe("invalid_capture_session_id");
  });

  it("lehnt UUID mit 35 Zeichen ab", () => {
    expect(validateTriggerInput(validUuid.slice(0, 35))).toBe("invalid_capture_session_id");
  });
});

describe("validateApproveInput", () => {
  it("akzeptiert valide UUID ohne payload", () => {
    expect(validateApproveInput(validUuid)).toBeNull();
  });

  it("akzeptiert valide UUID mit valider employee_user_id", () => {
    expect(
      validateApproveInput(validUuid, { proposed_employee_user_id: otherUuid })
    ).toBeNull();
  });

  it("akzeptiert leeren payload", () => {
    expect(validateApproveInput(validUuid, {})).toBeNull();
  });

  it("akzeptiert payload mit null employee (un-assign)", () => {
    expect(
      validateApproveInput(validUuid, { proposed_employee_user_id: null })
    ).toBeNull();
  });

  it("lehnt invalid proposalId ab", () => {
    expect(validateApproveInput("nope")).toBe("invalid_proposal_id");
  });

  it("lehnt invalid employee_user_id ab", () => {
    expect(
      validateApproveInput(validUuid, { proposed_employee_user_id: "nope" })
    ).toBe("invalid_employee_id");
  });
});

describe("validateRejectInput", () => {
  it("akzeptiert valide reason", () => {
    const r = validateRejectInput(validUuid, "Nicht relevant fuer dieses Team.");
    expect(r).toEqual({ ok: true, reason: "Nicht relevant fuer dieses Team." });
  });

  it("trimmt whitespace", () => {
    const r = validateRejectInput(validUuid, "  Reason  ");
    expect(r).toEqual({ ok: true, reason: "Reason" });
  });

  it("lehnt leere reason ab", () => {
    expect(validateRejectInput(validUuid, "")).toEqual({ error: "reason_required" });
  });

  it("lehnt whitespace-only reason ab", () => {
    expect(validateRejectInput(validUuid, "   \n\t  ")).toEqual({ error: "reason_required" });
  });

  it("lehnt zu lange reason ab (1001 chars)", () => {
    const long = "a".repeat(1001);
    expect(validateRejectInput(validUuid, long)).toEqual({ error: "reason_too_long" });
  });

  it("akzeptiert reason mit genau 1000 chars", () => {
    const max = "a".repeat(1000);
    expect(validateRejectInput(validUuid, max)).toEqual({ ok: true, reason: max });
  });

  it("lehnt invalid proposalId ab", () => {
    expect(validateRejectInput("nope", "valid reason")).toEqual({
      error: "invalid_proposal_id",
    });
  });
});

describe("buildCleanEditedPayload", () => {
  it("returns null wenn payload undefined", () => {
    expect(buildCleanEditedPayload(undefined)).toBeNull();
  });

  it("returns null bei leerem Objekt", () => {
    expect(buildCleanEditedPayload({})).toBeNull();
  });

  it("uebernimmt nur whitelisted Felder", () => {
    const result = buildCleanEditedPayload({
      proposed_block_title: "neuer titel",
      proposed_block_description: "beschreibung",
      proposed_questions: [{ q: "frage 1" }],
      proposed_employee_user_id: otherUuid,
      proposed_employee_role_hint: "Buchhaltung",
    });
    expect(result).toEqual({
      proposed_block_title: "neuer titel",
      proposed_block_description: "beschreibung",
      proposed_questions: [{ q: "frage 1" }],
      proposed_employee_user_id: otherUuid,
      proposed_employee_role_hint: "Buchhaltung",
    });
  });

  it("verwirft nicht-whitelisted Felder still", () => {
    const result = buildCleanEditedPayload({
      proposed_block_title: "titel",
      tenant_id: "00000000-0000-0000-0000-000000000666",
      bridge_run_id: "fremd",
    } as never);
    expect(result).toEqual({ proposed_block_title: "titel" });
  });

  it("erhaelt explizit gesetztes null fuer description (un-set)", () => {
    const result = buildCleanEditedPayload({
      proposed_block_description: null,
    });
    expect(result).toEqual({ proposed_block_description: null });
  });

  it("erhaelt leeres Array fuer questions", () => {
    const result = buildCleanEditedPayload({
      proposed_questions: [],
    });
    expect(result).toEqual({ proposed_questions: [] });
  });

  it("erhaelt null fuer employee (un-assign)", () => {
    const result = buildCleanEditedPayload({
      proposed_employee_user_id: null,
    });
    expect(result).toEqual({ proposed_employee_user_id: null });
  });
});
