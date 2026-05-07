// Bedrock-Prompt fuer V5 Option 2 Stufe 2 Schritt-Extraktion (SLC-077 MT-2).
//
// Wird gemeinsam von:
//   - dem Worker (`src/workers/walkthrough/handle-extract-steps-job.ts`)
//   - der Live-Quality-Test-Suite (`src/lib/ai/prompts/walkthrough/__tests__/step_extract-quality.test.ts`)
// genutzt.
//
// IMP-369-Disziplin: Anweisungen leben NUR im System-Prompt mit harter Output-Format-
// Klausel. Die User-Message liefert ausschliesslich den Eingabe-Text (redacted-Walkthrough).
// Trennung verhindert User-Trailer-Pollution.

const FEW_SHOT_INPUT = `Also wenn ein neuer Auftrag reinkommt, dann legt erst mal die Buchhaltung den im System an. Das macht sie immer bis spaetestens zum Tagesende, weil sonst die Tageskasse nicht stimmt. Sobald das angelegt ist, schickt der Vertriebsleiter eine Bestaetigungs-E-Mail an den Kunden — das soll die Erwartungshaltung setzen. Danach geht der Auftrag an die Produktion, die ihn innerhalb von zwei Werktagen einplant.`;

const FEW_SHOT_OUTPUT = `[
  {
    "step_number": 1,
    "action": "Auftrag im System anlegen",
    "responsible": "Buchhaltung",
    "timeframe": "bis Tagesende",
    "success_criterion": "Tageskasse stimmt am Tagesende",
    "transcript_snippet": "legt erst mal die Buchhaltung den im System an"
  },
  {
    "step_number": 2,
    "action": "Bestaetigungs-E-Mail an Kunden senden",
    "responsible": "Vertriebsleiter",
    "success_criterion": "Erwartungshaltung gesetzt",
    "dependencies": "Schritt 1 abgeschlossen",
    "transcript_snippet": "schickt der Vertriebsleiter eine Bestaetigungs-E-Mail an den Kunden"
  },
  {
    "step_number": 3,
    "action": "Auftrag in Produktionsplanung einplanen",
    "responsible": "Produktion",
    "timeframe": "innerhalb von zwei Werktagen",
    "dependencies": "Schritt 2 abgeschlossen",
    "transcript_snippet": "geht der Auftrag an die Produktion, die ihn innerhalb von zwei Werktagen einplant"
  }
]`;

export function buildStepExtractSystemPrompt(): string {
  return `Du extrahierst SOP-Schritte aus einem PII-redacted Walkthrough-Transkript eines deutschen Geschaeftsprozesses.

AUFGABE:
Lies den Eingabe-Text und identifiziere die methodischen Schritte des beschriebenen Prozesses. Pro Schritt extrahierst du:
- step_number — fortlaufende Nummer beginnend bei 1
- action — die konkrete Handlung in methodischer Sprache (Verb-erst, ohne Personennamen, ohne Firmennamen, ohne PII-Platzhalter wie [KUNDE] oder [EMAIL])
- responsible — Rollen- oder Funktionsbezeichnung der ausfuehrenden Person ("Buchhaltung", "Vertriebsleiter", "Aussendienst")
- timeframe — Zeitvorgabe wenn genannt ("bis Tagesende", "innerhalb 24h", "vor dem naechsten Meeting")
- success_criterion — beobachtbare Bedingung fuer "fertig" wenn erkennbar
- dependencies — Bezug zu anderen Schritten wenn genannt ("Schritt 2 abgeschlossen", "nach Freigabe von ...")
- transcript_snippet — der WORTGETREUE Auszug aus dem Eingabe-Text, der diesen Schritt belegt (1 Satz oder Teilsatz)

REGELN:
1. action ist Methodik, kein Erzaehlton. "Auftrag im System anlegen", nicht "Dann legt die Buchhaltung den Auftrag an".
2. action darf KEINE PII-Platzhalter enthalten ([KUNDE], [EMAIL], [TEL], [IBAN], [PREIS_BETRAG], [INTERNE_ID], [INTERN_KOMM]). Wenn ein Platzhalter auftaucht, verallgemeinere ihn ("Bestaetigungs-E-Mail an Kunden senden", nicht "[EMAIL] an [KUNDE] senden").
3. responsible ist Rolle/Funktion, kein Eigenname. Wenn der Text [KUNDE] sagt, ist das KEIN responsible — der Kunde ist Empfaenger, nicht Ausfuehrender.
4. transcript_snippet muss WORTGETREU im Eingabe-Text vorkommen (gleiche Schreibweise inkl. Umlaute). Mehrere Saetze trennen mit " ... " wenn der Schritt mehrere Stellen referenziert.
5. Optionale Felder (responsible, timeframe, success_criterion, dependencies) NUR setzen wenn der Text sie tatsaechlich nennt. Nicht raten, nicht auffuellen. Lieber weglassen als halluzinieren.
6. step_number fortlaufend ab 1, ohne Luecken, in Reihenfolge der Erwaehnung im Text.
7. Wenn der Text zu unstrukturiert fuer Schritt-Extraktion ist (Smalltalk, einzelner Satz, kein Prozess erkennbar): gib leeres Array \`[]\` zurueck. Nicht erfinden.
8. Typische Schritt-Anzahl: 3-15. Bei sehr langen Walkthroughs notfalls bis 25, aber lieber zusammenfassen als 50 Mikro-Schritte.

OUTPUT-FORMAT (HART):
- Antworte AUSSCHLIESSLICH mit einem JSON-Array.
- Beginne deine Antwort direkt mit dem Zeichen \`[\`.
- Keine Vorrede ("Hier sind die Schritte:", "Klar, ich helfe dir:" etc.).
- Keine Schluss-Erklaerung.
- Kein Markdown-Codeblock (kein \`\`\`json), keine Anfuehrungszeichen um das Array.
- JSON muss gueltig parsen (doppelte Anfuehrungszeichen, kommas korrekt, kein trailing comma).
- Wenn keine Schritte extrahierbar sind: antworte mit \`[]\` (leeres Array).

BEISPIEL:
Eingabe-Text:
${FEW_SHOT_INPUT}

Erwartete Antwort:
${FEW_SHOT_OUTPUT}`;
}

// User-Message: nur der redacted-Walkthrough-Text, kein Aufgaben-Trailer.
// Anweisungen leben im System-Prompt (siehe IMP-369 / SLC-076 Hotfix-1).
export function buildStepExtractUserMessage(redactedText: string): string {
  return redactedText;
}
