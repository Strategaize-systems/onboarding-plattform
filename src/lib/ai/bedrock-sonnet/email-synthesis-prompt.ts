// V9.5 SLC-V9.5-B MT-2 — Cross-Thread-Synthese System-Prompt + Versions-Anker
//
// Slice: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-2)
// Feature: FEAT-080  DECs: DEC-214 (neue Tabelle), DEC-215 (Partition nach
//          suggested_section, 1 Call/Section), DEC-216 (bounded, kein Verwerfen
//          in der Synthese — das macht der Critic in SLC-V9.5-C)
//
// Quelle: ARCHITECTURE.md §"V9.5 Architecture Addendum" §6 (Synthese-Prompt-
//   Entwurf). Frisch entworfen — Prinzip-Reuse aus email-pattern-prompt.ts
//   (Strict-JSON, Strategaize-Wir-Voice, Versions-Anker), KEIN Code-1:1.
//
// Privacy-Kern (DEC-214 / AC-B-3): thread-lokale Pseudonyme P1/P2 sind ueber
// Fragmente hinweg NICHT vergleichbar → KEINE P1/P2-Token in die Ausgabe.

/**
 * Prompt-Version Anker — wird in ai_cost_ledger.metadata mitgespeichert
 * fuer Cache-Invalidation in spaeteren V9.x (A/B-Tests, Prompt-Refinements).
 */
export const V95_SYNTHESIS_PROMPT_VERSION = "v1.0.0-2026-06-12";

/**
 * System-Prompt fuer Sonnet Cross-Thread-Synthese pro suggested_section-Gruppe.
 * Striktes JSON-Output-Format. Modell antwortet AUSSCHLIESSLICH mit dem
 * JSON-Objekt — keine Markdown-Codeblocks, kein Prefix, kein Postfix.
 */
export const V95_SYNTHESIS_SYSTEM_PROMPT = [
  "Du bist ein Geschaeftsanalyst. Du erhaeltst BEREITS extrahierte Email-Pattern-Fragmente eines Unternehmens — alle aus demselben Themenbereich — und verdichtest sie zu konsolidierten Handbuch-Bausteinen (Units). Mehrere Fragmente, die dieselbe wiederkehrende Aussage / Entscheidung / Antwort belegen, werden zu EINER Unit gemerged.",
  "",
  "**Wichtige Vorgaben:**",
  "1. Schreibe jede konsolidierte `description` THREAD-AGNOSTISCH und generisch ('der Kunde', 'wir'). Die Eingabe-Pseudonyme P1/P2 sind thread-lokal und ueber Fragmente hinweg NICHT vergleichbar — uebernimm KEINE P1/P2-Token in die Ausgabe.",
  "2. Strategaize-Wir-Voice: sachlich, verkaufsfrei, kein Marketing-Sprech, KEINE Pricing-Hinweise.",
  "3. Aggregiere Evidenz: jede Unit listet `source_pattern_ids` (die IDs der belegenden Eingabe-Patterns) + `evidence_count` (Anzahl distinkter belegender Patterns) + bis zu 5 repraesentative `evidence_snippets` (jeweils mit `source_pattern_id` getaggt).",
  "4. `aggregated_confidence` (0.0-1.0) ist belegdichte-gewichtet — nicht ein naives Mittel der Einzel-Confidences.",
  "5. Verwirf bei der Synthese noch NICHTS. Trivialitaet, Halluzination und Redundanz prueft ein nachgelagerter Critic. Lieber konservativ mergen (2 Units statt 1 ueber-gemergte) als Nuance verlieren.",
  "6. `suggested_section` jeder Unit ist der Section-Name der Eingabe-Gruppe (vom Caller vorgegeben).",
  "",
  "**Output-Format — STRIKT JSON, NICHTS DRUMHERUM:**",
  "```",
  "{",
  '  "units": [',
  "    {",
  '      "title": "...",',
  '      "description": "...",',
  '      "themes": ["..."],',
  '      "suggested_section": "...",',
  '      "source_pattern_ids": ["<pattern-id>", "..."],',
  '      "evidence_count": 3,',
  '      "evidence_snippets": [{ "text": "...", "source_pattern_id": "<pattern-id>" }],',
  '      "aggregated_confidence": 0.82',
  "    }",
  "  ]",
  "}",
  "```",
  "",
  "**WICHTIG:** Antworte AUSSCHLIESSLICH mit dem JSON-Objekt. Keine Markdown-Codeblocks, keine Erklaerung davor oder danach. Beginne deine Antwort mit `{` und beende sie mit `}`. Verwende NUR `source_pattern_id`-Werte aus den gelieferten Eingabe-Patterns.",
].join("\n");

export interface SynthesisInputPatternForPrompt {
  id: string;
  title: string;
  description: string;
  evidence_snippets: string[] | null;
  themes: string[] | null;
  confidence: number;
  thread_id: string;
}

/**
 * Baut den User-Prompt fuer eine suggested_section-Gruppe: Section-Name +
 * kompaktes JSON-Array der Patterns. Der thread_id-Kontext bleibt drin, damit
 * das Modell Cross-Thread-Belege erkennt — aber die Ausgabe-Description bleibt
 * thread-agnostisch (Vorgabe 1 im System-Prompt).
 *
 * V9.8 SLC-V9.8-B MT-2 (FEAT-088, DEC-231): `existingTags` ist das kontrollierte
 * Tenant-Tag-Vokabular (Top-N aus knowledge_unit.themes, getTenantTagVocabulary).
 * Bei nicht-leerem Vokabular wird ein Block + Use-existing-where-fits-Regel
 * injiziert, damit das Modell bestehende Tags reused statt Synonyme zu erfinden.
 * Leeres Vokabular → Block weggelassen, der Prompt ist byte-identisch zur
 * V9.5-Baseline (AC-B-2, 0 Regression).
 */
export function buildSynthesisUserPrompt(
  sectionName: string,
  patterns: SynthesisInputPatternForPrompt[],
  existingTags: string[] = [],
): string {
  const compact = patterns.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    evidence_snippets: p.evidence_snippets ?? [],
    themes: p.themes ?? [],
    confidence: p.confidence,
    thread_id: p.thread_id,
  }));

  const cleanTags = existingTags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0);

  const lines: string[] = [];
  lines.push(`Themenbereich (suggested_section): ${sectionName}`);
  lines.push(`Anzahl Eingabe-Pattern-Fragmente: ${patterns.length}`);
  lines.push("");
  lines.push("Eingabe-Patterns (JSON-Array):");
  lines.push(JSON.stringify(compact, null, 2));
  lines.push("");
  if (cleanTags.length > 0) {
    lines.push(
      "Bestehendes Tag-Vokabular dieses Unternehmens (nach Haeufigkeit):",
    );
    lines.push(JSON.stringify(cleanTags));
    lines.push(
      "Nutze fuer das `themes`-Feld jeder Unit zuerst einen passenden Tag aus " +
        "dieser Liste. Entscheide nur dann ein NEUES Tag, wenn inhaltlich " +
        "keiner passt — vermeide Synonyme zu bereits bestehenden Tags.",
    );
    lines.push("");
  }
  lines.push(
    "Verdichte diese Fragmente zu konsolidierten Units im vorgegebenen " +
      "Strict-JSON-Format. Beginne mit `{` und beende mit `}`.",
  );
  return lines.join("\n");
}
