// Synthetische deutsche Walkthrough-Saetze fuer die PII-Recall-Test-Suite (SLC-076 MT-3, SC-V5-6).
//
// Pro Kategorie liefert dieses Modul ≥50 Saetze, jeweils mit der Liste der enthaltenen
// Original-PII-Items, die der Bedrock-Output entfernt haben muss. Recall = (gefundene / erwartete).
//
// Saetze werden via Templates × Werte generiert. Damit sind sie konsistent und reproduzierbar,
// gleichzeitig aber abwechslungsreich genug, um den Recall realistisch zu messen. Wo ein Satz
// in Wirklichkeit mehrere PII-Items enthaelt (z.B. Kontaktblock mit Name + E-Mail + Telefon),
// kommt das in den Mixed-Saetzen am Ende der Kategorie ueber `expectedItems` rein.
//
// IMPORTANT: Die `expectedItems`-Strings muessen exakt im Satz vorkommen — der Test prueft
// `output.includes(item) === false` als Erfolgs-Kriterium.

import type { PiiCategory } from "../..";

export interface RedactionFixture {
  category: PiiCategory;
  sentence: string;
  expectedItems: string[];
}

// =============================================================================
// KUNDENNAME — Vor-/Nachnamen, Firmenkontakte, Geschaeftspartner
// =============================================================================

const KUNDENNAME_NAMES = [
  "Anna Mueller",
  "Max Schmidt",
  "Lena Weber",
  "Tobias Becker",
  "Sophie Wagner",
  "Florian Hoffmann",
  "Julia Schaefer",
  "Niklas Koch",
  "Marie Richter",
  "Stefan Klein",
];

const KUNDENNAME_TEMPLATES = [
  (n: string) => `${n} hat heute morgen angerufen, weil die Lieferung verzoegert ist.`,
  (n: string) => `Ich habe mit ${n} im Termin besprochen, dass wir das Angebot anpassen.`,
  (n: string) => `${n} ist unser groesster Kunde im Bereich Maschinenbau seit drei Jahren.`,
  (n: string) => `Die Beschwerde von ${n} liegt seit Montag im Eingang und ist noch unbearbeitet.`,
  (n: string) => `${n} hat zugesagt, das Pflichtenheft bis Freitag zu liefern.`,
];

// 10 Namen x 5 Templates = 50 KUNDENNAME-Saetze
const KUNDENNAME_FIXTURES: RedactionFixture[] = KUNDENNAME_NAMES.flatMap((name) =>
  KUNDENNAME_TEMPLATES.map((tpl) => ({
    category: "KUNDENNAME" as PiiCategory,
    sentence: tpl(name),
    expectedItems: [name],
  })),
);

// =============================================================================
// EMAIL — E-Mail-Adressen
// =============================================================================

const EMAIL_ADDRESSES = [
  "kontakt@firma-meier.de",
  "max.mustermann@example.com",
  "vertrieb@strategaize-test.de",
  "anna.weber@kunde.org",
  "support@example.net",
  "info@bellaerts-beratung.de",
  "hello@onboarding-demo.eu",
  "buchhaltung@firma-x.com",
  "ceo@startup-y.io",
  "j.schmidt@example-gmbh.de",
];

const EMAIL_TEMPLATES = [
  (e: string) => `Schickt das Angebot bitte an ${e} mit CC an mich.`,
  (e: string) => `Wir haben die Bestaetigung von ${e} noch nicht zurueckbekommen.`,
  (e: string) => `Die Adresse fuer Rueckfragen ist ${e}, das hat der Kunde so eingerichtet.`,
  (e: string) => `Auf ${e} kommt der wichtigste Kontakt der Buchhaltung.`,
  (e: string) => `Bitte direkt an ${e} antworten und nicht ueber den allgemeinen Verteiler.`,
];

const EMAIL_FIXTURES: RedactionFixture[] = EMAIL_ADDRESSES.flatMap((email) =>
  EMAIL_TEMPLATES.map((tpl) => ({
    category: "EMAIL" as PiiCategory,
    sentence: tpl(email),
    expectedItems: [email],
  })),
);

// =============================================================================
// IBAN — IBAN, BIC, Bankverbindungen
// =============================================================================

const IBAN_NUMBERS = [
  "DE89 3704 0044 0532 0130 00",
  "DE12 5001 0517 0648 4898 90",
  "DE27 1007 0024 0123 4567 89",
  "DE21 7002 0270 0011 2233 44",
  "DE45 3705 0198 1928 3746 50",
  "AT61 1904 3002 3457 3201",
  "CH93 0076 2011 6238 5295 7",
  "DE63 6005 0101 0008 8888 88",
  "DE02 1203 0000 0000 1020 50",
  "DE19 5076 0021 0002 7180 99",
];

const IBAN_TEMPLATES = [
  (i: string) => `Die Zahlung ist auf das Konto ${i} eingegangen.`,
  (i: string) => `Bitte ueberweise den Restbetrag auf ${i} mit dem Verwendungszweck Auftrag.`,
  (i: string) => `Auf der Rechnung steht die IBAN ${i} fuer Rueckueberweisungen.`,
  (i: string) => `Der Lieferant hat die Bankverbindung auf ${i} geaendert.`,
  (i: string) => `Im SEPA-Lastschriftmandat ist ${i} hinterlegt, das muss aktualisiert werden.`,
];

const IBAN_FIXTURES: RedactionFixture[] = IBAN_NUMBERS.flatMap((iban) =>
  IBAN_TEMPLATES.map((tpl) => ({
    category: "IBAN" as PiiCategory,
    sentence: tpl(iban),
    expectedItems: [iban],
  })),
);

// =============================================================================
// TELEFON — Telefon- und Mobilnummern
// =============================================================================

const TELEFON_NUMBERS = [
  "+49 30 12345678",
  "0151 98765432",
  "030/12345-67",
  "+49 (0)40 9876 5432",
  "0211-555-12-34",
  "+43 1 5891 234",
  "+41 44 123 45 67",
  "0172 1234567",
  "069 / 9988 7766",
  "+49-89-12345-678",
];

const TELEFON_TEMPLATES = [
  (t: string) => `Der Kunde ist unter ${t} jederzeit erreichbar.`,
  (t: string) => `Ich habe ${t} angerufen, niemand ist drangegangen.`,
  (t: string) => `Im Notfall bitte direkt auf ${t} durchstellen lassen.`,
  (t: string) => `Die Mobilnummer ${t} steht im Outlook-Profil unter Privat.`,
  (t: string) => `Ueber ${t} laeuft die komplette Service-Hotline ab Mittwoch.`,
];

const TELEFON_FIXTURES: RedactionFixture[] = TELEFON_NUMBERS.flatMap((tel) =>
  TELEFON_TEMPLATES.map((tpl) => ({
    category: "TELEFON" as PiiCategory,
    sentence: tpl(tel),
    expectedItems: [tel],
  })),
);

// =============================================================================
// PREIS_BETRAG — Preise, Geldbetraege, kunden-spezifische Konditionen
// =============================================================================

const PREIS_BETRAEGE = [
  "12.500 EUR",
  "850,00 Euro",
  "25.000 EUR netto",
  "1.299 EUR pro Lizenz",
  "47.250 Euro brutto",
  "9.800 EUR im Monat",
  "3.450,75 EUR",
  "150.000 Euro Jahresbudget",
  "2.500 EUR pro Tag",
  "78.999 EUR Gesamtsumme",
];

const PREIS_TEMPLATES = [
  (p: string) => `Wir haben den Auftrag fuer ${p} an den Kunden geschickt.`,
  (p: string) => `Das aktuelle Listenangebot liegt bei ${p}, das muss noch verhandelt werden.`,
  (p: string) => `Im Gespraech wurde von ${p} fuer das Pilotprojekt ausgegangen.`,
  (p: string) => `Der Kunde hat einen Sonderpreis von ${p} bekommen, das ist nicht oeffentlich.`,
  (p: string) => `Im letzten Quartal lag der Umsatz mit dem Kunden bei ${p}.`,
];

const PREIS_FIXTURES: RedactionFixture[] = PREIS_BETRAEGE.flatMap((preis) =>
  PREIS_TEMPLATES.map((tpl) => ({
    category: "PREIS_BETRAG" as PiiCategory,
    sentence: tpl(preis),
    expectedItems: [preis],
  })),
);

// =============================================================================
// INTERNE_ID — Auftrags-, Kunden-, Vertrags-, Projekt- oder Rechnungsnummern
// =============================================================================

const INTERNE_IDS = [
  "AUFTRAG-2026-1234",
  "Vertrag Nr. 99887",
  "PRJ-4711",
  "Rechnung R-2026-00789",
  "KDN-0042-A",
  "Lieferschein LS-554321",
  "Vorgang #20260415-007",
  "Ticket SUP-99001",
  "Kostenstelle KST-110-22",
  "Bestellung BST/2026/0098",
];

const ID_TEMPLATES = [
  (id: string) => `Bitte den Vorgang ${id} in der CRM-Maske umschluesseln.`,
  (id: string) => `Die Reklamation laeuft unter ${id}, da steht alles drin.`,
  (id: string) => `Im SAP findest du ${id} unter dem Kundenbereich.`,
  (id: string) => `Die Abrechnung erfolgt ueber ${id} mit Faelligkeit Ende des Monats.`,
  (id: string) => `Auf der Lieferung steht ${id}, bitte abgleichen mit dem Auftrag.`,
];

const ID_FIXTURES: RedactionFixture[] = INTERNE_IDS.flatMap((id) =>
  ID_TEMPLATES.map((tpl) => ({
    category: "INTERNE_ID" as PiiCategory,
    sentence: tpl(id),
    expectedItems: [id],
  })),
);

// =============================================================================
// INTERN_KOMM — interne Kommunikations-Marker (Slack, Confluence, Notion, Wiki)
// =============================================================================

const INTERN_MARKERS = [
  "@max.mueller",
  "confluence.firma.de/space/Vertrieb",
  "notion.so/firma/abc123def456",
  "@anna.weber im #vertrieb-Channel",
  "intranet.firma.local/projekte/2026",
  "wiki.beispiel-firma.de/Onboarding",
  "@team-vertrieb",
  "linear.app/firma/issue/SUP-42",
  "github.com/firma-intern/repo-x",
  "slack.com/archives/C07ABCD123",
];

const INTERN_TEMPLATES = [
  (m: string) => `Pingt mal ${m} damit das Thema heute noch dran kommt.`,
  (m: string) => `Die Doku liegt unter ${m} und ist aktuell.`,
  (m: string) => `Ich habe das auf ${m} gepostet, da kommt schneller eine Antwort.`,
  (m: string) => `Im Onboarding-Prozess steht der Link auf ${m} ganz oben.`,
  (m: string) => `Die letzte Diskussion lief unter ${m}, da ist die Begruendung dokumentiert.`,
];

const INTERN_FIXTURES: RedactionFixture[] = INTERN_MARKERS.flatMap((marker) =>
  INTERN_TEMPLATES.map((tpl) => ({
    category: "INTERN_KOMM" as PiiCategory,
    sentence: tpl(marker),
    expectedItems: [marker],
  })),
);

// =============================================================================
// Aggregation
// =============================================================================

export const ALL_FIXTURES: RedactionFixture[] = [
  ...KUNDENNAME_FIXTURES,
  ...EMAIL_FIXTURES,
  ...IBAN_FIXTURES,
  ...TELEFON_FIXTURES,
  ...PREIS_FIXTURES,
  ...ID_FIXTURES,
  ...INTERN_FIXTURES,
];

export function fixturesByCategory(category: PiiCategory): RedactionFixture[] {
  return ALL_FIXTURES.filter((f) => f.category === category);
}

export function totalExpectedItems(): number {
  return ALL_FIXTURES.reduce((sum, f) => sum + f.expectedItems.length, 0);
}
