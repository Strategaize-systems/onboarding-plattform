// V8 SLC-152 MT-1 (FEAT-066 AC-13) — Email-Template fuer V8 Mandanten-Report.
//
// 1:1-Pattern aus V7.2 templates/diagnose-report.ts (FEAT-060) per
// [[strategaize-pattern-reuse]] uebertragen. Unterschiede zu V7.2:
//   - Mandant-direkt-Adressat (NICHT Partner/StB)
//   - BL-133 Pflicht-Hinweis: "Sie koennen den Bericht an Ihren Steuerberater
//     weiterleiten" (Founder-Direktive 2026-05-29).
//   - Strategaize-Default-Footer-Pflicht (Datenschutz + Impressum).
//
// Returns `{ subject, htmlBody, textBody }`. Der Caller passt die Felder an
// SendMailParams (`html`/`text`) an. Das PDF-Anhang wird im Caller via
// renderMandantenReportV2Pdf (SLC-150/151) erzeugt.

import { remark } from "remark";
import remarkHtml from "remark-html";
import strip from "strip-markdown";

import { resolveText } from "@/lib/text-override/resolver";

const RESOLVE_KEY_SUBJECT = "email.mandanten_report_v8.subject";
const RESOLVE_KEY_BODY_MD = "email.mandanten_report_v8.body_md";

const DEFAULT_SUBJECT = "Ihre Strategaize-Diagnose — Wo Ihre Firma heute steht";

// BL-133 Pflicht-Hinweis als zentrale Konstante damit Vitest-Snapshot-Test
// (AC-SLC-152-1) den Hinweis verlaesslich findet und ein Drift im Body sofort
// rot wird.
export const BL_133_WEITERLEITUNGS_HINWEIS =
  "Sie koennen diesen Bericht an Ihren Steuerberater weiterleiten — er kennt Ihre steuerlichen Strukturen und kann Modul 0 + Modul 10 mit Ihnen besprechen. Diese Diagnose ist Ihre Entscheidung, wer sie sieht.";

const DEFAULT_BODY_MD = `Guten Tag,

Sie haben den Strategaize-Uebergabe-Fragebogen durchlaufen. Im Anhang finden Sie Ihren persoenlichen Bericht — **Sie sind Eigentuemer dieses Berichts**.

Der vollstaendige Bericht ist als **PDF im Anhang** dieser E-Mail. Er zeigt Ihren SUI-Score (Strukturelle Uebergabefaehigkeits-Index), die Reife-Stufe pro Modul, drei priorisierte Hebel und Ihre Reflexion zum Modul "Vermaechtnis".

{custom_message}

${BL_133_WEITERLEITUNGS_HINWEIS}

Bei Fragen oder fuer ein Folgegespraech melden Sie sich gern bei uns.

Mit freundlichen Gruessen
Ihr Strategaize-Team

---

Strategaize · Uebergabefaehigkeits-Diagnose V8.0
Datenschutz: strategaize.de/datenschutz · Impressum: strategaize.de/impressum
`;

export interface MandantenReportV8EmailOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface BuildMandantenReportV8EmailInput {
  /** Optionale freitext-Custom-Message vom Mandanten (max 500 chars).
   *  Wird im Body als eigener Paragraph eingefuegt. Plain-Text-Annahme —
   *  MD-Sonderzeichen werden escaped, damit kein Markdown-Injection
   *  passiert. */
  customMessage?: string;
}

function escapeMarkdown(input: string): string {
  return input.replace(/([\\`*_{}\[\]()#+\-!>])/g, "\\$1");
}

async function markdownToHtml(md: string): Promise<string> {
  const file = await remark().use(remarkHtml).process(md);
  return String(file);
}

async function markdownToPlainText(md: string): Promise<string> {
  const file = await remark().use(strip).process(md);
  return String(file).trim();
}

/**
 * Baut Subject + HTML- + Plain-Text-Variante des V8 Mandanten-Report-Emails.
 *
 * @param overrides Map aus loadEmailOverridesMap() — leer = Default-Texte.
 * @param input.customMessage Optional. Wird in den Body als
 *                            "**Hinweis vom Mandanten:**\n\n{escaped}"
 *                            eingefuegt, oder leer wenn nicht angegeben.
 */
export async function buildMandantenReportV8Email(
  overrides: ReadonlyMap<string, string>,
  input: BuildMandantenReportV8EmailInput,
): Promise<MandantenReportV8EmailOutput> {
  const subject = resolveText(overrides, RESOLVE_KEY_SUBJECT, DEFAULT_SUBJECT);
  const bodyMdTemplate = resolveText(overrides, RESOLVE_KEY_BODY_MD, DEFAULT_BODY_MD);

  const customBlock =
    input.customMessage && input.customMessage.trim().length > 0
      ? `**Hinweis vom Mandanten:**\n\n${escapeMarkdown(input.customMessage.trim())}`
      : "";

  const bodyMd = bodyMdTemplate.replace("{custom_message}", customBlock);

  const [htmlBody, textBody] = await Promise.all([
    markdownToHtml(bodyMd),
    markdownToPlainText(bodyMd),
  ]);

  return { subject, htmlBody, textBody };
}
