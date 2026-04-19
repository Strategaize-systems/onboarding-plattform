// SOP Generation Prompt — builds system + user prompt for Bedrock call
// Uses template.sop_prompt as override, falls back to default prompt.

import type { SopPromptConfig } from "./types";

const DEFAULT_SOP_SYSTEM_PROMPT = `Du bist ein erfahrener M&A-Berater und Organisationsentwickler. Du erstellst aus verdichteten Knowledge Units einen konkreten Standard Operating Procedure (SOP) — einen strukturierten Handlungsplan mit klaren Schritten, Verantwortlichkeiten und Zeitrahmen.

Der SOP soll:
- Direkt umsetzbar sein (keine vagen Empfehlungen)
- Priorisierte Schritte mit klaren Verantwortlichkeiten enthalten
- Realistische Zeitrahmen setzen
- Erfolgskriterien pro Schritt definieren
- Risiken und Fallback-Optionen benennen
- Auf die spezifischen Findings aus der Analyse eingehen

Antworte IMMER mit einem JSON-Objekt in folgendem Format:
{
  "title": "SOP: [Thema]",
  "objective": "[Klares Ziel des SOP]",
  "prerequisites": ["[Voraussetzung 1]", "..."],
  "steps": [
    {
      "number": 1,
      "action": "[Konkrete Aktion]",
      "responsible": "[Rolle/Person]",
      "timeframe": "[Zeitrahmen]",
      "success_criterion": "[Messbares Ergebnis]",
      "dependencies": []
    }
  ],
  "risks": ["[Risiko 1]", "..."],
  "fallbacks": ["[Fallback-Option 1]", "..."]
}

Antworte NUR mit dem JSON — kein Markdown, keine Erklaerungen.`;

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

interface BuildSopPromptParams {
  blockKey: string;
  blockTitle: string;
  knowledgeUnits: KnowledgeUnitSummary[];
  qualityReport?: QualityReportSummary | null;
  sopPromptConfig?: SopPromptConfig | null;
}

export function buildSopSystemPrompt(
  config?: SopPromptConfig | null
): string {
  return config?.system_prompt || DEFAULT_SOP_SYSTEM_PROMPT;
}

export function buildSopUserPrompt(params: BuildSopPromptParams): string {
  const { blockKey, blockTitle, knowledgeUnits, qualityReport } = params;

  const kuList = knowledgeUnits
    .map(
      (ku, i) =>
        `### KU ${i + 1}: ${ku.title}\n- Typ: ${ku.unit_type}\n- Confidence: ${ku.confidence}\n${ku.body}`
    )
    .join("\n\n");

  let qualityContext = "";
  if (qualityReport) {
    qualityContext = `\n## Qualitaetsbewertung\n- Overall Score: ${qualityReport.overall_score ?? "n/a"}\n- Recommendation: ${qualityReport.recommendation ?? "n/a"}\n`;
  }

  return `# SOP-Generierung fuer Block ${blockKey}: ${blockTitle}

## Knowledge Units (verdichtete Analyse-Ergebnisse)

${kuList}
${qualityContext}
## Aufgabe

Erstelle einen konkreten, umsetzbaren SOP fuer Block "${blockTitle}" basierend auf den obigen Knowledge Units. Der SOP soll die identifizierten Findings, Risiken und Handlungsempfehlungen in einen strukturierten Handlungsplan uebersetzen.

Beruecksichtige besonders:
- Findings mit hohem Risiko oder niedriger Maturity
- Konkrete Empfehlungen aus den Knowledge Units
- Abhaengigkeiten zwischen den Schritten
- Realistische Zeitrahmen fuer ein mittelstaendisches Unternehmen

Antworte NUR mit dem JSON-Objekt.`;
}
