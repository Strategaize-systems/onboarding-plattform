// SLC-141 MT-3 (FEAT-060) — Vitest fuer Diagnose-Report Email-Template.

import { describe, it, expect } from "vitest";
import { buildDiagnoseReportEmail } from "../diagnose-report";

const EMPTY = new Map<string, string>();

describe("buildDiagnoseReportEmail", () => {
  it("renders default Subject + Body with partnerDisplayName substituted", async () => {
    const out = await buildDiagnoseReportEmail(EMPTY, {
      partnerDisplayName: "Kanzlei Mueller & Partner",
    });
    expect(out.subject).toBe(
      "Ihr StrategAIze Diagnose-Bericht — Kanzlei Mueller & Partner",
    );
    expect(out.htmlBody).toContain("<strong>Diagnose-Bericht</strong>");
    expect(out.htmlBody).toContain("Kanzlei Mueller &#x26; Partner");
    expect(out.textBody).toContain("Kanzlei Mueller & Partner");
    expect(out.textBody).toContain("Diagnose-Bericht");
  });

  it("inserts customMessage as a quoted markdown block when provided", async () => {
    const out = await buildDiagnoseReportEmail(EMPTY, {
      partnerDisplayName: "Test Partner",
      customMessage: "Bitte beachte den Punkt zur SOP-Reife.",
    });
    expect(out.htmlBody).toContain("Hinweis vom Mandanten");
    expect(out.htmlBody).toContain("Bitte beachte den Punkt zur SOP-Reife.");
    expect(out.textBody).toContain("Hinweis vom Mandanten");
    expect(out.textBody).toContain("SOP-Reife");
  });

  it("does not insert customMessage block when omitted or whitespace-only", async () => {
    const out1 = await buildDiagnoseReportEmail(EMPTY, {
      partnerDisplayName: "Test Partner",
    });
    expect(out1.htmlBody).not.toContain("Hinweis vom Mandanten");

    const out2 = await buildDiagnoseReportEmail(EMPTY, {
      partnerDisplayName: "Test Partner",
      customMessage: "   \n  ",
    });
    expect(out2.htmlBody).not.toContain("Hinweis vom Mandanten");
  });

  it("respects subject + body overrides from text_override Map", async () => {
    const overrides = new Map<string, string>([
      ["email.diagnose_report.subject", "Custom-Subject {partner}"],
      [
        "email.diagnose_report.body_md",
        "Liebe Kundin / Lieber Kunde,\n\nWir senden Ihnen den Bericht.\n\n_Steuerberater: {partner}_",
      ],
    ]);
    const out = await buildDiagnoseReportEmail(overrides, {
      partnerDisplayName: "Test Partner",
    });
    expect(out.subject).toBe("Custom-Subject Test Partner");
    expect(out.htmlBody).toContain("<em>Steuerberater: Test Partner</em>");
    expect(out.textBody).toContain("Wir senden Ihnen den Bericht.");
  });

  it("escapes markdown special chars in customMessage to prevent injection", async () => {
    const out = await buildDiagnoseReportEmail(EMPTY, {
      partnerDisplayName: "Test Partner",
      customMessage: "**bold_attempt** [link](https://evil.example/)",
    });
    // After remark-html, escaped chars stay as literal text, no HTML
    // injection — and no <a href> from the escaped attempt.
    expect(out.htmlBody).not.toContain('href="https://evil.example/"');
    // No <strong> tag in HTML from the escaped **bold** attempt.
    // The literal `**` stays as literal characters around the bold-attempt text.
    expect(out.htmlBody).not.toMatch(/<strong>bold[_\\]+attempt<\/strong>/);
    // The URL appears as literal text in textBody (not turned into a link)
    expect(out.textBody).toContain("evil.example");
  });
});
