// V9 SLC-166 MT-5 — PII-Email-Adapter (V5-Pipeline-Wrapper fuer Email-Threads).
//
// Slice: SLC-166 (V9 Pre-Filter + Thread-Aggregation + PII-Redaction)
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md (MT-5)
// DEC-176: V5-PII-Reuse + Email-Adapter (V5-Walkthrough-Pipeline ist Anker,
//   Email-spezifisches Pre-Processing davorgeschaltet)
//
// Aufgabe: Email-spezifische PII-Redaction in 4 Stufen:
//   1. Participant-Map bauen (P1/P2/... mit GF-Priority via Tenant-Domain)
//   2. Signatur-Entfernung per RegExp-Trigger
//   3. Participant-Email-Adressen im body_text durch Pseudonyme ersetzen
//   4. V5-Bedrock-PII-Prompt-Call mit Email-Hint im System-Prompt
//
// Pattern-Reuse (per .claude/rules/strategaize-pattern-reuse.md):
//   - V5 PII-Patterns + Prompt-Builder aus src/lib/ai/pii-patterns/index.ts +
//     src/lib/ai/prompts/walkthrough/pii_redact.ts (SLC-076..078)
//   - chatWithLLM-Call-Pattern aus src/workers/walkthrough/handle-redact-pii-job.ts
//     (Sonnet, eu-central-1, temperature=0 fuer Determinismus, maxTokens 8000)
//
// Wichtig — Spec sagt "V5-Bedrock-Haiku-PII-Pipeline", V5 nutzt aber Sonnet
// (chatWithLLM). Wir folgen V5-Pattern 1:1 (Pattern-Reuse-Rule BLOCKING) und
// behalten Sonnet. Cost-Optimierung auf Haiku ist als V9.1+-Verbesserung
// markierbar — Email-PII-Prompt braucht dann Plain-Text-Mode-Adapter.

import {
  buildPiiRedactSystemPrompt,
  buildPiiRedactUserMessage,
} from "@/lib/ai/prompts/walkthrough/pii_redact";
import { chatWithLLM } from "@/lib/llm";

import type { EmailThread } from "@/lib/bulk-email/thread-aggregation";

/**
 * Email-Felder, die fuer Redaction benoetigt werden. Subset von email_message.
 * (V9.0 nutzt body_text — body_html wird in V9.1+ supportet.)
 */
export interface EmailForRedaction {
  message_id: string;
  from_address: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  subject: string | null;
  date: string | null;
  body_text: string | null;
}

/**
 * Participant-Pseudonym-Map. Key = lowercased email-Adresse, Value = Pseudonym
 * ("P1", "P2", ...). Reihenfolge wird durch `pseudonymOrder` deterministisch
 * gehalten (Map-Iteration-Order ist Insertion-Order in JS, aber explicit Order
 * macht es testbar).
 */
export interface ParticipantMap {
  byEmail: Map<string, string>;
  pseudonymOrder: string[];
}

/**
 * Resultat von redactEmailThread.
 */
export interface RedactEmailThreadResult {
  participantMap: ParticipantMap;
  /** Voll-redacted Thread-Body, mehrere Emails konkateniert mit Separator. */
  redactedBody: string;
  /** Anzahl Bedrock-Input-Tokens (heuristic, fuer ai_cost_ledger in MT-6). */
  estimatedInputTokens: number;
  /** Anzahl Bedrock-Output-Tokens (heuristic, fuer ai_cost_ledger in MT-6). */
  estimatedOutputTokens: number;
  /** Laufzeit des Bedrock-Calls (ms). */
  callDurationMs: number;
}

/**
 * Options fuer redactEmailThread.
 */
export interface RedactEmailThreadOptions {
  /** Tenant-Email-Domain fuer GF-Priority (z.B. "firma.de"). Optional. */
  tenantDomain?: string;
  /**
   * Test-Hook fuer Bedrock-Call. Wenn gesetzt, wird statt chatWithLLM diese
   * Funktion aufgerufen. Production setzt das nicht.
   */
  chatCaller?: typeof chatWithLLM;
}

// ──────────────────────────────────────────────────────────────────────────────
// Signature-Stripping
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Trigger-RegExps fuer Signatur-Erkennung. Wenn eine Zeile matched, wird die
 * Trigger-Zeile + die naechsten N Zeilen abgeschnitten (vom Body entfernt).
 *
 * Trigger sind common deutsche + englische Signatur-Marker. False-positives
 * sind moeglich (z.B. "Mit freundlichen Gruessen Max — bitte um Rueckmeldung"
 * im Mittelteil eines Satzes), aber V9.0 akzeptiert das per Spec-Trade-off.
 */
const SIGNATURE_TRIGGER_REGEXES = [
  /^--\s*$/m, // RFC-3676 sig delimiter
  /^Mit\s+(freundlichen|besten)\s+Gr(ue|ü)(ss|ß)en\b/im,
  /^Viele\s+Gr(ue|ü)(ss|ß)e\b/im,
  /^Beste\s+Gr(ue|ü)(ss|ß)e\b/im,
  /^Best\s+regards\b/im,
  /^Kind\s+regards\b/im,
  /^Regards\b/im,
];

/**
 * Anzahl Zeilen nach dem Trigger, die ebenfalls als Signatur betrachtet und
 * entfernt werden. 3 ist Heuristik (Name + Titel + Kontaktdaten = typische
 * Signatur). Spec L156.
 */
const SIGNATURE_DROP_LINES_AFTER_TRIGGER = 3;

/**
 * Entfernt Signatur-Block aus body_text. Nimmt erste Trigger-Zeile + N Folge-
 * Zeilen weg. Returnt cleaned text.
 *
 * Idempotenz: zweimaliges Anwenden ohne Effekt (alle Trigger schon weg).
 *
 * Edge-Cases:
 *   - Null/empty body → returnt "" (cleaner als null fuer Caller)
 *   - Kein Trigger gefunden → unveraenderter Body
 *   - Trigger am Body-Anfang → entfernt erste Block, alles danach unangetastet
 */
export function stripSignature(bodyText: string | null): string {
  if (!bodyText) return "";
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) return "";

  const lines = trimmed.split("\n");

  // Finde erstes Trigger-Match (line-index).
  let triggerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const re of SIGNATURE_TRIGGER_REGEXES) {
      if (re.test(line)) {
        triggerLineIndex = i;
        break;
      }
    }
    if (triggerLineIndex !== -1) break;
  }

  if (triggerLineIndex === -1) {
    return trimmed;
  }

  // Behalte lines vor dem Trigger + verwerfe Trigger + N Folge-Zeilen.
  const cutoffEnd = triggerLineIndex + 1 + SIGNATURE_DROP_LINES_AFTER_TRIGGER;
  const remaining = [
    ...lines.slice(0, triggerLineIndex),
    ...lines.slice(cutoffEnd),
  ];
  return remaining.join("\n").trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Participant-Map
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Email-Adresse normalisieren (lowercase, trim, "<addr>" → "addr"). Returns
 * null bei Empty.
 */
function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  let s = email.trim().toLowerCase();
  // RFC-5322 angle-bracket: "<addr>" → "addr"
  const angleMatch = s.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    s = angleMatch[1].trim().toLowerCase();
  }
  if (s.length === 0) return null;
  return s;
}

/**
 * Sammelt alle eindeutigen Email-Adressen aus from + to + cc ueber alle Emails
 * in Eingabe-Reihenfolge (deterministisch). Pseudonyme P1, P2, ... vergeben in
 * dieser Reihenfolge.
 *
 * GF-Priority: Wenn `tenantDomain` gesetzt ist und eine Adresse auf
 * `@tenantDomain` endet, kriegt sie P1 (auch wenn sie nicht als erste auftritt).
 * Weitere tenant-domain-Adressen behalten ihre first-seen-Reihenfolge ab P2.
 */
export function extractParticipantMap(
  emails: EmailForRedaction[],
  tenantDomain?: string,
): ParticipantMap {
  const byEmail = new Map<string, string>();
  const pseudonymOrder: string[] = [];

  const tenantSuffix = tenantDomain ? `@${tenantDomain.toLowerCase()}` : null;
  const seenInOrder: string[] = [];

  // Pass 1: alle Adressen in Reihenfolge sammeln (de-duplizieren).
  for (const e of emails) {
    const addrs: Array<string | null> = [
      normalizeEmail(e.from_address),
      ...((e.to_addresses ?? []).map(normalizeEmail)),
      ...((e.cc_addresses ?? []).map(normalizeEmail)),
    ];
    for (const a of addrs) {
      if (a && !seenInOrder.includes(a)) {
        seenInOrder.push(a);
      }
    }
  }

  // Pass 2: Reihenfolge ordnen (Tenant-Domain zuerst, dann Rest in seen-Order).
  let ordered: string[];
  if (tenantSuffix) {
    const tenants = seenInOrder.filter((a) => a.endsWith(tenantSuffix));
    const externals = seenInOrder.filter((a) => !a.endsWith(tenantSuffix));
    ordered = [...tenants, ...externals];
  } else {
    ordered = seenInOrder;
  }

  // Pass 3: Pseudonyme P1, P2, ... vergeben.
  for (let i = 0; i < ordered.length; i++) {
    const addr = ordered[i]!;
    const pseudonym = `P${i + 1}`;
    byEmail.set(addr, pseudonym);
    pseudonymOrder.push(pseudonym);
  }

  return { byEmail, pseudonymOrder };
}

// ──────────────────────────────────────────────────────────────────────────────
// Body-Replacement
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Escape special regex characters in a string fuer literal-match.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ersetzt im body_text alle Email-Adressen aus map durch ihre Pseudonyme.
 * Case-insensitive Match auf die literale Adresse.
 *
 * Behandelt Angle-Bracket-Form ("<addr>" → "<P1>") nicht — Body-Text sollte
 * keine Angle-Brackets enthalten (das sind Header-Felder). Wenn doch, bleibt
 * die Bracket-Form unmaskiert; LLM-Call fixt das.
 *
 * Returns cleaned text.
 */
export function replaceParticipantsInBody(
  bodyText: string,
  map: ParticipantMap,
): string {
  if (!bodyText || map.byEmail.size === 0) return bodyText;

  let out = bodyText;
  // Sortiere Email-Adressen nach Laenge desc, damit laengere Matches Vorrang
  // haben (z.B. "max.mueller@firma.de" vor "@firma.de").
  const sortedEntries = [...map.byEmail.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [email, pseudonym] of sortedEntries) {
    const re = new RegExp(escapeRegex(email), "gi");
    out = out.replace(re, pseudonym);
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// V5-PII-Bedrock-Call mit Email-Hint
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Format die Participant-Liste fuer den Email-Hint im System-Prompt.
 */
function formatParticipantListForPrompt(map: ParticipantMap): string {
  const entries: string[] = [];
  for (const [email, pseudonym] of map.byEmail) {
    entries.push(`  - ${pseudonym}: ${email}`);
  }
  return entries.join("\n");
}

/**
 * Erweitert den V5-PII-System-Prompt um einen Email-spezifischen Hint mit
 * der Participant-Pseudonym-Liste. Der V5-Prompt selbst (Patterns + Regeln
 * + Output-Format) bleibt unveraendert — wir haengen einen 9-Zeilen-Block an.
 */
export function buildEmailRedactSystemPrompt(map: ParticipantMap): string {
  const base = buildPiiRedactSystemPrompt();
  const participantList = formatParticipantListForPrompt(map);

  const emailHint = `

ZUSAETZLICHE REGELN FUER EMAIL-THREADS:
8. Im Eingabe-Text sind Email-Adressen der Thread-Teilnehmer bereits durch Pseudonyme (P1, P2, ...) ersetzt. Behalte diese Pseudonyme im Output exakt bei — NICHT durch [KUNDE] oder [EMAIL] uebersetzen.
9. Wenn du im Eingabe-Text Klarnamen findest, die einem Pseudonym aus der untenstehenden Liste zugeordnet werden koennen (z.B. weil sie als Email-Adresse genannt werden), ersetze sie durch das passende Pseudonym statt durch [KUNDE].

PARTICIPANT-LISTE:
${participantList}`;

  return base + emailHint;
}

/**
 * Baut den User-Message-Body fuer Bedrock: konkateniert alle Emails mit
 * redacted Headers (From/To/Date als Pseudonym + ISO-Date) und body-text
 * (signature-stripped + participant-replaced).
 */
export function buildEmailRedactUserMessage(
  emails: EmailForRedaction[],
  map: ParticipantMap,
): string {
  const blocks: string[] = [];
  for (let i = 0; i < emails.length; i++) {
    const e = emails[i]!;
    const fromAddr = normalizeEmail(e.from_address);
    const toAddrs = (e.to_addresses ?? []).map(normalizeEmail).filter(Boolean) as string[];
    const fromPseudonym = fromAddr ? (map.byEmail.get(fromAddr) ?? "[EMAIL]") : "[EMAIL]";
    const toPseudonyms = toAddrs.map((a) => map.byEmail.get(a) ?? "[EMAIL]").join(", ");

    const cleanedBody = replaceParticipantsInBody(
      stripSignature(e.body_text ?? ""),
      map,
    );

    blocks.push(
      [
        `=== Email ${i + 1} ===`,
        `From: ${fromPseudonym}`,
        `To: ${toPseudonyms || "(keine)"}`,
        e.date ? `Date: ${e.date}` : "Date: (unbekannt)",
        "",
        cleanedBody,
      ].join("\n"),
    );
  }
  return blocks.join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator: redactEmailThread
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Vollstaendiger Email-Thread-Redaction-Flow:
 *   1. Participant-Map mit GF-Priority bauen.
 *   2. User-Message bauen (concat Emails + Headers-as-Pseudonyms + cleaned bodies).
 *   3. System-Prompt mit V5-Patterns + Email-Hint bauen.
 *   4. chatWithLLM mit temperature=0 + maxTokens 8000 (V5-Pattern).
 *   5. Return result + token-Heuristik + duration.
 *
 * Bei Bedrock-Empty-Response: throw Error.
 * Bei Bedrock-API-Fehler: throw original Error.
 */
export async function redactEmailThread(
  thread: EmailThread,
  emails: EmailForRedaction[],
  options?: RedactEmailThreadOptions,
): Promise<RedactEmailThreadResult> {
  // Filter Emails auf die im Thread, in thread.message_ids-Reihenfolge.
  // Falls Caller schon vorgefiltert hat, ist das idempotent.
  const messageIdsInOrder = thread.message_ids;
  const emailById = new Map<string, EmailForRedaction>();
  for (const e of emails) emailById.set(e.message_id, e);
  const threadEmails: EmailForRedaction[] = [];
  for (const mid of messageIdsInOrder) {
    const e = emailById.get(mid);
    if (e) threadEmails.push(e);
  }

  if (threadEmails.length === 0) {
    throw new Error(
      `redactEmailThread: thread ${thread.root_message_id} hat keine matching emails`,
    );
  }

  const participantMap = extractParticipantMap(threadEmails, options?.tenantDomain);
  const systemPrompt = buildEmailRedactSystemPrompt(participantMap);
  const concatBody = buildEmailRedactUserMessage(threadEmails, participantMap);
  const userMessage = buildPiiRedactUserMessage(concatBody);

  const caller = options?.chatCaller ?? chatWithLLM;

  const callStart = Date.now();
  const redactedText = await caller(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0, maxTokens: 8000 },
  );
  const callDurationMs = Date.now() - callStart;

  const trimmed = (redactedText ?? "").trim();
  if (!trimmed) {
    throw new Error(
      `redactEmailThread: Bedrock returned empty text fuer thread ${thread.root_message_id}`,
    );
  }

  // Token-Heuristik (V5-Worker-Pattern, Sonnet-typisch ~4 chars/token).
  const estimatedInputTokens = Math.ceil(
    (systemPrompt.length + userMessage.length) / 4,
  );
  const estimatedOutputTokens = Math.ceil(trimmed.length / 4);

  return {
    participantMap,
    redactedBody: trimmed,
    estimatedInputTokens,
    estimatedOutputTokens,
    callDurationMs,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test-only exports
// ──────────────────────────────────────────────────────────────────────────────

export const __testing = {
  SIGNATURE_TRIGGER_REGEXES,
  SIGNATURE_DROP_LINES_AFTER_TRIGGER,
  normalizeEmail,
  formatParticipantListForPrompt,
};
