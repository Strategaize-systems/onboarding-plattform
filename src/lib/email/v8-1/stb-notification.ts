// V8.1 SLC-163 MT-4 — StB-Partner-Notification-Email-Template.
//
// Empfaenger: partner_organization.contact_email (per DEC-169). Silent-Skip
// im Orchestrator (MT-5) wenn contact_email leer ist.
//
// Tonalitaet: neutral-informativ (DEC-169) — keine Glueckwunsch-/Gratulations-
// Voice, keine Pricing-Hinweise, kein Anschein dass StB "ueberschritten" wird.
// Mock-Wording 2026-06-01 per User-Direktive eingesetzt; Final-Founder-
// Freigabe-Text wird vor V8.1-Release getauscht (ISSUE-085 dokumentiert).
//
// Tonality-Audit Pflicht-Verify: scripts/tonalitaet-audit-v8.mjs --scope=stb-
// notification (Blacklist Glueckwunsch|gratuliere|super|Euro|EUR|Kosten|Preis).

export interface StbNotificationInput {
  captureSession: {
    mandant_name: string;
    mandant_firma: string;
  };
  partner: {
    name: string;
    contact_email: string;
  };
}

export interface StbNotificationOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildStbNotificationEmail(
  input: StbNotificationInput,
): StbNotificationOutput {
  const subject = `Ihr Mandant ${input.captureSession.mandant_firma} hat Kontakt zu Strategaize aufgenommen`;

  const intro = `Wir informieren Sie als Partner-Steuerberater, dass Ihr Mandant ${input.captureSession.mandant_name} (${input.captureSession.mandant_firma}) heute den Kontakt zu Strategaize aufgenommen hat.`;
  const followUp = `Strategaize wird sich direkt mit dem Mandanten in Verbindung setzen, um ein Folgegespraech zur Diagnose abzustimmen.`;
  const role = `Sie bleiben jederzeit Ansprechpartner Ihres Mandanten — diese Benachrichtigung dient ausschliesslich Ihrer Information.`;
  const contact = `Bei Rueckfragen erreichen Sie uns unter info@strategaize.de.`;

  const htmlBody = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.6;">
    <p>Sehr geehrte Damen und Herren,</p>
    <p>${escapeHtml(intro)}</p>
    <p>${escapeHtml(followUp)}</p>
    <p>${escapeHtml(role)}</p>
    <p>${escapeHtml(contact)}</p>
    <p style="margin-top: 24px;">Mit freundlichen Gruessen<br/>Ihr Strategaize-Team</p>

    <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;"/>
    <p style="font-size: 11px; color: #6b7280; margin-top: 16px;">
      Strategaize · Uebergabefaehigkeits-Diagnose V8.1<br/>
      Datenschutz: strategaize.de/datenschutz · Impressum: strategaize.de/impressum
    </p>
  </body>
</html>`;

  const textBody = [
    `Sehr geehrte Damen und Herren,`,
    ``,
    intro,
    ``,
    followUp,
    ``,
    role,
    ``,
    contact,
    ``,
    `Mit freundlichen Gruessen`,
    `Ihr Strategaize-Team`,
    ``,
    `---`,
    ``,
    `Strategaize · Uebergabefaehigkeits-Diagnose V8.1`,
    `Datenschutz: strategaize.de/datenschutz · Impressum: strategaize.de/impressum`,
  ].join("\n");

  return { subject, htmlBody, textBody };
}
