// SLC-047 MT-1 + MT-3 — Tests fuer Wizard-Logic-Helpers.
//
// Deckt ab:
//  - Step-Transitions (next/prev/clamp) — relevant fuer MT-1 Step-Switching.
//  - Email-Validation und prepareEmployeeRows — relevant fuer MT-3
//    Submit-Time-Validation, 0-Eintraege-Pfad, Mock-inviteEmployee-Pfad.
//  - clampStep — relevant fuer MT-6 Step-Persistenz nach Browser-Reload
//    (initialStep aus tenants.onboarding_wizard_step muss gegen kaputte
//    DB-Werte geschuetzt sein).

import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  prepareEmployeeRows,
  nextStep,
  prevStep,
  clampStep,
  emptyEmployeeRow,
} from "../wizard-helpers";

describe("isValidEmail", () => {
  it("akzeptiert gueltige E-Mail", () => {
    expect(isValidEmail("max@beispiel.de")).toBe(true);
  });

  it("akzeptiert E-Mail mit + und Subdomain", () => {
    expect(isValidEmail("max+test@mail.beispiel.co.uk")).toBe(true);
  });

  it("lehnt fehlendes @ ab", () => {
    expect(isValidEmail("maxbeispiel.de")).toBe(false);
  });

  it("lehnt fehlende Domain ab", () => {
    expect(isValidEmail("max@")).toBe(false);
  });

  it("lehnt Whitespace-only ab", () => {
    expect(isValidEmail("   ")).toBe(false);
  });

  it("trimmt vor Validation", () => {
    expect(isValidEmail("  max@beispiel.de  ")).toBe(true);
  });
});

describe("prepareEmployeeRows — Solo-GF-Pfad (0 Eintraege)", () => {
  it("isEmpty=true wenn Liste leer", () => {
    const out = prepareEmployeeRows([]);
    expect(out.isEmpty).toBe(true);
    expect(out.validRows).toEqual([]);
    expect(out.errors).toEqual([]);
  });

  it("isEmpty=true wenn alle Rows leere E-Mail haben (Add-Row ohne Eingabe)", () => {
    const out = prepareEmployeeRows([
      { email: "", displayName: "", roleHint: "" },
      { email: "   ", displayName: "Test", roleHint: "" },
    ]);
    expect(out.isEmpty).toBe(true);
    expect(out.validRows).toEqual([]);
  });
});

describe("prepareEmployeeRows — gueltige Rows", () => {
  it("normalisiert E-Mail (trim + lowercase)", () => {
    const out = prepareEmployeeRows([
      { email: "  Max@Beispiel.DE  ", displayName: "Max", roleHint: "" },
    ]);
    expect(out.validRows).toEqual([
      { email: "max@beispiel.de", displayName: "Max", roleHint: null },
    ]);
    expect(out.errors).toEqual([]);
    expect(out.isEmpty).toBe(false);
  });

  it("uebernimmt displayName und roleHint, mappt leer auf null", () => {
    const out = prepareEmployeeRows([
      { email: "a@b.de", displayName: "A B", roleHint: "Ops" },
      { email: "c@d.de", displayName: "", roleHint: "" },
    ]);
    expect(out.validRows).toEqual([
      { email: "a@b.de", displayName: "A B", roleHint: "Ops" },
      { email: "c@d.de", displayName: null, roleHint: null },
    ]);
  });

  it("ueberspringt leere Rows in der Mitte ohne Index-Verschiebung", () => {
    const out = prepareEmployeeRows([
      { email: "a@b.de", displayName: "", roleHint: "" },
      { email: "", displayName: "", roleHint: "" },
      { email: "c@d.de", displayName: "", roleHint: "" },
    ]);
    expect(out.validRows.length).toBe(2);
    expect(out.errors).toEqual([]);
  });
});

describe("prepareEmployeeRows — Submit-Time-Validation", () => {
  it("meldet invalid_email mit Original-Index zurueck", () => {
    const out = prepareEmployeeRows([
      { email: "kaputt", displayName: "", roleHint: "" },
      { email: "ok@beispiel.de", displayName: "", roleHint: "" },
    ]);
    expect(out.errors).toEqual([{ index: 0, reason: "invalid_email" }]);
    expect(out.validRows.length).toBe(1);
    expect(out.validRows[0].email).toBe("ok@beispiel.de");
  });

  it("liefert mehrere Errors bei mehreren invaliden Rows", () => {
    const out = prepareEmployeeRows([
      { email: "kaputt1", displayName: "", roleHint: "" },
      { email: "kaputt2", displayName: "", roleHint: "" },
      { email: "ok@beispiel.de", displayName: "", roleHint: "" },
    ]);
    expect(out.errors.map((e) => e.index)).toEqual([0, 1]);
    expect(out.validRows.length).toBe(1);
  });
});

describe("nextStep / prevStep / clampStep — Step-Transitions", () => {
  it("nextStep clamped auf 4", () => {
    expect(nextStep(1)).toBe(2);
    expect(nextStep(2)).toBe(3);
    expect(nextStep(3)).toBe(4);
    expect(nextStep(4)).toBe(4);
  });

  it("prevStep clamped auf 1", () => {
    expect(prevStep(4)).toBe(3);
    expect(prevStep(3)).toBe(2);
    expect(prevStep(2)).toBe(1);
    expect(prevStep(1)).toBe(1);
  });

  it("clampStep validiert beliebige Eingaben (z.B. korrupte DB-Werte)", () => {
    expect(clampStep(0)).toBe(1);
    expect(clampStep(1)).toBe(1);
    expect(clampStep(2)).toBe(2);
    expect(clampStep(3)).toBe(3);
    expect(clampStep(4)).toBe(4);
    expect(clampStep(5)).toBe(4);
    expect(clampStep(99)).toBe(4);
    expect(clampStep(-3)).toBe(1);
  });
});

describe("emptyEmployeeRow", () => {
  it("liefert leere Row mit allen Feldern als ''", () => {
    expect(emptyEmployeeRow()).toEqual({
      email: "",
      displayName: "",
      roleHint: "",
    });
  });
});
