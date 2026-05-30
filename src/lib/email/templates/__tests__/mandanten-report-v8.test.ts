// V8 SLC-152 MT-1 — Vitest fuer V8 Mandanten-Report Email-Template.

import { describe, it, expect } from "vitest";
import {
  buildMandantenReportV8Email,
  BL_133_WEITERLEITUNGS_HINWEIS,
} from "../mandanten-report-v8";

const EMPTY = new Map<string, string>();

describe("buildMandantenReportV8Email", () => {
  it("rendert Default-Subject mit V8-Tonalitaet", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {});
    expect(out.subject).toBe(
      "Ihre Strategaize-Diagnose — Wo Ihre Firma heute steht",
    );
  });

  it("rendert Mandant-direkt-Adressat im Body (NICHT Partner/StB)", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {});
    expect(out.textBody).toContain(
      "Sie haben den Strategaize-Uebergabe-Fragebogen durchlaufen",
    );
    expect(out.textBody).toContain("Sie sind Eigentuemer dieses Berichts");
  });

  it("enthaelt BL-133 Pflicht-Hinweis zur Weiterleitung an Steuerberater", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {});
    expect(out.textBody).toContain("Steuerberater weiterleiten");
    expect(out.textBody).toContain("Modul 0 + Modul 10");
    // BL-133-Konstante als Single-Source-of-Truth-Check
    expect(out.textBody).toContain(BL_133_WEITERLEITUNGS_HINWEIS);
  });

  it("rendert Strategaize-Default-Footer mit Datenschutz + Impressum (Pflicht)", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {});
    expect(out.textBody).toContain("strategaize.de/datenschutz");
    expect(out.textBody).toContain("strategaize.de/impressum");
    expect(out.textBody).toContain("Uebergabefaehigkeits-Diagnose V8.0");
  });

  it("rendert PDF-Anhang-Verweis", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {});
    expect(out.htmlBody).toContain("<strong>PDF im Anhang</strong>");
    expect(out.textBody).toContain("PDF im Anhang");
  });

  it("fuegt CustomMessage als eigenen MD-Block ein wenn angegeben", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {
      customMessage: "Bitte beachten Sie *Modul 5*.",
    });
    expect(out.htmlBody).toContain("<strong>Hinweis vom Mandanten:</strong>");
    // MD-Escape: *Modul 5* darf nicht als HTML-Italic gerendert werden
    expect(out.htmlBody).not.toContain("<em>Modul 5</em>");
    expect(out.textBody).toContain("Modul 5");
  });

  it("rendert keinen CustomMessage-Block wenn leer", async () => {
    const out = await buildMandantenReportV8Email(EMPTY, {
      customMessage: "",
    });
    expect(out.htmlBody).not.toContain("Hinweis vom Mandanten");
  });

  it("Override aus loadEmailOverridesMap ersetzt Default-Subject", async () => {
    const overrides = new Map([
      ["email.mandanten_report_v8.subject", "Custom Override Subject"],
    ]);
    const out = await buildMandantenReportV8Email(overrides, {});
    expect(out.subject).toBe("Custom Override Subject");
  });
});
