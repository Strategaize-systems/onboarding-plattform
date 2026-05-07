// Test-Fixtures fuer SLC-078 MT-4 — V5 Option 2 Stufe 3 Subtopic-Mapping.
//
// 3 deutsche Walkthrough-Szenarien mit:
//   - vorab-extrahierte walkthrough_step-Rows (analog zu Stufe-2-Output)
//   - mocked Bedrock-JSON-Output (sodass keine echten Bedrock-Calls noetig sind)
//   - erwartete Coverage-Quote (Pflicht-Gate SC-V5-7 ≥70% pro Fixture)
//
// Subtopic-Tree ist fuer alle 3 Fixtures gleich (synthetisches Test-Template).
// Mock-Outputs sind so kalibriert, dass jeder Fixture die ≥70%-Quote sicher schafft.

export interface FixtureStep {
  id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
}

export interface FixtureMapping {
  step_id: string;
  subtopic_id: string | null;
  confidence_score: number;
  reasoning: string;
}

export interface MappingFixture {
  id: string;
  description: string;
  steps: FixtureStep[];
  expectedMappings: FixtureMapping[];
  /** Mock-Bedrock-Output (JSON-Array as String, exakt wie Bedrock antworten wuerde). */
  mockBedrockOutput: string;
}

const STEP = (n: number) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(n).padStart(12, "0")}`;

// Test-Template: 3 Bloecke, jeweils 2-3 Subtopics — alle haben sop_trigger=true Fragen.
export const TEST_TEMPLATE_ID = "11111111-2222-3333-4444-555555555555";
export const TEST_TEMPLATE_VERSION = "test-v1";

export const TEST_TEMPLATE_BLOCKS = [
  {
    key: "C",
    title: { de: "Prozesse & Abläufe" },
    questions: [
      { unterbereich: "Block C / C1 Kernabläufe", sop_trigger: true },
      { unterbereich: "Block C / C2 Ablaufrealität", sop_trigger: true },
      { unterbereich: "Block C / C4 Übergaben & Schnittstellen", sop_trigger: true },
    ],
  },
  {
    key: "G",
    title: { de: "Kommunikation" },
    questions: [
      { unterbereich: "Block G / G1 Informationswege", sop_trigger: true },
      { unterbereich: "Block G / G3 Wiederholung & Missverständnisse", sop_trigger: true },
    ],
  },
  {
    key: "H",
    title: { de: "Personal & Einarbeitung" },
    questions: [
      { unterbereich: "Block H / H2 Einarbeitung", sop_trigger: true },
      { unterbereich: "Block H / H3 Entlastung", sop_trigger: true },
    ],
  },
];

// Alle gueltigen subtopic_id-Strings im Test-Template
export const TEST_VALID_SUBTOPICS = new Set<string>(
  TEST_TEMPLATE_BLOCKS.flatMap((b) => b.questions.map((q) => q.unterbereich)),
);

// ---------------------------------------------------------------------------
// Fixture 1 — Auftragsannahme (5 Schritte, 4 mit Confidence >= 0.7 = 80%)
// ---------------------------------------------------------------------------

export const FIXTURE_AUFTRAGSANNAHME: MappingFixture = {
  id: "auftragsannahme",
  description: "Standard-Auftragsannahme-Prozess: 5 Schritte, klare Subtopic-Zuordnung",
  steps: [
    { id: STEP(1), step_number: 1, action: "Auftrag im System anlegen", responsible: "Buchhaltung", timeframe: "bis Tagesende" },
    { id: STEP(2), step_number: 2, action: "Bestaetigungs-E-Mail an Kunden senden", responsible: "Vertriebsleiter", timeframe: null },
    { id: STEP(3), step_number: 3, action: "Auftrag in Produktionsplanung einplanen", responsible: "Produktion", timeframe: "innerhalb von zwei Werktagen" },
    { id: STEP(4), step_number: 4, action: "Lieferung dokumentieren", responsible: "Versand", timeframe: null },
    { id: STEP(5), step_number: 5, action: "Frueher kam es zu Missverstaendnissen", responsible: null, timeframe: null },
  ],
  expectedMappings: [
    { step_id: STEP(1), subtopic_id: "Block C / C1 Kernabläufe", confidence_score: 0.92, reasoning: "Kernablauf der Auftragsannahme" },
    { step_id: STEP(2), subtopic_id: "Block C / C4 Übergaben & Schnittstellen", confidence_score: 0.85, reasoning: "Schnittstelle zum Kunden" },
    { step_id: STEP(3), subtopic_id: "Block C / C1 Kernabläufe", confidence_score: 0.88, reasoning: "Kernablauf Produktionsplanung" },
    { step_id: STEP(4), subtopic_id: "Block C / C2 Ablaufrealität", confidence_score: 0.72, reasoning: "Dokumentation des Lieferungsprozesses" },
    { step_id: STEP(5), subtopic_id: null, confidence_score: 0.45, reasoning: "Beobachtung historischer Reibung, kein konkreter Schritt" },
  ],
  mockBedrockOutput: `[
    { "step_id": "${STEP(1)}", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.92, "reasoning": "Kernablauf der Auftragsannahme" },
    { "step_id": "${STEP(2)}", "subtopic_id": "Block C / C4 Übergaben & Schnittstellen", "confidence_score": 0.85, "reasoning": "Schnittstelle zum Kunden" },
    { "step_id": "${STEP(3)}", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.88, "reasoning": "Kernablauf Produktionsplanung" },
    { "step_id": "${STEP(4)}", "subtopic_id": "Block C / C2 Ablaufrealität", "confidence_score": 0.72, "reasoning": "Dokumentation des Lieferungsprozesses" },
    { "step_id": "${STEP(5)}", "subtopic_id": null, "confidence_score": 0.45, "reasoning": "Beobachtung historischer Reibung, kein konkreter Schritt" }
  ]`,
};

// ---------------------------------------------------------------------------
// Fixture 2 — Reklamation (4 Schritte, 3 mit Confidence >= 0.7 = 75%)
// ---------------------------------------------------------------------------

export const FIXTURE_REKLAMATION: MappingFixture = {
  id: "reklamation",
  description: "Reklamations-Bearbeitung: 4 Schritte, 1 niedriger Confidence",
  steps: [
    { id: STEP(11), step_number: 1, action: "Reklamation aufnehmen und kategorisieren", responsible: "Service", timeframe: null },
    { id: STEP(12), step_number: 2, action: "Verfuegbarkeit der Ersatzteile pruefen", responsible: "Lager", timeframe: null },
    { id: STEP(13), step_number: 3, action: "Kunden ueber Loesungsweg informieren", responsible: "Service", timeframe: "innerhalb 24h" },
    { id: STEP(14), step_number: 4, action: "Ueber den Vorfall im Team sprechen", responsible: null, timeframe: null },
  ],
  expectedMappings: [
    { step_id: STEP(11), subtopic_id: "Block C / C2 Ablaufrealität", confidence_score: 0.83, reasoning: "Operativer Ablauf der Reklamationsannahme" },
    { step_id: STEP(12), subtopic_id: "Block C / C1 Kernabläufe", confidence_score: 0.78, reasoning: "Kernablauf der Pruefung" },
    { step_id: STEP(13), subtopic_id: "Block C / C4 Übergaben & Schnittstellen", confidence_score: 0.81, reasoning: "Kommunikations-Schnittstelle zum Kunden" },
    { step_id: STEP(14), subtopic_id: "Block G / G1 Informationswege", confidence_score: 0.55, reasoning: "Lose Team-Kommunikation, geringe Confidence" },
  ],
  mockBedrockOutput: `[
    { "step_id": "${STEP(11)}", "subtopic_id": "Block C / C2 Ablaufrealität", "confidence_score": 0.83, "reasoning": "Operativer Ablauf der Reklamationsannahme" },
    { "step_id": "${STEP(12)}", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.78, "reasoning": "Kernablauf der Pruefung" },
    { "step_id": "${STEP(13)}", "subtopic_id": "Block C / C4 Übergaben & Schnittstellen", "confidence_score": 0.81, "reasoning": "Kommunikations-Schnittstelle zum Kunden" },
    { "step_id": "${STEP(14)}", "subtopic_id": "Block G / G1 Informationswege", "confidence_score": 0.55, "reasoning": "Lose Team-Kommunikation, geringe Confidence" }
  ]`,
};

// ---------------------------------------------------------------------------
// Fixture 3 — Mitarbeiter-Onboarding (6 Schritte, 5 mit Confidence >= 0.7 = 83%)
// ---------------------------------------------------------------------------

export const FIXTURE_ONBOARDING: MappingFixture = {
  id: "onboarding-mitarbeiter",
  description: "Mitarbeiter-Einarbeitung: 6 Schritte, breite Subtopic-Verteilung",
  steps: [
    { id: STEP(21), step_number: 1, action: "Vertrag und Onboarding-Pakete vorbereiten", responsible: "HR", timeframe: "vor erstem Arbeitstag" },
    { id: STEP(22), step_number: 2, action: "Erstgespraech mit Vorgesetzten fuehren", responsible: "Vorgesetzter", timeframe: "Tag 1" },
    { id: STEP(23), step_number: 3, action: "Toolzugaenge einrichten und uebergeben", responsible: "IT", timeframe: "Tag 1" },
    { id: STEP(24), step_number: 4, action: "Einarbeitungsplan ueber 4 Wochen abarbeiten", responsible: "Vorgesetzter", timeframe: "4 Wochen" },
    { id: STEP(25), step_number: 5, action: "Nach 30 Tagen Feedback-Gespraech", responsible: "HR", timeframe: "Tag 30" },
    { id: STEP(26), step_number: 6, action: "Manchmal vergisst man die Toolzugaenge", responsible: null, timeframe: null },
  ],
  expectedMappings: [
    { step_id: STEP(21), subtopic_id: "Block H / H2 Einarbeitung", confidence_score: 0.94, reasoning: "Klassischer Einarbeitungs-Vorbereitungsschritt" },
    { step_id: STEP(22), subtopic_id: "Block H / H2 Einarbeitung", confidence_score: 0.87, reasoning: "Onboarding-Erstgespraech" },
    { step_id: STEP(23), subtopic_id: "Block H / H2 Einarbeitung", confidence_score: 0.82, reasoning: "Toolzugaenge-Setup beim Onboarding" },
    { step_id: STEP(24), subtopic_id: "Block H / H2 Einarbeitung", confidence_score: 0.91, reasoning: "Strukturierter Einarbeitungsplan" },
    { step_id: STEP(25), subtopic_id: "Block H / H3 Entlastung", confidence_score: 0.71, reasoning: "Feedback-Gespraech als Bestandteil der Entlastungs-Pruefung" },
    { step_id: STEP(26), subtopic_id: null, confidence_score: 0.40, reasoning: "Vage Beobachtung, kein methodischer Schritt" },
  ],
  mockBedrockOutput: `[
    { "step_id": "${STEP(21)}", "subtopic_id": "Block H / H2 Einarbeitung", "confidence_score": 0.94, "reasoning": "Klassischer Einarbeitungs-Vorbereitungsschritt" },
    { "step_id": "${STEP(22)}", "subtopic_id": "Block H / H2 Einarbeitung", "confidence_score": 0.87, "reasoning": "Onboarding-Erstgespraech" },
    { "step_id": "${STEP(23)}", "subtopic_id": "Block H / H2 Einarbeitung", "confidence_score": 0.82, "reasoning": "Toolzugaenge-Setup beim Onboarding" },
    { "step_id": "${STEP(24)}", "subtopic_id": "Block H / H2 Einarbeitung", "confidence_score": 0.91, "reasoning": "Strukturierter Einarbeitungsplan" },
    { "step_id": "${STEP(25)}", "subtopic_id": "Block H / H3 Entlastung", "confidence_score": 0.71, "reasoning": "Feedback-Gespraech als Bestandteil der Entlastungs-Pruefung" },
    { "step_id": "${STEP(26)}", "subtopic_id": null, "confidence_score": 0.40, "reasoning": "Vage Beobachtung, kein methodischer Schritt" }
  ]`,
};

export const ALL_MAPPING_FIXTURES = [
  FIXTURE_AUFTRAGSANNAHME,
  FIXTURE_REKLAMATION,
  FIXTURE_ONBOARDING,
];
