// V7.1 SLC-137 MT-1 — Pure-logic Tests fuer EditableText-Helper (FEAT-056).
//
// Vitest in node-env. Keine DOM-Setup-Pflicht — wir testen Helper-Funktionen,
// nicht die React-Komponente selbst. Visual-Verification der Komponente
// passiert in /qa-Live-Smoke.

import { describe, it, expect } from "vitest";
import {
  canEditText,
  pickEditorMode,
  selectEffectiveText,
  isValidTextKey,
  defaultScopeForKey,
  INLINE_EDIT_MAX_LEN,
  EDITOR_ROLES,
} from "../editable-text-logic";

describe("canEditText", () => {
  it("allows strategaize_admin", () => {
    expect(canEditText("strategaize_admin")).toBe(true);
  });

  it("allows partner_admin", () => {
    expect(canEditText("partner_admin")).toBe(true);
  });

  it("denies tenant_admin", () => {
    expect(canEditText("tenant_admin")).toBe(false);
  });

  it("denies employee", () => {
    expect(canEditText("employee")).toBe(false);
  });

  it("denies null/undefined role (anon/missing)", () => {
    expect(canEditText(null)).toBe(false);
    expect(canEditText(undefined)).toBe(false);
  });

  it("exposes EDITOR_ROLES list with both admin roles", () => {
    expect(EDITOR_ROLES).toEqual(["strategaize_admin", "partner_admin"]);
  });
});

describe("pickEditorMode (DEC-143 Hybrid-Schwelle)", () => {
  it("returns inline for short single-line text", () => {
    expect(pickEditorMode("Ich will mehr", false)).toBe("inline");
  });

  it("returns modal for multiline=true regardless of length", () => {
    expect(pickEditorMode("kurz", true)).toBe("modal");
  });

  it("returns inline for text at exactly threshold length", () => {
    const text = "x".repeat(INLINE_EDIT_MAX_LEN);
    expect(text.length).toBe(80);
    expect(pickEditorMode(text, false)).toBe("inline");
  });

  it("returns modal for text just above threshold length", () => {
    const text = "x".repeat(INLINE_EDIT_MAX_LEN + 1);
    expect(pickEditorMode(text, false)).toBe("modal");
  });

  it("returns modal for very long single-line text", () => {
    const text =
      "Wir analysieren Ihre Antworten und liefern eine konsolidierte Reife-Bewertung mit Empfehlungen.";
    expect(text.length).toBeGreaterThan(INLINE_EDIT_MAX_LEN);
    expect(pickEditorMode(text, false)).toBe("modal");
  });
});

describe("selectEffectiveText", () => {
  it("returns defaultText with isOverride=false when map is null", () => {
    const r = selectEffectiveText(null, "diagnose.bericht.cta", "Ich will mehr");
    expect(r).toEqual({ text: "Ich will mehr", isOverride: false });
  });

  it("returns defaultText when map has no entry for the key", () => {
    const map = new Map<string, string>([["other.key", "Other"]]);
    const r = selectEffectiveText(map, "diagnose.bericht.cta", "Ich will mehr");
    expect(r).toEqual({ text: "Ich will mehr", isOverride: false });
  });

  it("returns override text + isOverride=true when map has entry", () => {
    const map = new Map<string, string>([["diagnose.bericht.cta", "Mehr erfahren"]]);
    const r = selectEffectiveText(map, "diagnose.bericht.cta", "Ich will mehr");
    expect(r).toEqual({ text: "Mehr erfahren", isOverride: true });
  });

  it("treats empty-string override as a valid override (not fallback)", () => {
    // Override-User darf einen String explizit auf "" setzen (z.B. um eine
    // Tagline zu verstecken). Resolver muss das respektieren.
    const map = new Map<string, string>([["section.tagline", ""]]);
    const r = selectEffectiveText(map, "section.tagline", "Standard-Tagline");
    expect(r).toEqual({ text: "", isOverride: true });
  });
});

describe("isValidTextKey (TEXT_KEY_REGEX spiegelt actions.ts)", () => {
  it("accepts lowercase + digits + dot + underscore", () => {
    expect(isValidTextKey("diagnose.bericht.cta.ich_will_mehr")).toBe(true);
    expect(isValidTextKey("template.partner_diagnostic.block.q1.label")).toBe(true);
    expect(isValidTextKey("email.verify_signup.subject")).toBe(true);
  });

  it("rejects uppercase letters", () => {
    expect(isValidTextKey("Diagnose.bericht")).toBe(false);
  });

  it("rejects spaces and special chars", () => {
    expect(isValidTextKey("diagnose bericht")).toBe(false);
    expect(isValidTextKey("diagnose-bericht")).toBe(false);
    expect(isValidTextKey("diagnose/bericht")).toBe(false);
  });

  it("rejects empty string and over-200 length", () => {
    expect(isValidTextKey("")).toBe(false);
    expect(isValidTextKey("a".repeat(201))).toBe(false);
  });
});

describe("defaultScopeForKey (V7.1 SLC-137 /qa Auto-Fix: immer 'global')", () => {
  it("returns 'global' for template.* keys (Inline-Edit hat keinen Template-Kontext)", () => {
    expect(defaultScopeForKey("template.partner_diagnostic.block.q1.label")).toBe("global");
  });

  it("returns 'global' for partner.* keys (Caller setzt scope='partner' explizit wenn gewollt)", () => {
    expect(defaultScopeForKey("partner.welcome.headline")).toBe("global");
  });

  it("returns 'global' for unprefixed keys (matches FEAT-056 prop default)", () => {
    expect(defaultScopeForKey("diagnose.bericht.cta")).toBe("global");
    expect(defaultScopeForKey("email.verify_signup.subject")).toBe("global");
  });
});
