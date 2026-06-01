// V8.1 SLC-163 MT-4 — Vitest fuer StB-Notification-Email-Template.

import { describe, it, expect } from "vitest";

import {
  buildStbNotificationEmail,
  type StbNotificationInput,
} from "../stb-notification";

const FIXTURE: StbNotificationInput = {
  captureSession: {
    mandant_name: "Max Muster",
    mandant_firma: "Muster Maschinenbau GmbH",
  },
  partner: {
    name: "Partner-Steuerberater XYZ",
    contact_email: "kontakt@partner-xyz.de",
  },
};

const TONALITY_BLACKLIST = [
  { pattern: /\bGlueckwunsch\b/i, label: "Glueckwunsch" },
  { pattern: /\bgratulier(e|en|t)\b/i, label: "gratuliere" },
  { pattern: /\bsuper\b/i, label: "super" },
  { pattern: /\bEuro\b/i, label: "Euro" },
  { pattern: /\bEUR\b/, label: "EUR" },
  { pattern: /\bKosten\b/i, label: "Kosten" },
  { pattern: /\bPreis(?!t)\b/i, label: "Preis" },
];

describe("StB-Notification-Email-Template (SLC-163 MT-4)", () => {
  it("subject contains firma", () => {
    const { subject } = buildStbNotificationEmail(FIXTURE);
    expect(subject).toBe(
      "Ihr Mandant Muster Maschinenbau GmbH hat Kontakt zu Strategaize aufgenommen",
    );
  });

  it("htmlBody contains mandant + firma + Strategaize-Footer", () => {
    const { htmlBody } = buildStbNotificationEmail(FIXTURE);
    expect(htmlBody).toContain("Max Muster");
    expect(htmlBody).toContain("Muster Maschinenbau GmbH");
    expect(htmlBody).toContain("Ihr Strategaize-Team");
    expect(htmlBody).toContain("strategaize.de/datenschutz");
    expect(htmlBody).toContain("strategaize.de/impressum");
    expect(htmlBody).toContain("Uebergabefaehigkeits-Diagnose V8.1");
  });

  it("textBody contains mandant + firma + Strategaize-Footer", () => {
    const { textBody } = buildStbNotificationEmail(FIXTURE);
    expect(textBody).toContain("Max Muster");
    expect(textBody).toContain("Muster Maschinenbau GmbH");
    expect(textBody).toContain("Ihr Strategaize-Team");
    expect(textBody).toContain("strategaize.de/datenschutz");
  });

  it("tonality: htmlBody contains no blacklisted patterns", () => {
    const { htmlBody } = buildStbNotificationEmail(FIXTURE);
    for (const { pattern, label } of TONALITY_BLACKLIST) {
      expect(
        htmlBody.match(pattern),
        `Blacklist hit "${label}" in htmlBody`,
      ).toBeNull();
    }
  });

  it("tonality: textBody contains no blacklisted patterns", () => {
    const { textBody } = buildStbNotificationEmail(FIXTURE);
    for (const { pattern, label } of TONALITY_BLACKLIST) {
      expect(
        textBody.match(pattern),
        `Blacklist hit "${label}" in textBody`,
      ).toBeNull();
    }
  });

  it("tonality: subject contains no blacklisted patterns", () => {
    const { subject } = buildStbNotificationEmail(FIXTURE);
    for (const { pattern, label } of TONALITY_BLACKLIST) {
      expect(
        subject.match(pattern),
        `Blacklist hit "${label}" in subject`,
      ).toBeNull();
    }
  });

  it("escapes HTML in user-provided mandant/firma names", () => {
    const { htmlBody } = buildStbNotificationEmail({
      ...FIXTURE,
      captureSession: {
        mandant_name: `<script>alert(1)</script>`,
        mandant_firma: `Acme & "Sons" GmbH`,
      },
    });
    expect(htmlBody).not.toContain("<script>alert(1)");
    expect(htmlBody).toContain("&lt;script&gt;");
    expect(htmlBody).toContain("Acme &amp;");
  });

  it("body is neutral-informativ — explicit 4-sentence structure", () => {
    const { textBody } = buildStbNotificationEmail(FIXTURE);
    // Pflicht-Kernaussagen
    expect(textBody).toContain("Wir informieren Sie als Partner-Steuerberater");
    expect(textBody).toContain("Strategaize wird sich direkt mit dem Mandanten");
    expect(textBody).toContain("Sie bleiben jederzeit Ansprechpartner");
    expect(textBody).toContain("info@strategaize.de");
  });
});
