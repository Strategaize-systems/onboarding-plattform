// Challenger Prompt Builder — ported from OS blueprint-challenge SKILL.md
// Builds system + user prompt for the challenger (Devil's Advocate) role.
// The challenger audits the analyst's Debrief Items for completeness,
// evidence quality, score consistency, and KO-coverage.

import type { AnalystOutput, BlockAnswer, BlockDefinition } from "./types";

/**
 * Build the challenger system prompt.
 */
function buildSystemPrompt(): string {
  return `Du bist ein kritischer Auditor und Devil's Advocate. Dein Ziel: die Debrief Items des Analysten gnadenlos hinterfragen, Schwächen aufdecken und Lücken finden.

DEIN MINDSET:
"Würde ich diese Ergebnisse morgen dem Kunden präsentieren, wenn Millionen Euro auf dem Spiel stehen?"

WAS AUF DEM SPIEL STEHT:
- Fehlende Findings = übersehenes Problem = Vertrauensverlust
- Falsche Scores = falsche Prioritäten = Ressourcen falsch eingesetzt
- Übersehene KO-Kriterien = Deal-Blocker verborgen
- Zu verdichtet = Details verloren, Kunde fühlt sich nicht ernst genommen

DEINE 10 SYSTEMATISCHEN PRÜFUNGEN (jede ist Pflicht):

1. VOLLSTÄNDIGKEIT: Zähle Subtopics in den Quelldaten vs. Items in der Analyse. Jedes fehlende Subtopic ist ein CRITICAL Finding.

2. EVIDENZ-QUALITÄT: Für jedes Item — existiert die evidence_ref? Stützt die referenzierte Antwort tatsächlich den current_state?

3. CURRENT STATE: Ehrlich und vollständig? Beschönigt oder dramatisiert? Low confidence bei dünner Datenlage vermerkt?

4. TARGET STATE: Erreichbar oder utopisch? Kontextgerecht? Spezifisch genug? Effort passt zur Lücke?

5. SCORE-KONSISTENZ:
   - Maturity (0-10) vs. current_state vs. Datenlage?
   - Risk vs. KO-Flags?
   - Leverage realistisch?
   - Scores untereinander konsistent?

6. PRIORITÄT & TRAFFIC LIGHT:
   - P0 nur für KO-Hart oder Deal-Blocker?
   - P3 zu nachsichtig?
   - Traffic Light (red/yellow/green) konsistent mit Scores?
   - Inflation oder Deflation?

7. KO-KRITERIEN:
   - Alle KO-Hart im Assessment?
   - Alle KO-Soft erwähnt?
   - Bewertungen (critical/warning/ok) plausibel?
   - Deal-Blocker markiert?

8. EMPFEHLUNGSQUALITÄT:
   - Konkret genug zum Handeln?
   - Next Step logisch?
   - Owner korrekt?
   - Effort realistisch?

9. CROSS-BLOCK-BEOBACHTUNGEN:
   - Muster erkannt?
   - Owner-Dependency über Subtopics hinweg?

10. CHALLENGER-RESPONSES (Iteration > 1):
    - Wurde jede vorherige Kritik substanziell adressiert?
    - Korrekturen umgesetzt?
    - Neue Probleme entstanden?

SEVERITY-KLASSIFIKATION:
- critical: Fehlendes Subtopic, fehlende KO-Bewertung, falsche evidence_refs
- major: Inkonsistente Scores, falsche Prioritäten, unvollständiger current_state
- minor: Formulierungsschwächen, leicht optimistische Bewertung
- note: Verbesserungsvorschlag, kein Problem

VERDICT:
- REJECTED: Fehlende Subtopics oder KO-Bewertungen
- NEEDS_REVISION: Scores/Prioritäten falsch, Evidence-Probleme
- ACCEPTED_WITH_NOTES: Nur minor/note Findings
- ACCEPTED: Keine substanziellen Probleme

CHALLENGER-ETHIK:
- SEI schonungslos ehrlich bei fehlenden Subtopics oder falschen Scores
- BELEGE jede Kritik
- ERKENNE an was der Analyst gut gemacht hat
- Kritisiere NICHT um der Kritik willen
- Setze KEINE unrealistischen Standards
- Fixiere dich NICHT auf kleine Formulierungen während große Probleme bestehen

ALLES auf Deutsch.

OUTPUT-FORMAT:
Antworte ausschließlich mit validem JSON. Kein Text, keine Markdown-Fences.
{
  "verdict": "NEEDS_REVISION",
  "verdict_rationale": "...",
  "findings": [...],
  "statistics": {
    "total_findings": 0,
    "critical": 0,
    "major": 0,
    "minor": 0,
    "notes": 0,
    "subtopic_coverage": "5/5"
  },
  "positive_observations": ["..."]
}`;
}

/**
 * Build the challenger user prompt with analysis and raw data.
 */
export function buildChallengerPrompt(params: {
  block: BlockDefinition;
  answers: BlockAnswer[];
  analystOutput: AnalystOutput;
  iteration: number;
}): { system: string; user: string } {
  const { block, answers, analystOutput, iteration } = params;

  // Count subtopics
  const subtopics = new Set<string>();
  for (const q of block.questions) {
    if (q.subtopic) subtopics.add(q.subtopic);
  }

  let userPrompt = `ITERATION: ${iteration}\n\n`;

  // Analysis to review
  userPrompt += "=== ANALYST-OUTPUT ZUR PRÜFUNG ===\n\n";
  userPrompt += JSON.stringify(analystOutput, null, 2);
  userPrompt += "\n\n";

  // Raw data for cross-reference
  userPrompt += "=== QUELLDATEN ZUR GEGENPRÜFUNG ===\n\n";
  userPrompt += `Block: ${block.key} — ${block.title}\n`;
  userPrompt += `Erwartete Subtopics: ${[...subtopics].join(", ") || "keine expliziten"} (${subtopics.size} Stück)\n`;
  userPrompt += `Anzahl Fragen: ${block.questions.length}\n`;
  userPrompt += `Anzahl Antworten mit Inhalt: ${answers.filter((a) => a.answer_text?.trim()).length}\n\n`;

  userPrompt += "FRAGEN UND ANTWORTEN:\n\n";
  for (const q of block.questions) {
    const answer = answers.find((a) => a.question_id === q.id);
    const flags = q.flags?.length ? ` [${q.flags.join(", ")}]` : "";
    const subtopicLabel = q.subtopic ? ` (${q.subtopic})` : "";

    userPrompt += `[${q.id}]${subtopicLabel}${flags}: "${q.text}"\n`;
    if (answer && answer.answer_text?.trim()) {
      userPrompt += `Antwort: ${answer.answer_text}\n\n`;
    } else {
      userPrompt += "Antwort: (keine Antwort)\n\n";
    }
  }

  // Prüfhinweise
  userPrompt += "\n--- PRÜFANWEISUNGEN ---\n\n";
  userPrompt += `1. Zähle Items in der Analyse: ${analystOutput.debrief_items.length} Items vorhanden.\n`;
  userPrompt += `2. Erwartete Subtopics: ${subtopics.size}. Prüfe ob jedes Subtopic ein Item hat.\n`;
  userPrompt += `3. Prüfe jede evidence_ref: Existiert die Frage-ID in den Quelldaten? Stützt die Antwort den current_state?\n`;
  userPrompt += `4. Prüfe Score-Konsistenz: maturity vs. current_state, risk vs. KO-Flags.\n`;
  userPrompt += `5. KO-Assessment: Sind alle Fragen mit KO-Flags im ko_assessment erfasst?\n`;

  if (iteration > 1 && analystOutput.challenger_responses?.length) {
    userPrompt += `\n6. CHALLENGER-RESPONSES prüfen: Hat der Analyst jede vorherige Kritik substanziell adressiert?\n`;
    userPrompt += `   Analyst-Responses:\n`;
    for (const resp of analystOutput.challenger_responses) {
      userPrompt += `   [${resp.finding_id}]: ${resp.response}\n`;
    }
  }

  return {
    system: buildSystemPrompt(),
    user: userPrompt,
  };
}
