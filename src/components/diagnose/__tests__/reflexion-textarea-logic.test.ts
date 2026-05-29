// V8 SLC-149 MT-3 — Pure-Logic Tests fuer ReflexionTextarea (FEAT-064).
//
// Vitest in node-env. Komponente selbst (ReflexionTextarea.tsx) wird via
// /qa-Live-Smoke verifiziert (gleiche Konvention wie HelperTextModal).

import { describe, it, expect } from "vitest";
import {
  getCounterState,
  truncateToMaxChars,
  shouldDisableSubmit,
} from "../reflexion-textarea-logic";

describe("getCounterState", () => {
  it("returns 'ok' at 0 chars", () => {
    expect(getCounterState(0, 2000)).toBe("ok");
  });

  it("returns 'ok' just below 90% threshold (1799 / 2000)", () => {
    expect(getCounterState(1799, 2000)).toBe("ok");
  });

  it("returns 'warning' exactly at 90% threshold (1800 / 2000)", () => {
    expect(getCounterState(1800, 2000)).toBe("warning");
  });

  it("returns 'warning' exactly at 100% threshold (2000 / 2000)", () => {
    expect(getCounterState(2000, 2000)).toBe("warning");
  });

  it("returns 'error' above maxChars (2001 / 2000)", () => {
    expect(getCounterState(2001, 2000)).toBe("error");
  });
});

describe("truncateToMaxChars", () => {
  it("slices text when longer than maxChars", () => {
    expect(truncateToMaxChars("hello", 3)).toBe("hel");
  });

  it("is no-op when text shorter than maxChars", () => {
    expect(truncateToMaxChars("hello", 100)).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(truncateToMaxChars("", 100)).toBe("");
  });
});

describe("shouldDisableSubmit", () => {
  it("returns false when text within limit", () => {
    expect(shouldDisableSubmit("ok", 100)).toBe(false);
  });

  it("returns true when text exceeds limit", () => {
    expect(shouldDisableSubmit("a".repeat(101), 100)).toBe(true);
  });
});
