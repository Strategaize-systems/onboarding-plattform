import { describe, it, expect } from "vitest";
import {
  CAPTURE_MODE_REGISTRY,
  ALL_CAPTURE_MODES,
  DEFAULT_CAPTURE_MODE,
  resolveCaptureMode,
  resolveBasePath,
} from "../registry";

describe("CAPTURE_MODE_REGISTRY", () => {
  it("contains every known V4 mode key", () => {
    const expected = [
      "questionnaire",
      "evidence",
      "dialogue",
      "employee_questionnaire",
      "walkthrough_stub",
    ].sort();
    expect([...ALL_CAPTURE_MODES].sort()).toEqual(expected);
  });

  it("default fallback is questionnaire", () => {
    expect(DEFAULT_CAPTURE_MODE).toBe("questionnaire");
  });

  it("walkthrough_stub is non-productive (not advertised in tenant_admin UI)", () => {
    expect(CAPTURE_MODE_REGISTRY.walkthrough_stub.productive).toBe(false);
  });

  it("walkthrough_stub uses dedicated worker job type", () => {
    expect(CAPTURE_MODE_REGISTRY.walkthrough_stub.workerJobType).toBe(
      "walkthrough_stub_processing"
    );
  });

  it("walkthrough_stub registers a stub UI component", () => {
    expect(CAPTURE_MODE_REGISTRY.walkthrough_stub.StubComponent).not.toBeNull();
  });

  it("classic modes route through QuestionnaireWorkspace (StubComponent=null)", () => {
    for (const key of [
      "questionnaire",
      "evidence",
      "dialogue",
      "employee_questionnaire",
    ] as const) {
      expect(CAPTURE_MODE_REGISTRY[key].StubComponent).toBeNull();
    }
  });

  it("employee_questionnaire routes under /employee/capture", () => {
    expect(CAPTURE_MODE_REGISTRY.employee_questionnaire.basePath).toBe(
      "/employee/capture"
    );
  });

  it("classic modes (questionnaire/evidence/dialogue) all share /capture", () => {
    for (const key of [
      "questionnaire",
      "evidence",
      "dialogue",
    ] as const) {
      expect(CAPTURE_MODE_REGISTRY[key].basePath).toBe("/capture");
    }
  });
});

describe("resolveCaptureMode", () => {
  it("returns the matching meta for a known mode", () => {
    const { key, meta } = resolveCaptureMode("walkthrough_stub");
    expect(key).toBe("walkthrough_stub");
    expect(meta.displayName).toBe("Walkthrough-Mode (Spike)");
  });

  it("falls back to questionnaire when mode is null (V1 backward-compat)", () => {
    const { key } = resolveCaptureMode(null);
    expect(key).toBe("questionnaire");
  });

  it("falls back to questionnaire when mode is undefined", () => {
    const { key } = resolveCaptureMode(undefined);
    expect(key).toBe("questionnaire");
  });

  it("falls back to questionnaire on unknown mode strings", () => {
    const { key } = resolveCaptureMode("nonexistent_mode");
    expect(key).toBe("questionnaire");
  });
});

describe("resolveBasePath (backward-compat)", () => {
  it("delegates through resolveCaptureMode", () => {
    expect(resolveBasePath("employee_questionnaire")).toBe("/employee/capture");
    expect(resolveBasePath("questionnaire")).toBe("/capture");
    expect(resolveBasePath(null)).toBe("/capture");
    expect(resolveBasePath("walkthrough_stub")).toBe("/capture");
  });
});
