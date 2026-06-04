// V9 SLC-167 MT-2 — Email-Pattern-Extraktion System-Prompt + Prompt-Versions-Anker
//
// Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-2 Expected behavior)
// DECs: DEC-176 (V5-PII-Reuse — Pseudonym-Konvention P1/P2),
//       DEC-181 (V4.1-Sections-Default + "Andere..."-Free-Text)
//
// Pattern-Reuse aus src/lib/llm/v8-1-augmentation/prompt.ts:
//   - V8_1_PROMPT_VERSION-Konstanten-Pattern (Versionierung fuer Cache-Invalidation
//     in V9.1+ wenn Prompt-A/B-Tests dazukommen)
//   - Strategaize-Wir-Voice-Vorgaben
//
// Vorgaben (FEAT-073 + DEC-176 + DEC-181):
//   - Strategaize-Wir-Voice (verkaufsfrei, sachlich, kein Marketing)
//   - Pseudonym-Konvention: P1 = Kunde / Gegenueber, P2 = GF / Tenant-Admin
//   - Keine Pricing-Hinweise (Cost-Cap-Pflicht — kein Prompt-Engineering um Cap zu umgehen)
//   - Max 5 Pattern pro Thread (Curation-Fatigue-Vermeidung)
//   - suggested_section: V4.1-Section-Pfad-Konvention "<bereich>/<unterthema>"
//     (z.B. "vertrieb/einwand-behandlung") oder "andere" wenn unklar

/**
 * Prompt-Version Anker — wird in ai_cost_ledger.metadata mitgespeichert
 * fuer Cache-Invalidation in V9.1+ (A/B-Tests, Prompt-Refinements).
 * Aenderung dieser Konstante invalidiert implizit alle Cache-Keys.
 */
export const V9_PATTERN_PROMPT_VERSION = "v1.0.0-2026-06-04";

/**
 * System-Prompt fuer Sonnet Pattern-Extraktion pro Thread.
 * Striktes JSON-Output-Format. Modell antwortet AUSSCHLIESSLICH mit dem
 * JSON-Objekt — keine Markdown-Codeblocks, kein Prefix, kein Postfix.
 */
export const V9_PATTERN_SYSTEM_PROMPT = [
  "Du bist ein Geschaeftsanalyst, der Email-Threads zwischen einem Unternehmen (GF) und seinen Kunden (P1) auswertet. Deine Aufgabe: identifiziere wiederkehrende Antwort-Muster, Themen, Entscheidungen und offene Fragen, die spaeter als Bausteine fuer ein Unternehmenshandbuch verwendet werden.",
  "",
  "**Wichtige Vorgaben:**",
  "- Du arbeitest mit pseudonymisierten Texten: P1 = Kunde / externer Gegenueber, P2 = GF / Unternehmensvertreter. Es gibt KEINE Klarnamen, keine Email-Adressen, keine Telefonnummern. Wenn du dennoch unredigierte PII siehst, ignoriere sie und schreibe sie NICHT in dein Output.",
  "- Schreibe in Strategaize-Wir-Voice: sachlich, verkaufsfrei, kein Marketing-Sprech. Beispiel: NICHT 'unser hervorragender Service', SONDERN 'wir antworten innerhalb von 24h'.",
  "- Mache KEINE Pricing-Hinweise und KEINE Preisvergleiche im Output (Cost-Cap-Vorgabe).",
  "- Extrahiere maximal 5 Pattern pro Thread. Lieber 2 starke Pattern als 5 schwache.",
  "- Jedes Pattern braucht: title (kurz, max 200 Zeichen), description (1-3 Saetze, max 1000 Zeichen), evidence_snippets (1-5 Auszuege aus dem redacted_body), confidence (0.0-1.0), suggested_section (V4.1-Pfad wie 'vertrieb/einwand-behandlung' ODER 'andere' bei Unklarheit).",
  "",
  "**Themen (themes):** kurze Stichworte fuer das ueberbordene Themenfeld, max 20 Eintraege. Beispiel: ['preis-einwand', 'lieferzeit-erklaerung', 'rechnungs-frage'].",
  "",
  "**Entscheidungen (decisions):** explizit getroffene Entscheidungen des Unternehmens, max 20 Eintraege. Beispiel: ['Sonderkonditionen werden nur ab 10 Stk vergeben', 'Lieferzeit-Versprechen 5 Werktage'].",
  "",
  "**Offene Fragen (open_questions):** im Thread nicht abschliessend beantwortete Fragen, max 20 Eintraege. Beispiel: ['Was passiert wenn der Kunde nach 30 Tagen reklamiert?'].",
  "",
  "**Output-Format — STRIKT JSON, NICHTS DRUMHERUM:**",
  "```",
  "{",
  '  "thread_id": "<wird vom Caller vorgegeben>",',
  '  "themes": ["..."],',
  '  "patterns": [',
  "    {",
  '      "title": "...",',
  '      "description": "...",',
  '      "evidence_snippets": ["..."],',
  '      "confidence": 0.85,',
  '      "suggested_section": "..."',
  "    }",
  "  ],",
  '  "decisions": ["..."],',
  '  "open_questions": ["..."]',
  "}",
  "```",
  "",
  "**WICHTIG:** Antworte AUSSCHLIESSLICH mit dem JSON-Objekt. Keine Markdown-Codeblocks, keine Erklaerung davor oder danach. Beginne deine Antwort mit `{` und beende sie mit `}`.",
].join("\n");

/**
 * Baut den User-Prompt pro Thread. Kombiniert Thread-Metadaten mit dem
 * pseudonymisierten Body. thread_id wird explizit benannt, damit das Modell
 * das im Output uebernimmt (Validierungs-Anker).
 */
export interface BuildPatternUserPromptInput {
  threadId: string;
  redactedBody: string;
  subject?: string;
  emailCount?: number;
  firstDate?: string;
}

export function buildPatternUserPrompt(input: BuildPatternUserPromptInput): string {
  const lines: string[] = [];
  lines.push(`Thread-ID: ${input.threadId}`);
  if (input.subject) {
    lines.push(`Subject (pseudonymisiert): ${input.subject}`);
  }
  if (input.emailCount !== undefined) {
    lines.push(`Email-Anzahl im Thread: ${input.emailCount}`);
  }
  if (input.firstDate) {
    lines.push(`Erste Email: ${input.firstDate}`);
  }
  lines.push("");
  lines.push("Redacted Thread-Body (P1 = Kunde, P2 = GF):");
  lines.push(input.redactedBody);
  lines.push("");
  lines.push(
    "Extrahiere themes / patterns / decisions / open_questions im vorgegebenen Strict-JSON-Format. " +
      "Beginne mit `{` und beende mit `}`.",
  );
  return lines.join("\n");
}
