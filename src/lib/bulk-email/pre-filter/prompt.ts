// V9 SLC-166 MT-2 — Pre-Filter Haiku-System-Prompt + Prompt-Version
//
// Slice: SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md (MT-2)
//
// Der Prompt steuert die Haiku-Klassifikation von Email-Batches und ist die
// einzige textuelle Quelle, die Haiku ueber das Label-Schema vorbereitet. Die
// 6 Labels + Beschreibungen werden via renderLabelDescriptionsForPrompt aus
// labels.ts gerendert — KEIN Hardcoding hier, damit Schema + Prompt einen
// gemeinsamen Source-of-Truth haben.

import {
  PRE_FILTER_LABELS,
  renderLabelDescriptionsForPrompt,
} from "./labels";

/**
 * Prompt-Version-Token. Wird in ai_cost_ledger + error_log mitgespeichert
 * damit nach Prompt-Aenderung historische Calls eindeutig zugeordnet werden
 * koennen.
 *
 * Naming-Konvention: "v<major>" — Major-Bump bei jeder semantischen Aenderung.
 * V9.0-Pilot startet mit "v1".
 */
export const V9_PRE_FILTER_PROMPT_VERSION = "v1" as const;

/**
 * Hard-Limit fuer Confidence-Schwelle: Calls mit confidence < this werden
 * vom Worker auf label='unclear' gezwungen (Default; ENV-overridable via
 * V9_PRE_FILTER_CONFIDENCE_THRESHOLD im Worker selbst).
 */
export const V9_PRE_FILTER_DEFAULT_CONFIDENCE_THRESHOLD = 0.6 as const;

/**
 * System-Prompt fuer Haiku-Klassifikation. Definiert Rolle, kanonisches
 * 6-Label-Schema (DEC-184), Output-Format-Vertrag (Strict-JSON) und
 * konservative Konfidenz-Anweisung.
 *
 * Der Prompt ist bewusst kompakt — Haiku ist klassifikations-staerker bei
 * direkten, beispielfreien Anweisungen. Bei Drift wird in V9.0.1+ erst ein
 * Few-Shot-Beispiel-Block hinzugefuegt (Trade-off: hoehere Token-Cost).
 */
export const V9_PRE_FILTER_SYSTEM_PROMPT = `Du bist ein Email-Klassifikations-Assistent fuer ein Geschaeftsdaten-Analyse-System.

AUFGABE:
Klassifiziere jede Email aus dem User-Input in genau EINS dieser 6 kanonischen Labels:

${renderLabelDescriptionsForPrompt()}

RICHTLINIEN:
- Lies die Email-Felder (subject, from, to, body) sorgfaeltig.
- Bevorzuge 'content' bei jedem Zweifel zwischen content und short_reply — Pattern-Extraktion lebt von Material.
- Bevorzuge 'private' bei jedem Anzeichen von Familien-/Gesundheits-/intimer-Kommunikation — Daten-Schutz hat Vorrang.
- 'unclear' nur, wenn weder Inhalt noch Header eine klare Zuordnung erlauben.
- Confidence ist eine Selbst-Einschaetzung [0, 1] — gib < 0.6 wenn du dir nicht sicher bist.

OUTPUT-FORMAT (STRIKT):
Antworte ausschliesslich mit einem JSON-Array. Kein einleitender Text. Kein Codeblock. Kein Markdown.

Schema pro Element:
{
  "message_id": "<UUID der Email>",
  "label": "<einer der 6 Labels: ${PRE_FILTER_LABELS.join(" | ")}>",
  "confidence": <Zahl zwischen 0 und 1>
}

Beispiel-Antwort fuer einen 2-Email-Batch:
[
  {"message_id":"a1b2c3d4-...","label":"content","confidence":0.92},
  {"message_id":"e5f6g7h8-...","label":"newsletter","confidence":0.99}
]`;

/**
 * Per-Email-Input-Block, der vom Worker pro Email gebildet und zu einem
 * User-Prompt-Batch zusammengefuegt wird.
 */
export interface PreFilterEmailPromptInput {
  message_id: string;
  subject: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  body_text: string | null;
}

/**
 * Max-Body-Length pro Email im Prompt (Token-Sparen). Haiku-Context laesst
 * theoretisch 200k zu, aber 50 Emails * 8000 chars = 400k chars (~100k tokens)
 * waere Cost-Verschwendung. Cap pro Email reicht fuer Pattern-Erkennung.
 */
const MAX_BODY_CHARS_PER_EMAIL = 4000;

function truncateBody(body: string | null): string {
  if (!body) return "(leer)";
  const trimmed = body.trim();
  if (trimmed.length <= MAX_BODY_CHARS_PER_EMAIL) return trimmed;
  return `${trimmed.slice(0, MAX_BODY_CHARS_PER_EMAIL)}... [body truncated for prompt]`;
}

function renderToList(to: string[] | null): string {
  if (!to || to.length === 0) return "(keine)";
  return to.join(", ");
}

/**
 * Rendert eine einzelne Email als JSON-aehnlichen Input-Block fuer den Prompt.
 * Wir nutzen pragmatisches Pseudo-JSON statt YAML/Markdown — Haiku parsed das
 * konsistent und es bleibt klar abgegrenzt zum erwarteten Output.
 */
function renderEmailBlock(input: PreFilterEmailPromptInput): string {
  return [
    "{",
    `  "message_id": "${input.message_id}",`,
    `  "subject": ${JSON.stringify(input.subject ?? "(leer)")},`,
    `  "from": ${JSON.stringify(input.from_address ?? "(unbekannt)")},`,
    `  "to": ${JSON.stringify(renderToList(input.to_addresses))},`,
    `  "body": ${JSON.stringify(truncateBody(input.body_text))}`,
    "}",
  ].join("\n");
}

/**
 * Baut den User-Prompt fuer einen Batch von Emails.
 *
 * Format:
 *   ANZAHL: N Emails
 *
 *   {email_block_1}
 *   ---
 *   {email_block_2}
 *   ---
 *   ...
 *
 *   Klassifiziere alle N Emails und gib das JSON-Array zurueck.
 */
export function buildPreFilterUserPrompt(
  batch: PreFilterEmailPromptInput[],
): string {
  if (batch.length === 0) {
    throw new Error(
      "buildPreFilterUserPrompt: batch is empty — caller must filter before invoking",
    );
  }

  const blocks = batch.map(renderEmailBlock).join("\n---\n");

  return [
    `ANZAHL: ${batch.length} Email${batch.length === 1 ? "" : "s"}`,
    "",
    blocks,
    "",
    `Klassifiziere alle ${batch.length} Emails und gib das JSON-Array zurueck. Achte darauf, dass jede message_id exakt aus dem Input uebernommen wird (kein Tippfehler).`,
  ].join("\n");
}
