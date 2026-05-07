// Bedrock-Prompt fuer V5 Option 2 Stufe 3 Subtopic-Mapping (SLC-078 MT-2).
//
// Wird gemeinsam vom Worker (handle-map-subtopics-job.ts) und der Live-Quality-Test-Suite
// genutzt.
//
// IMP-369-Disziplin: Anweisungen leben NUR im System-Prompt mit harter Output-Format-Klausel.
// Die User-Message liefert ausschliesslich Inputs (Schritt-Liste + Subtopic-Tree als JSON).
// Trennung verhindert User-Trailer-Pollution.
//
// Pattern-Reuse FEAT-023 Bridge-Engine in Reverse-Direction:
//   Bridge-Engine (V4): subtopic → vorgeschlagene Mitarbeiter-Aufgabe
//   V5 Option 2 Stufe 3: walkthrough_step → passender subtopic_id (oder NULL = Unmapped)

export interface StepInput {
  step_id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
}

export interface SubtopicTreeBlock {
  block_key: string;
  block_title: string;
  subtopic_ids: string[];
}

const FEW_SHOT_TREE: SubtopicTreeBlock[] = [
  {
    block_key: "C",
    block_title: "Prozesse & Abläufe",
    subtopic_ids: [
      "Block C / C1 Kernabläufe",
      "Block C / C2 Ablaufrealität",
      "Block C / C3 Engpässe & Reibung",
      "Block C / C4 Übergaben & Schnittstellen",
    ],
  },
  {
    block_key: "G",
    block_title: "Kommunikation",
    subtopic_ids: ["Block G / G1 Informationswege", "Block G / G3 Wiederholung & Missverständnisse"],
  },
];

const FEW_SHOT_STEPS: StepInput[] = [
  { step_id: "s1", step_number: 1, action: "Auftrag im System anlegen", responsible: "Buchhaltung", timeframe: "bis Tagesende" },
  { step_id: "s2", step_number: 2, action: "Bestaetigungs-E-Mail an Kunden senden", responsible: "Vertriebsleiter", timeframe: null },
  { step_id: "s3", step_number: 3, action: "Frueher gab es da viele Missverstaendnisse zwischen Vertrieb und Produktion", responsible: null, timeframe: null },
];

const FEW_SHOT_OUTPUT = `[
  {
    "step_id": "s1",
    "subtopic_id": "Block C / C1 Kernabläufe",
    "confidence_score": 0.92,
    "reasoning": "Kernablauf der Auftragsannahme — eindeutig zu C1."
  },
  {
    "step_id": "s2",
    "subtopic_id": "Block C / C4 Übergaben & Schnittstellen",
    "confidence_score": 0.78,
    "reasoning": "Kunden-Bestaetigung ist Schnittstelle zwischen interner Abwicklung und Kunde."
  },
  {
    "step_id": "s3",
    "subtopic_id": null,
    "confidence_score": 0.45,
    "reasoning": "Beobachtung historischer Reibung, kein konkreter Schritt — Unmapped-Bucket angemessener als forciertes Mapping zu G3."
  }
]`;

export function buildSubtopicMapSystemPrompt(): string {
  return `Du ordnest extrahierte SOP-Schritte den passenden Subtopics im Onboarding-Template-Tree zu.

AUFGABE:
Du erhaeltst eine Liste von SOP-Schritten (action, responsible, timeframe) und einen Subtopic-Tree (Bloecke mit jeweils einer Liste von Subtopic-Strings). Pro Schritt entscheidest du, welcher Subtopic der beste Treffer ist — oder ob kein Subtopic gut passt (Unmapped-Bucket).

PRO SCHRITT EXTRAHIERST DU:
- step_id — exakt die ID aus dem Input
- subtopic_id — der gewaehlte Subtopic-String aus dem Tree, ODER null (= Unmapped)
- confidence_score — Zahl 0..1, wie sicher du dir bist
- reasoning — kurze deutsche Begruendung (max 1-2 Saetze, fuer Audit + Debugging)

REGELN:
1. subtopic_id muss WORTGETREU einer der Strings im uebergebenen Subtopic-Tree sein. Keine Abwandlung, keine Uebersetzung, keine eigene Hierarchie. Wenn keiner passt: subtopic_id=null.
2. confidence_score ist konservativ. Skala:
   - 0.85-1.00: eindeutig der richtige Subtopic, Schluesselbegriffe matchen direkt
   - 0.70-0.84: gute Zuordnung, etwas Interpretationsspielraum
   - 0.50-0.69: schwache Zuordnung — der Schritt passt thematisch, aber nicht praezise
   - 0.00-0.49: kein guter Treffer im Tree
3. Lieber Unmapped-Bucket (subtopic_id=null) bei niedriger Confidence als forciertes Mapping. Berater-Korrektur ist schneller als Mis-Mapping erkennen.
4. reasoning ist auf Deutsch, kurz und sachlich. Keine Marketing-Sprache. Audit-Log-Qualitaet.
5. Kein Schritt darf doppelt vorkommen. Jede step_id aus dem Input genau einmal im Output.
6. Reihenfolge im Output: gleiche Reihenfolge wie im Input.
7. Wenn die Schritt-Liste leer ist: leeres JSON-Array \`[]\` zurueckgeben.

OUTPUT-FORMAT (HART):
- Antworte AUSSCHLIESSLICH mit einem JSON-Array.
- Beginne deine Antwort direkt mit dem Zeichen \`[\`.
- Keine Vorrede ("Hier sind die Mappings:" etc.).
- Keine Schluss-Erklaerung.
- Kein Markdown-Codeblock (kein \`\`\`json), keine Anfuehrungszeichen um das Array.
- JSON muss gueltig parsen (doppelte Anfuehrungszeichen, kommas korrekt, kein trailing comma).

BEISPIEL:
Subtopic-Tree:
${JSON.stringify(FEW_SHOT_TREE, null, 2)}

Schritt-Liste:
${JSON.stringify(FEW_SHOT_STEPS, null, 2)}

Erwartete Antwort:
${FEW_SHOT_OUTPUT}`;
}

// User-Message: nur Subtopic-Tree + Schritt-Liste als JSON, kein Aufgaben-Trailer.
// Anweisungen leben im System-Prompt (IMP-369-Disziplin).
export function buildSubtopicMapUserMessage(
  steps: StepInput[],
  tree: SubtopicTreeBlock[],
): string {
  return `Subtopic-Tree:
${JSON.stringify(tree, null, 2)}

Schritt-Liste:
${JSON.stringify(steps, null, 2)}`;
}
