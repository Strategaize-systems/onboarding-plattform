// PII-Pattern-Library — V5 Option 2 Stufe 1 (SLC-076 MT-2)
//
// System-wide constant pro DEC-082: kein per-Tenant-Override in V5.
// Single source of truth fuer:
//   - Bedrock-Prompt `pii_redact.ts` (Pattern-Liste + Platzhalter)
//   - Recall-Test-Suite `redaction-recall.test.ts`
//
// Wenn Pattern hier geaendert werden, MUSS der Prompt regeneriert werden
// (er liest direkt aus diesem Export, kein Hardcoding) und die Test-Fixtures
// sind ggf. zu aktualisieren.
//
// Konservative Regel im Prompt: "Im Zweifel maskieren — lieber zu viel als zu wenig."

export const PII_PATTERNS = {
  KUNDENNAME: {
    placeholder: "[KUNDE]",
    description:
      "Vor- und Nachnamen von Kunden, Firmenkontakten oder Geschaeftspartnern (z.B. 'Herr Mueller', 'Anna Schmidt', 'Bellaerts Beratung GmbH')",
  },
  EMAIL: {
    placeholder: "[EMAIL]",
    description: "E-Mail-Adressen (z.B. 'max@example.com', 'kontakt@firma.de')",
  },
  IBAN: {
    placeholder: "[IBAN]",
    description:
      "IBAN, BIC, Konto- und Bankleitzahlen (z.B. 'DE89 3704 0044 0532 0130 00', 'BIC COBADEFFXXX')",
  },
  TELEFON: {
    placeholder: "[TEL]",
    description:
      "Telefon- und Mobilnummern in jeder Schreibweise (z.B. '+49 30 123456', '0151 12345678', '030/12345-67')",
  },
  PREIS_BETRAG: {
    placeholder: "[BETRAG]",
    description:
      "JEDER konkrete Geldbetrag in EUR/Euro/Dollar (z.B. '12.500 EUR', '850,00 Euro', '25.000 EUR netto', '47.250 Euro brutto', '2.500 EUR pro Tag') sowie konkrete Rabatt-/Kondition-Prozente mit Auftrags-Bezug ('8,5% Rabatt'). Im Walkthrough-Kontext ist jeder genannte Geldbetrag PII — keine Ausnahmen fuer 'Listenpreis', 'Standardangebot' oder 'Auftrag'. Nur grobe Bandbreiten ohne Zahl ('niedriger sechsstelliger Bereich') bleiben unmaskiert.",
  },
  INTERNE_ID: {
    placeholder: "[ID]",
    description:
      "Auftrags-, Kunden-, Vertrags-, Projekt- oder Rechnungsnummern (z.B. 'AUFTRAG-2026-1234', 'Vertrag Nr. 99887', 'PRJ-4711')",
  },
  INTERN_KOMM: {
    placeholder: "[INTERN]",
    description:
      "Interne Kommunikations-Marker wie Slack-Handles, Confluence-Links, Notion-URLs, interne Wiki-Verweise (z.B. '@max.mueller', 'confluence.firma.de/space/X', 'notion.so/abc123')",
  },
} as const;

export type PiiCategory = keyof typeof PII_PATTERNS;

export const PII_CATEGORIES = Object.keys(PII_PATTERNS) as PiiCategory[];

// Hilfsfunktion fuer den Prompt: rendert die komplette Pattern-Liste in Markdown-Bullet-Form.
// Wird von pii_redact.ts genutzt, damit Prompt + Library nicht auseinanderdriften.
export function renderPiiPatternList(): string {
  return PII_CATEGORIES.map((category) => {
    const pattern = PII_PATTERNS[category];
    return `- ${category} → ${pattern.placeholder}: ${pattern.description}`;
  }).join("\n");
}
