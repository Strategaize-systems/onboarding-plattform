import { describe, it, expect } from "vitest";

import { renderSignupVerifyTemplate } from "../email";

const baseInput = {
  partner_display_name: "Kanzlei Mueller & Partner",
  partner_contact_email: "kontakt@kanzlei-mueller.de",
  verify_url:
    "https://onboarding.strategaizetransition.com/auth/verify-signup?token=abc123-deadbeef",
  expires_at_iso: "2026-05-19T11:30:00.000Z",
  recipient_first_name: "Alice",
};

describe("renderSignupVerifyTemplate (V7 SLC-132 MT-5)", () => {
  it("subject contains partner_display_name + Strategaize-Zugang phrase", () => {
    const { subject } = renderSignupVerifyTemplate(baseInput);
    expect(subject).toContain(baseInput.partner_display_name);
    expect(subject).toMatch(/Strategaize-Zugang/);
  });

  it("HTML body contains the verify_url + recipient first name + expiry date", () => {
    const { html } = renderSignupVerifyTemplate(baseInput);
    expect(html).toContain(baseInput.verify_url);
    expect(html).toContain(baseInput.recipient_first_name);
    expect(html).toContain(baseInput.partner_display_name);
    // German formatted date should include the month name
    expect(html).toMatch(/Mai/);
    // Datenschutz link (DSGVO requirement) must be present
    expect(html).toContain("/datenschutz");
  });

  it("plain-text body contains verify_url + 24h hint + Datenschutz line", () => {
    const { text } = renderSignupVerifyTemplate(baseInput);
    expect(text).toContain(baseInput.verify_url);
    expect(text).toContain("24 Stunden");
    expect(text).toMatch(/Datenschutz/);
    // Plain-text must not contain HTML markup
    expect(text).not.toContain("<a ");
    expect(text).not.toContain("<div");
  });

  it("renders with null partner_contact_email (used only as reply-to by caller)", () => {
    const { subject, html, text } = renderSignupVerifyTemplate({
      ...baseInput,
      partner_contact_email: null,
    });
    expect(subject).toBeTruthy();
    expect(html).toContain(baseInput.verify_url);
    expect(text).toContain(baseInput.verify_url);
  });
});
