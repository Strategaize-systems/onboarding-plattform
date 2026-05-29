// V8 SLC-149 MT-4 — Vitest fuer getAnswerComponentKind (Pure-Logic).
//
// Pure node-env. Component-Render-Tests deferred zu MT-6 Live-Smoke
// (Strategaize-Konvention: jsdom-frei, [[feedback-pure-helper-extraction-for-jsdom-free-tests]]).

import { describe, it, expect } from "vitest";
import { getAnswerComponentKind } from "../question-flow-switch-logic";

describe("getAnswerComponentKind", () => {
  it("maps hygiene_yes_partial_no to 'hygiene'", () => {
    expect(
      getAnswerComponentKind({ answer_schema_kind: "hygiene_yes_partial_no" }),
    ).toBe("hygiene");
  });

  it("maps reife_skala_5 to 'reife_skala'", () => {
    expect(
      getAnswerComponentKind({ answer_schema_kind: "reife_skala_5" }),
    ).toBe("reife_skala");
  });

  it("maps reflexion_freitext to 'reflexion'", () => {
    expect(
      getAnswerComponentKind({ answer_schema_kind: "reflexion_freitext" }),
    ).toBe("reflexion");
  });

  it("maps choice_5 to 'choice_5' (V6.3-Backwards-Compat)", () => {
    expect(getAnswerComponentKind({ answer_schema_kind: "choice_5" })).toBe(
      "choice_5",
    );
  });

  it("returns 'unknown' for empty object (no field)", () => {
    expect(getAnswerComponentKind({})).toBe("unknown");
  });

  it("returns 'unknown' for invalid kind", () => {
    expect(getAnswerComponentKind({ answer_schema_kind: "invalid" })).toBe(
      "unknown",
    );
  });

  it("returns 'unknown' for null", () => {
    expect(getAnswerComponentKind({ answer_schema_kind: null })).toBe(
      "unknown",
    );
  });

  it("returns 'unknown' for undefined", () => {
    expect(getAnswerComponentKind({ answer_schema_kind: undefined })).toBe(
      "unknown",
    );
  });
});
