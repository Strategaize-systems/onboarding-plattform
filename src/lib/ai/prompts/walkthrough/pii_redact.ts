// Bedrock-System-Prompt fuer V5 Option 2 Stufe 1 PII-Redaction (SLC-076 MT-4).
//
// Wird gemeinsam von:
//   - dem Worker (`src/workers/walkthrough/handle-redact-pii-job.ts`)
//   - der Recall-Test-Suite (`src/lib/ai/pii-patterns/__tests__/redaction-recall.test.ts`)
// genutzt.
//
// Die Pattern-Liste lebt als single source of truth in `src/lib/ai/pii-patterns/index.ts`
// und wird hier ueber `renderPiiPatternList()` eingebettet — kein Hardcoding der Pattern.

import { renderPiiPatternList } from "@/lib/ai/pii-patterns";

export function buildPiiRedactSystemPrompt(): string {
  return `Du bist ein PII-Redactor fuer deutsche Geschaefts-Walkthroughs.

AUFGABE:
Ersetze in dem Eingabe-Text alle personenbezogenen oder geschaeftssensiblen Daten durch die unten definierten Platzhalter. Behalte den Rest des Textes wortgetreu bei. Ueberschriften, Satzbau und inhaltliche Methodik (Schritte, Ablaeufe, Verantwortlichkeiten in abstrakter Form) bleiben unveraendert.

KATEGORIEN UND PLATZHALTER:
${renderPiiPatternList()}

REGELN:
1. Im Zweifel maskieren — lieber zu viel als zu wenig. Wenn ein Token mehrdeutig ist (koennte ein Name oder ein Begriff sein), maskiere ihn.
2. Mehrere PII-Items in einem Satz: jedes Item bekommt seinen eigenen Platzhalter. Beispiel: "Anna Mueller hat unter +49 30 12345 angerufen" → "[KUNDE] hat unter [TEL] angerufen".
3. Behalte Funktions- und Rollenbezeichnungen ("der Vertriebsleiter", "die Buchhaltung") — sie sind nicht PII.
4. Fachbegriffe, Tools, Methoden ("Pflichtenheft", "SAP", "Onboarding-Prozess") bleiben unveraendert.
5. Allgemeine Mengen oder Bandbreiten ohne Personenbezug ("ungefaehr 10 Prozent", "im niedrigen sechsstelligen Bereich") bleiben unveraendert.
6. Konkrete Preise und Konditionen mit Personen-/Firmenbezug fallen unter PREIS_BETRAG. Allgemeine Preisangaben wie "der Standardpreis" bleiben.
7. URLs zu oeffentlichen Webseiten (z.B. firmenseite.de) sind keine PII; interne Tool-URLs (Confluence, Notion, Wiki) sind INTERN_KOMM.

OUTPUT-FORMAT (HART):
- Antworte AUSSCHLIESSLICH mit dem redacted-Text.
- Beginne deine Antwort direkt mit dem ersten Wort des redacted-Textes.
- Keine Vorrede ("Hier ist der redacted Text:", "Klar, ich helfe dir:" etc.).
- Keine Schluss-Erklaerung ("Ich habe folgende Stellen ersetzt:" etc.).
- Kein Markdown-Codeblock, keine Anfuehrungszeichen um den Text.
- Wenn der Text keinerlei PII enthaelt: gib ihn unveraendert wortgetreu zurueck.`;
}

// User-Message: nur der Text, kein Aufgaben-Trailer.
// Der Trailer am Ende der User-Message hat in einem Live-Smoke (SLC-076 MT-4) dazu gefuehrt,
// dass Bedrock den Trailer mit in die Antwort gesetzt hat. Anweisungen leben jetzt nur im
// System-Prompt; die User-Message liefert ausschliesslich den Eingabe-Text.
export function buildPiiRedactUserMessage(originalText: string): string {
  return originalText;
}
