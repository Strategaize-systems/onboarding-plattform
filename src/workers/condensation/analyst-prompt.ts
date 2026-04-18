// Analyst Prompt Builder — ported from OS blueprint-analyze SKILL.md
// Builds system + user prompt for the analyst role in the condensation pipeline.
// The analyst creates one Debrief Item per subtopic from block raw data.

import type { BlockAnswer, BlockDefinition, ChallengerOutput } from "./types";

/**
 * Build the analyst system prompt.
 * Defines the analyst's role, output format, and quality rules.
 */
function buildSystemPrompt(): string {
  return `Du bist ein erfahrener Management-Consulting-Analyst mit Spezialisierung auf Operational Excellence, Exit-Readiness und Unternehmensrestrukturierung.

DEINE AUFGABE:
Analysiere die Rohdaten eines Blueprint-Blocks und erstelle evidenzbasierte Debrief Items — ein Item pro Subtopic. Diese Items werden direkt in Beratungsgesprächen mit dem Kunden verwendet. Qualität und Vollständigkeit sind kritisch.

DEBRIEF ITEM STRUKTUR (pro Subtopic):
Jedes Item muss enthalten:
- subtopic: Subtopic-Bezeichnung (z.B. "A1 Grundverständnis")
- unit_type: finding | risk | action | observation
- title: Prägnanter Titel (max 80 Zeichen)
- current_state: Ist-Zustand, evidenzbasiert. Wenn Datenlage dünn: "low confidence" explizit vermerken
- target_state: Soll-Zustand, erreichbar und kontextgerecht
- body: Ausführliche Beschreibung mit Analyse und Kontext
- confidence: low | medium | high
- maturity: 0-10 (0=nicht vorhanden, 10=exzellent)
- risk: 0-10 (0=kein Risiko, 10=kritisches Risiko)
- leverage: 0-10 (0=kein Hebel, 10=sehr hoher Hebel)
- priority: P0 (KO-Hart/Deal-Blocker) | P1 (kritisch) | P2 (wichtig) | P3 (nice-to-have)
- traffic_light: red | yellow | green
- recommendation: Konkrete, umsetzbare Handlungsempfehlung
- next_step: Nächster konkreter Schritt
- owner: Wer ist verantwortlich (Rolle, nicht Name)
- effort: S (< 1 Woche) | M (1-4 Wochen) | L (> 1 Monat)
- dependencies: Liste von Abhängigkeiten zu anderen Subtopics/Bereichen
- tags: Relevante Tags (z.B. "KO-Hart", "Owner-Dependency", "SOP-Trigger")
- evidence_refs: Liste der Frage-IDs, deren Antworten diese Bewertung stützen

QUALITÄTSREGELN:
- Ein Debrief Item PRO Subtopic (nicht pro Frage, nicht pro Block)
- Jeder current_state MUSS durch Antworten gestützt sein oder "low confidence" enthalten
- P0 NUR für KO-Hart-Fragen oder Deal-Blocker
- Traffic Light konsistent mit Scores: red (maturity 0-3 ODER risk 7-10), yellow (maturity 4-6), green (maturity 7-10 UND risk 0-3)
- Effort realistisch: S/M/L — nicht xs, nicht xl
- Keine persönlichen Daten in den Items
- Keine erfundenen evidence_refs — nur tatsächlich vorhandene Frage-IDs
- Keine generischen Empfehlungen ("sollte verbessert werden") — konkret!
- NICHT auf ein Hauptproblem verdichten — die volle Matrix pro Subtopic erhalten
- Subtopics mit dünner Datenlage NICHT überspringen — Item mit "low confidence" erstellen

KO-ASSESSMENT:
Zusätzlich zu den Items: Erstelle eine Bewertung aller KO-relevanten Fragen:
- question_id, flag (KO-Hart/KO-Soft), status (critical/warning/ok), note

ALLES auf Deutsch.

OUTPUT-FORMAT:
Antworte ausschließlich mit validem JSON. Kein einleitender Text, keine Erklärung, keine Markdown-Fences.
{
  "block_key": "A",
  "debrief_items": [...],
  "ko_assessment": [...],
  "sop_gaps": ["..."],
  "cross_block_observations": ["..."],
  "confidence_notes": ["..."],
  "challenger_responses": [...]
}`;
}

/**
 * Build the analyst user prompt with raw data and context.
 */
export function buildAnalystPrompt(params: {
  block: BlockDefinition;
  answers: BlockAnswer[];
  iteration: number;
  challengerFeedback?: ChallengerOutput;
}): { system: string; user: string } {
  const { block, answers, iteration, challengerFeedback } = params;

  // Identify subtopics from questions
  const subtopics = new Set<string>();
  for (const q of block.questions) {
    if (q.subtopic) subtopics.add(q.subtopic);
  }

  // Build raw data section
  const rawDataLines: string[] = [];
  rawDataLines.push(`BLOCK: ${block.key} — ${block.title}`);
  if (block.description) {
    rawDataLines.push(`Beschreibung: ${block.description}`);
  }
  rawDataLines.push(`Subtopics: ${[...subtopics].join(", ") || "keine expliziten Subtopics"}`);
  rawDataLines.push(`Anzahl Fragen: ${block.questions.length}`);
  rawDataLines.push(`Anzahl Antworten: ${answers.length}`);
  rawDataLines.push("");
  rawDataLines.push("FRAGEN UND ANTWORTEN:");
  rawDataLines.push("");

  for (const q of block.questions) {
    const answer = answers.find((a) => a.question_id === q.id);
    const flags = q.flags?.length ? ` [${q.flags.join(", ")}]` : "";
    const subtopicLabel = q.subtopic ? ` (${q.subtopic})` : "";

    rawDataLines.push(`[${q.id}]${subtopicLabel}${flags}: "${q.text}"`);
    if (answer && answer.answer_text?.trim()) {
      rawDataLines.push(`Antwort: ${answer.answer_text}`);
    } else {
      rawDataLines.push("Antwort: (keine Antwort)");
    }
    rawDataLines.push("");
  }

  // Build user prompt
  let userPrompt = `ITERATION: ${iteration}\n\n`;
  userPrompt += rawDataLines.join("\n");

  // Add challenger feedback for iterations > 1
  if (iteration > 1 && challengerFeedback) {
    userPrompt += "\n\n--- CHALLENGER-FEEDBACK AUS VORHERIGER ITERATION ---\n\n";
    userPrompt += `Verdict: ${challengerFeedback.verdict}\n`;
    userPrompt += `Begründung: ${challengerFeedback.verdict_rationale}\n\n`;

    if (challengerFeedback.findings.length > 0) {
      userPrompt += "FINDINGS (addressiere JEDE Kritik explizit):\n\n";
      for (const f of challengerFeedback.findings) {
        userPrompt += `[${f.id}] ${f.severity.toUpperCase()} — ${f.title}\n`;
        userPrompt += `  ${f.description}\n`;
        if (f.affected_items.length > 0) {
          userPrompt += `  Betrifft: ${f.affected_items.join(", ")}\n`;
        }
        userPrompt += `  Erwartete Aktion: ${f.expected_action}\n\n`;
      }
    }

    if (challengerFeedback.positive_observations.length > 0) {
      userPrompt += "POSITIV (beibehalten):\n";
      for (const obs of challengerFeedback.positive_observations) {
        userPrompt += `- ${obs}\n`;
      }
    }

    userPrompt +=
      "\n\nWICHTIG: Dokumentiere deine Reaktion auf jede Kritik im 'challenger_responses'-Array.\n";
  }

  return {
    system: buildSystemPrompt(),
    user: userPrompt,
  };
}
