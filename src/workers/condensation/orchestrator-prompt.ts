// Orchestrator Prompt Builder — Meta-Assessment of Knowledge Unit quality + gap detection.
// The orchestrator evaluates the complete set of KUs after the Analyst+Challenger loop
// and identifies knowledge gaps that require backspelling (follow-up questions).

import type { AnalystDebriefItem, BlockAnswer, BlockDefinition } from "./types";

/**
 * Build the orchestrator system prompt.
 * Defines the orchestrator's role as quality assessor and gap detector.
 */
function buildSystemPrompt(): string {
  return `Du bist ein erfahrener Meta-Analyst für Wissenserhebungen in der Unternehmensberatung. Deine Aufgabe ist die Qualitätsbewertung einer abgeschlossenen Block-Analyse.

DEINE ROLLE:
Du bewertest die Gesamtqualität der produzierten Knowledge Units (KUs) eines Blocks und identifizierst Wissenslücken, die durch Nachfragen (Backspelling) geschlossen werden könnten.

Du bist NICHT der Analyst. Du bist NICHT der Challenger. Du bist der Orchestrator — du bewertest das Ergebnis der Analyst+Challenger-Arbeit als Ganzes.

BEWERTUNGSKRITERIEN:

1. COVERAGE (Abdeckung):
   - Welche Subtopics sind durch KUs abgedeckt?
   - Welche Subtopics fehlen oder haben nur dünne Datenlage?
   - Coverage-Ratio: Anzahl abgedeckte Subtopics / Gesamt-Subtopics

2. EVIDENCE QUALITY (Evidenzstärke):
   - Wie viele KUs haben "high confidence"?
   - Welche KUs stützen sich nur auf vage Angaben?
   - Gibt es KUs ohne jede Evidenz-Referenz?

3. CONSISTENCY (Konsistenz):
   - Widersprechen sich KUs untereinander?
   - Sind Scores (maturity, risk, leverage) plausibel zueinander?
   - Gibt es logische Inkonsistenzen?

4. GAP QUESTIONS (Wissenslücken):
   - Identifiziere konkrete Fragen, die die Qualität der Analyse signifikant verbessern würden.
   - Unterscheide "required" (ohne diese Info ist die Analyse unvollständig) und "nice_to_have" (würde die Analyse verfeinern).
   - Jede Gap-Question muss einem Subtopic zugeordnet sein.
   - Max 8 Gap-Questions pro Block.

5. RECOMMENDATION (Gesamtempfehlung):
   - "sufficient": Die Analyse ist vollständig genug für den nächsten Schritt.
   - "needs_backspelling": Es gibt relevante Lücken, die durch Nachfragen geschlossen werden sollten.
   - "critical_gaps": Die Analyse hat kritische Lücken, ohne die keine belastbare Beratung möglich ist.

QUALITÄTSREGELN:
- Bewerte fair — nicht jeder Block muss perfekt sein.
- "sufficient" bedeutet NICHT "perfekt", sondern "brauchbar für Beratungszwecke".
- Gap-Questions müssen KONKRET sein — nicht "Erzählen Sie mehr über X".
- Bevorzuge wenige präzise Gap-Questions über viele vage.
- Berücksichtige die Originaldaten: Wenn eine Frage gar nicht beantwortet wurde, ist das ein Gap.
- overall_score: 0-100 (0=unbrauchbar, 50=Basisqualität, 75=gut, 90+=exzellent)

OUTPUT-FORMAT:
Antworte ausschließlich mit validem JSON. Kein einleitender Text, keine Erklärung, keine Markdown-Fences.
{
  "overall_score": 72,
  "coverage": {
    "covered_subtopics": ["A1 Grundverständnis", "A2 Marktposition"],
    "missing_subtopics": ["A3 Wettbewerb"],
    "coverage_ratio": "6/8"
  },
  "evidence_quality": {
    "strong_evidence": ["A1 — direkte Zahlenangaben vom Owner"],
    "weak_evidence": ["A4 — nur vage Aussagen"],
    "no_evidence": ["A3 — keine Antwort vorhanden"],
    "score": 65
  },
  "consistency": {
    "consistent": true,
    "issues": [],
    "score": 85
  },
  "gap_questions": [
    {
      "question_text": "Wie hoch ist der Marktanteil Ihres Unternehmens im Hauptsegment?",
      "context": "Die Marktposition wurde beschrieben, aber ohne quantitative Einordnung.",
      "subtopic": "A2 Marktposition",
      "priority": "required",
      "related_ku_title": "Marktpositionierung und Wettbewerbsumfeld"
    }
  ],
  "recommendation": "needs_backspelling",
  "recommendation_rationale": "Die Kernbereiche sind abgedeckt, aber A3 Wettbewerb hat keine Datenlage und A2 fehlt quantitative Evidenz."
}`;
}

/**
 * Build the orchestrator user prompt with KU results and original data context.
 */
export function buildOrchestratorPrompt(params: {
  block: BlockDefinition;
  answers: BlockAnswer[];
  debriefItems: AnalystDebriefItem[];
}): { system: string; user: string } {
  const { block, answers, debriefItems } = params;

  // Identify subtopics from questions
  const subtopics = new Set<string>();
  for (const q of block.questions) {
    if (q.subtopic) subtopics.add(q.subtopic);
  }

  // Build context section
  const lines: string[] = [];
  lines.push(`BLOCK: ${block.key} — ${block.title}`);
  if (block.description) {
    lines.push(`Beschreibung: ${block.description}`);
  }
  lines.push(`Subtopics im Template: ${[...subtopics].join(", ") || "keine expliziten Subtopics"}`);
  lines.push(`Anzahl Fragen: ${block.questions.length}`);
  lines.push(`Anzahl Antworten: ${answers.length}`);
  lines.push(`Anzahl produzierte KUs: ${debriefItems.length}`);
  lines.push("");

  // Original answers section (condensed for orchestrator)
  lines.push("ORIGINALDATEN (Fragen + Antworten):");
  lines.push("");
  for (const q of block.questions) {
    const answer = answers.find((a) => a.question_id === q.id);
    const subtopicLabel = q.subtopic ? ` (${q.subtopic})` : "";
    lines.push(`[${q.id}]${subtopicLabel}: "${q.text}"`);
    if (answer && answer.answer_text?.trim()) {
      lines.push(`  Antwort: ${answer.answer_text.substring(0, 500)}${answer.answer_text.length > 500 ? "..." : ""}`);
    } else {
      lines.push("  Antwort: (keine Antwort)");
    }
  }
  lines.push("");

  // KU results section
  lines.push("PRODUZIERTE KNOWLEDGE UNITS:");
  lines.push("");
  for (const item of debriefItems) {
    lines.push(`--- KU: ${item.title} ---`);
    lines.push(`  Subtopic: ${item.subtopic}`);
    lines.push(`  Type: ${item.unit_type} | Confidence: ${item.confidence}`);
    lines.push(`  Scores: Maturity ${item.maturity}/10, Risk ${item.risk}/10, Leverage ${item.leverage}/10`);
    lines.push(`  Priority: ${item.priority} | Traffic Light: ${item.traffic_light}`);
    lines.push(`  Ist-Zustand: ${item.current_state}`);
    lines.push(`  Soll-Zustand: ${item.target_state}`);
    lines.push(`  Empfehlung: ${item.recommendation}`);
    lines.push(`  Evidence-Refs: ${item.evidence_refs.length > 0 ? item.evidence_refs.join(", ") : "keine"}`);
    lines.push("");
  }

  return {
    system: buildSystemPrompt(),
    user: lines.join("\n"),
  };
}
