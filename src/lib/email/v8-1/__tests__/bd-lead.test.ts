// V8.1 SLC-163 MT-3 — Vitest fuer BD-Lead-Email-Template.

import { describe, it, expect } from "vitest";

import {
  buildBdLeadEmail,
  extractBdLeadJsonFromHtml,
  STRATEGAIZE_LEAD_SCHEMA_VERSION,
  type BdLeadEmailInput,
} from "../bd-lead";

const FIXTURE: BdLeadEmailInput = {
  captureSession: {
    id: "cs-uuid-fixture-001",
    mandant_email: "max.muster@example-firma.de",
    mandant_name: "Max Muster",
    mandant_firma: "Muster Maschinenbau GmbH",
    sui_score: 2.7,
    drei_hebel_modul_namen: [
      "Modul 4 — Operative Skalierbarkeit",
      "Modul 7 — Finanzielle Transparenz",
      "Modul 6 — Vertrieb & Kunden",
    ],
    diagnose_link_admin:
      "https://onboarding.strategaizetransition.com/admin/diagnose/cs-uuid-fixture-001",
  },
  partner: {
    id: "po-uuid-fixture-001",
    name: "Partner-Steuerberater XYZ",
  },
};

describe("BD-Lead-Email-Template (SLC-163 MT-3)", () => {
  it("subject contains firma + standard prefix/suffix", () => {
    const { subject } = buildBdLeadEmail(FIXTURE);
    expect(subject).toBe(
      "[OP-Lead] Muster Maschinenbau GmbH — Folgegespraech angefragt",
    );
  });

  it("htmlBody contains all semantic sections", () => {
    const { htmlBody } = buildBdLeadEmail(FIXTURE);
    expect(htmlBody).toContain("Strategaize-Lead");
    expect(htmlBody).toContain("Max Muster");
    expect(htmlBody).toContain("Muster Maschinenbau GmbH");
    expect(htmlBody).toContain("max.muster@example-firma.de");
    expect(htmlBody).toContain("Partner-Steuerberater XYZ");
    expect(htmlBody).toContain("po-uuid-fixture-001");
    expect(htmlBody).toContain("2.7");
    expect(htmlBody).toContain("Modul 4 — Operative Skalierbarkeit");
    expect(htmlBody).toContain("Modul 7 — Finanzielle Transparenz");
    expect(htmlBody).toContain("Modul 6 — Vertrieb & Kunden");
    expect(htmlBody).toContain("onboarding.strategaizetransition.com/admin");
  });

  it("htmlBody contains embedded JSON-Block (STRATEGAIZE_LEAD_V1)", () => {
    const { htmlBody } = buildBdLeadEmail(FIXTURE);
    expect(htmlBody).toContain(`<!-- ${STRATEGAIZE_LEAD_SCHEMA_VERSION}:`);
    const extracted = extractBdLeadJsonFromHtml(htmlBody);
    expect(extracted).not.toBeNull();
    if (extracted) {
      expect(extracted.schema).toBe(STRATEGAIZE_LEAD_SCHEMA_VERSION);
      expect(extracted.capture_session_id).toBe("cs-uuid-fixture-001");
      expect(extracted.mandant_email).toBe("max.muster@example-firma.de");
      expect(extracted.mandant_name).toBe("Max Muster");
      expect(extracted.mandant_firma).toBe("Muster Maschinenbau GmbH");
      expect(extracted.partner_organization_id).toBe("po-uuid-fixture-001");
      expect(extracted.partner_organization_name).toBe(
        "Partner-Steuerberater XYZ",
      );
      expect(extracted.sui_score).toBe(2.7);
      expect(extracted.drei_hebel_modul_namen).toEqual(
        FIXTURE.captureSession.drei_hebel_modul_namen,
      );
      expect(extracted.v8_version).toBe("V8.1");
      expect(extracted.timestamp_iso).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    }
  });

  it("textBody contains all sections + JSON-Block in plain-text", () => {
    const { textBody } = buildBdLeadEmail(FIXTURE);
    expect(textBody).toContain("Strategaize-Lead");
    expect(textBody).toContain("Max Muster");
    expect(textBody).toContain("Muster Maschinenbau GmbH");
    expect(textBody).toContain("SUI-Score: 2.7");
    expect(textBody).toContain("1. Modul 4 — Operative Skalierbarkeit");
    expect(textBody).toContain("2. Modul 7 — Finanzielle Transparenz");
    expect(textBody).toContain("3. Modul 6 — Vertrieb & Kunden");
    expect(textBody).toContain(STRATEGAIZE_LEAD_SCHEMA_VERSION);
    // JSON-Block am Ende ist parsbar
    const jsonStart = textBody.indexOf("{");
    expect(jsonStart).toBeGreaterThan(0);
    const parsed = JSON.parse(textBody.slice(jsonStart));
    expect(parsed.schema).toBe(STRATEGAIZE_LEAD_SCHEMA_VERSION);
  });

  it("escapes HTML in user-provided fields in visible sections", () => {
    const malicious = buildBdLeadEmail({
      ...FIXTURE,
      captureSession: {
        ...FIXTURE.captureSession,
        mandant_name: `<script>alert("xss")</script>`,
        mandant_firma: `Acme & Sons "Ltd"`,
      },
    });
    // Strip out the JSON-block (HTML-comment) to check only the visible
    // HTML sections — the JSON-block intentionally carries raw values.
    const visibleHtml = malicious.htmlBody.replace(
      /<!--\s*STRATEGAIZE_LEAD_V1:[\s\S]*?-->/,
      "",
    );
    expect(visibleHtml).not.toContain("<script>alert");
    expect(visibleHtml).toContain("&lt;script&gt;");
    expect(visibleHtml).toContain("Acme &amp; Sons");
  });

  it("jsonPayload schema-version is STRATEGAIZE_LEAD_V1", () => {
    const { jsonPayload } = buildBdLeadEmail(FIXTURE);
    expect(jsonPayload.schema).toBe(STRATEGAIZE_LEAD_SCHEMA_VERSION);
    expect(jsonPayload.v8_version).toBe("V8.1");
  });

  it("extractBdLeadJsonFromHtml returns null for non-matching HTML", () => {
    expect(extractBdLeadJsonFromHtml("<p>no marker here</p>")).toBeNull();
    expect(
      extractBdLeadJsonFromHtml(
        "<!-- STRATEGAIZE_LEAD_V1: not-valid-json -->",
      ),
    ).toBeNull();
  });
});
