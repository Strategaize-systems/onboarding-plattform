// V8.1 SLC-163 MT-3 — BD-Lead-Email-Template fuer Strategaize-Freigabe-CTA.
//
// Empfaenger: STRATEGAIZE_BD_EMAIL (Default bd@strategaizetransition.de).
// Format: semantic HTML + eingebetteter JSON-Block per DEC-168 fuer maschi-
// nelle Parser im Business-System-Posteingang. JSON-Block ist in HTML-Kommen-
// taren (<!-- STRATEGAIZE_LEAD_V1: {json} -->) versteckt, so dass er fuer
// menschliche Reader unsichtbar bleibt, fuer Email-Body-Parser aber leicht
// extrahierbar ist (regex-basiert oder DOM-parse).
//
// Plain-Text-Variant: gestrippte HTML-Version mit denselben Sections,
// JSON-Block am Ende als sichtbarer Block (fuer Plain-Text-Reader-Inboxen).
//
// Pattern-Quelle: src/lib/email/templates/mandanten-report-v8.ts (V8.0
// Mandanten-Report-Template-Pattern). Hier ohne text-override-Lookup —
// BD-Email-Format ist deterministisch, kein Override-Slot.

export const STRATEGAIZE_LEAD_SCHEMA_VERSION = "STRATEGAIZE_LEAD_V1";

export interface BdLeadEmailInput {
  captureSession: {
    id: string;
    mandant_email: string;
    mandant_name: string;
    mandant_firma: string;
    sui_score: number;
    drei_hebel_modul_namen: string[];
    diagnose_link_admin: string;
  };
  partner: {
    id: string;
    name: string;
  };
}

export interface BdLeadEmailOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
  jsonPayload: BdLeadJsonPayload;
}

export interface BdLeadJsonPayload {
  schema: typeof STRATEGAIZE_LEAD_SCHEMA_VERSION;
  capture_session_id: string;
  mandant_email: string;
  mandant_name: string;
  mandant_firma: string;
  partner_organization_id: string;
  partner_organization_name: string;
  sui_score: number;
  drei_hebel_modul_namen: string[];
  diagnose_link_admin: string;
  timestamp_iso: string;
  v8_version: "V8.1";
}

function buildJsonPayload(input: BdLeadEmailInput): BdLeadJsonPayload {
  return {
    schema: STRATEGAIZE_LEAD_SCHEMA_VERSION,
    capture_session_id: input.captureSession.id,
    mandant_email: input.captureSession.mandant_email,
    mandant_name: input.captureSession.mandant_name,
    mandant_firma: input.captureSession.mandant_firma,
    partner_organization_id: input.partner.id,
    partner_organization_name: input.partner.name,
    sui_score: input.captureSession.sui_score,
    drei_hebel_modul_namen: input.captureSession.drei_hebel_modul_namen,
    diagnose_link_admin: input.captureSession.diagnose_link_admin,
    timestamp_iso: new Date().toISOString(),
    v8_version: "V8.1",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBdLeadEmail(input: BdLeadEmailInput): BdLeadEmailOutput {
  const json = buildJsonPayload(input);
  const subject = `[OP-Lead] ${input.captureSession.mandant_firma} — Folgegespraech angefragt`;

  const hebelList = input.captureSession.drei_hebel_modul_namen
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");

  const htmlBody = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px; margin-bottom: 16px;">Strategaize-Lead — Folgegespraech angefragt</h1>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">Mandant</h2>
    <p style="margin: 4px 0;">
      <strong>${escapeHtml(input.captureSession.mandant_name)}</strong><br/>
      ${escapeHtml(input.captureSession.mandant_firma)}<br/>
      <a href="mailto:${escapeHtml(input.captureSession.mandant_email)}">${escapeHtml(input.captureSession.mandant_email)}</a>
    </p>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">Partner-Organisation</h2>
    <p style="margin: 4px 0;">${escapeHtml(input.partner.name)} (id: ${escapeHtml(input.partner.id)})</p>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">SUI-Score</h2>
    <p style="margin: 4px 0;">${json.sui_score.toFixed(1)} / 5.0</p>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">Drei priorisierte Hebel</h2>
    <ol style="margin: 4px 0; padding-left: 20px;">${hebelList}</ol>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">Diagnose-Link (Admin)</h2>
    <p style="margin: 4px 0;">
      <a href="${escapeHtml(input.captureSession.diagnose_link_admin)}">${escapeHtml(input.captureSession.diagnose_link_admin)}</a>
    </p>

    <h2 style="font-size: 16px; margin-top: 24px; margin-bottom: 8px;">Timestamp</h2>
    <p style="margin: 4px 0;">${json.timestamp_iso}</p>

    <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;"/>
    <p style="font-size: 11px; color: #6b7280; margin-top: 16px;">
      Diese Email enthaelt einen maschinenlesbaren JSON-Block. Strategaize-Lead-Schema-Version
      <code>${STRATEGAIZE_LEAD_SCHEMA_VERSION}</code>.
    </p>

    <!-- ${STRATEGAIZE_LEAD_SCHEMA_VERSION}: ${JSON.stringify(json)} -->
  </body>
</html>`;

  const textBody = [
    `Strategaize-Lead — Folgegespraech angefragt`,
    ``,
    `Mandant: ${input.captureSession.mandant_name}`,
    `Firma:   ${input.captureSession.mandant_firma}`,
    `Email:   ${input.captureSession.mandant_email}`,
    ``,
    `Partner-Organisation: ${input.partner.name} (id: ${input.partner.id})`,
    ``,
    `SUI-Score: ${json.sui_score.toFixed(1)} / 5.0`,
    ``,
    `Drei priorisierte Hebel:`,
    ...input.captureSession.drei_hebel_modul_namen.map(
      (n, i) => `  ${i + 1}. ${n}`,
    ),
    ``,
    `Diagnose-Link (Admin): ${input.captureSession.diagnose_link_admin}`,
    ``,
    `Timestamp: ${json.timestamp_iso}`,
    ``,
    `---`,
    ``,
    `Maschinenlesbarer Block (${STRATEGAIZE_LEAD_SCHEMA_VERSION}):`,
    JSON.stringify(json, null, 2),
  ].join("\n");

  return { subject, htmlBody, textBody, jsonPayload: json };
}

/**
 * Extracts the embedded `STRATEGAIZE_LEAD_V1: {json}` block from an HTML body.
 * Returns null if absent or unparseable. Used by Business-System-side parser
 * tests; production use lives in the BS-Repo.
 */
export function extractBdLeadJsonFromHtml(
  html: string,
): BdLeadJsonPayload | null {
  const m = html.match(
    /<!--\s*STRATEGAIZE_LEAD_V1:\s*(\{[\s\S]*?\})\s*-->/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as BdLeadJsonPayload;
  } catch {
    return null;
  }
}
