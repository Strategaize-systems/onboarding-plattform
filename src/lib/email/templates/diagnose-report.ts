// SLC-141 MT-3 (FEAT-060) — Email-Template fuer Diagnose-Bericht-Versand.
//
// Subject + Body via FEAT-055-Override editierbar. Subject ist Plain-Text-
// Template ("{partner}" Variable wird ersetzt). Body ist Markdown → HTML via
// remark@15 + remark-html@16 (server-side renderer pro
// feedback_email_render_remark_pattern). Plain-Text-Variante via
// strip-markdown@6.
//
// Returns `{ subject, htmlBody, textBody }`. Der Caller (MT-4 Server-Action)
// passt die Felder an SendMailParams (`html`/`text`) an.
//
// Kein PDF-Inhalt — das Attachment wird im Caller aus MT-2
// renderDiagnoseReportPdf erzeugt + an sendMail dazu gehaengt.

import { remark } from "remark";
import remarkHtml from "remark-html";
import strip from "strip-markdown";

import { resolveText } from "@/lib/text-override/resolver";

const RESOLVE_KEY_SUBJECT = "email.diagnose_report.subject";
const RESOLVE_KEY_BODY_MD = "email.diagnose_report.body_md";

const DEFAULT_SUBJECT = "Ihr StrategAIze Diagnose-Bericht — {partner}";

const DEFAULT_BODY_MD = `Guten Tag,

anbei finden Sie Ihren persoenlichen **Diagnose-Bericht** aus dem StrategAIze-Werkzeug.

Der Bericht ist als **PDF-Anhang** beigefuegt und enthaelt eine strukturierte Selbsteinschaetzung Ihrer Unternehmens-Reife entlang sechs Bausteine.

{custom_message}

Bei Fragen melden Sie sich gern bei Ihrem Steuerberater {partner}.

Mit freundlichen Gruessen
Ihr StrategAIze-Team`;

export interface DiagnoseReportEmailOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface BuildDiagnoseReportEmailInput {
  /** Display-Name des Partners (z.B. "Kanzlei Mueller & Partner"). */
  partnerDisplayName: string;
  /** Optionale freitext-Custom-Message vom Mandanten (max 500 chars).
   *  Wird im Body als eigener Paragraph eingefuegt. Plain-Text-Annahme —
   *  MD-Sonderzeichen werden escaped, damit kein Markdown-Injection
   *  passiert. */
  customMessage?: string;
}

function escapeMarkdown(input: string): string {
  // Minimaler MD-Escape: backslashes vor Sonderzeichen, damit der String
  // im Markdown-Body als literal Text gerendert wird.
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
 * Baut Subject + HTML- + Plain-Text-Variante des Diagnose-Report-Emails.
 *
 * @param overrides Map aus loadEmailOverridesMap() — leer = Default-Texte.
 * @param input.partnerDisplayName Display-Name des Partners.
 * @param input.customMessage Optional. Wird in den Body als
 *                            "**Hinweis vom Mandanten:**\n\n{escaped}"
 *                            eingefuegt, oder leer wenn nicht angegeben.
 */
export async function buildDiagnoseReportEmail(
  overrides: ReadonlyMap<string, string>,
  input: BuildDiagnoseReportEmailInput,
): Promise<DiagnoseReportEmailOutput> {
  const subjectTemplate = resolveText(overrides, RESOLVE_KEY_SUBJECT, DEFAULT_SUBJECT);
  const subject = subjectTemplate.replace("{partner}", input.partnerDisplayName);

  const bodyMdTemplate = resolveText(overrides, RESOLVE_KEY_BODY_MD, DEFAULT_BODY_MD);

  const customBlock =
    input.customMessage && input.customMessage.trim().length > 0
      ? `**Hinweis vom Mandanten:**\n\n${escapeMarkdown(input.customMessage.trim())}`
      : "";

  const bodyMd = bodyMdTemplate
    .replace("{partner}", input.partnerDisplayName)
    .replace("{custom_message}", customBlock);

  const [htmlBody, textBody] = await Promise.all([
    markdownToHtml(bodyMd),
    markdownToPlainText(bodyMd),
  ]);

  return { subject, htmlBody, textBody };
}
