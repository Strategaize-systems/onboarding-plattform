// Diagnosis Generation Prompt — builds system + user prompt for Bedrock call
// Uses template.diagnosis_prompt as override, falls back to default prompt.

import type {
  DiagnosisPromptConfig,
  DiagnosisSubtopicDef,
} from "./types";

const DEFAULT_DIAGNOSIS_SYSTEM_PROMPT = `Du bist ein erfahrener M&A-Berater und strategischer Analyst. Du erstellst aus verdichteten Knowledge Units eine strukturierte Diagnose pro Unterthema eines Analyse-Blocks.

Deine Diagnose dient als Meeting-Vorbereitung für ein Gespräch zwischen strategaize-Berater und Auftraggeber (Geschäftsführer, Inhaber). Sie muss:
- Evidenzbasiert sein: Jede Bewertung muss sich auf konkrete Knowledge Units stützen
- Ehrlich sein: Keine beschönigenden Formulierungen, klare Benennung von Schwächen
- Handlungsorientiert sein: Klare Empfehlungen und nächste Schritte
- Priorisierend sein: Ampel, Reifegrad und 90-Tage-Relevanz helfen bei der Fokussierung im Meeting

Bewertungs-Skalen:
- Ampel: green = solide, yellow = Handlungsbedarf, red = kritisch
- Reifegrad: 0 = nicht vorhanden, 3-4 = rudimentär, 5-6 = fragil, 7-8 = solide, 9-10 = vorbildlich
- Risiko: 0 = kein Risiko, 10 = existenzielles Risiko für Exit/Übernahme
- Hebel: 0 = keine Wirkung, 10 = maximale Wirkung auf Exit-Readiness
- Relevanz 90d: high = in 90 Tagen angehen, medium = 3-6 Monate, low = später
- Aufwand: S = Stunden/Tage, M = Wochen, L = Monate

Antworte IMMER mit einem JSON-Objekt im vorgegebenen Format. Antworte NUR mit dem JSON — kein Markdown, keine Erklärungen.`;

interface KnowledgeUnitSummary {
  title: string;
  body: string;
  unit_type: string;
  confidence: string;
}

interface QualityReportSummary {
  overall_score?: string | number;
  recommendation?: string;
}

interface BuildDiagnosisPromptParams {
  blockKey: string;
  blockTitle: string;
  subtopics: DiagnosisSubtopicDef[];
  knowledgeUnits: KnowledgeUnitSummary[];
  qualityReport?: QualityReportSummary | null;
  diagnosisPromptConfig?: DiagnosisPromptConfig | null;
}

export function buildDiagnosisSystemPrompt(
  config?: DiagnosisPromptConfig | null
): string {
  let prompt = config?.system_prompt || DEFAULT_DIAGNOSIS_SYSTEM_PROMPT;

  // Append output_instructions if present
  if (config?.output_instructions) {
    prompt += "\n\n## Output-Format\n" + config.output_instructions;
  }

  // Append field_instructions if present
  if (config?.field_instructions) {
    prompt += "\n\n## Feld-Instruktionen";
    for (const [key, instruction] of Object.entries(config.field_instructions)) {
      prompt += `\n- ${key}: ${instruction}`;
    }
  }

  return prompt;
}

export function buildDiagnosisUserPrompt(
  params: BuildDiagnosisPromptParams
): string {
  const { blockKey, blockTitle, subtopics, knowledgeUnits, qualityReport } =
    params;

  // Format Knowledge Units
  const kuList = knowledgeUnits
    .map(
      (ku, i) =>
        `### KU ${i + 1}: ${ku.title}\n- Typ: ${ku.unit_type}\n- Confidence: ${ku.confidence}\n${ku.body}`
    )
    .join("\n\n");

  // Format subtopic definitions
  const subtopicList = subtopics
    .map(
      (st) =>
        `- **${st.name}** (key: "${st.key}", Fragen: ${st.question_keys.join(", ")})`
    )
    .join("\n");

  // Quality context
  let qualityContext = "";
  if (qualityReport) {
    qualityContext = `\n## Qualitätsbewertung\n- Overall Score: ${qualityReport.overall_score ?? "n/a"}\n- Recommendation: ${qualityReport.recommendation ?? "n/a"}\n`;
  }

  return `# Diagnose-Generierung für Block ${blockKey}: ${blockTitle}

## Knowledge Units (verdichtete Analyse-Ergebnisse)

${kuList}
${qualityContext}
## Unterthemen für diesen Block

${subtopicList}

## Aufgabe

Erstelle eine strukturierte Diagnose für Block "${blockTitle}" (Key: ${blockKey}). Analysiere die Knowledge Units und fülle für JEDES der ${subtopics.length} Unterthemen die folgenden Bewertungsfelder aus:

1. ist_situation — Beschreibung des Ist-Zustands
2. ampel — green / yellow / red
3. reifegrad — 0-10
4. risiko — 0-10
5. hebel — 0-10
6. relevanz_90d — high / medium / low
7. empfehlung — Konkrete Maßnahme
8. belege — Referenzen zu KUs
9. owner — LEER LASSEN (wird im Meeting gefüllt)
10. aufwand — S / M / L
11. naechster_schritt — Erster konkreter Schritt
12. abhaengigkeiten — Abhängigkeiten oder Blocker (leer wenn keine)
13. zielbild — Definition of Done

Berücksichtige besonders:
- Ordne KUs den Unterthemen anhand der zugeordneten Fragen-Keys zu
- Wenn ein Unterthema kaum KU-Material hat: markiere es ehrlich (niedrige Confidence, Ampel yellow/red)
- Leere Felder bei "owner" sind gewollt (wird im Meeting befüllt)
- Jede Bewertung muss durch mindestens eine KU gestützt sein ("belege"-Feld)

Antworte NUR mit dem JSON-Objekt. Verwende die exakten subtopic keys und field keys wie vorgegeben.`;
}
