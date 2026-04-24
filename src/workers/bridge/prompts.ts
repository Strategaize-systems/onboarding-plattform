// SLC-035 MT-2 — Prompt-Builder fuer Bridge-Engine (FEAT-023, DEC-034)
//
// Zwei Funktionen:
//   buildTemplatePromptForSubtopic — verfeinert eine Template-Schablone pro subtopic_bridge.
//                                    Mitarbeiter-Auswahl + minimale Wortlaut-Anpassung.
//   buildFreeFormPrompt — generiert max N Vorschlaege fuer Themen, die das Template nicht
//                         abdeckt. Basis: GF-KUs + Diagnosen + Addendum aus Template.
//
// JSON-Output wird per System-Prompt erzwungen. Claude Sonnet folgt dem Schema
// zuverlaessig wenn explizit vorgegeben. Kein JSON-Schema-Validator im Prompt —
// der Parser (handle-bridge-job.ts) validiert clientseitig.

import type {
  BridgeDiagnosis,
  BridgeEmployee,
  BridgeKnowledgeUnit,
  BridgeSubtopicBridge,
} from "./types";

export interface BuiltPrompt {
  system: string;
  user: string;
}

// ============================================================
// Template-Refine Prompt
// ============================================================

export function buildTemplatePromptForSubtopic(params: {
  subtopicBridge: BridgeSubtopicBridge;
  subtopicKus: BridgeKnowledgeUnit[];
  subtopicDiagnoses: BridgeDiagnosis[];
  employees: BridgeEmployee[];
}): BuiltPrompt {
  const { subtopicBridge, subtopicKus, subtopicDiagnoses, employees } = params;

  const system = `Du verfeinerst eine Mitarbeiter-Capture-Aufgabe aus einer Template-Schablone.

Deine Aufgabe:
1. Waehle aus der Mitarbeiter-Liste den PASSENDSTEN Mitarbeiter fuer dieses Subtopic.
   Nutze die Rollen-Hinweise (typical_employee_role_hints) als Anhaltspunkt.
   Wenn KEIN Mitarbeiter sinnvoll passt, gib "proposed_employee_user_id": null zurueck
   und setze stattdessen "proposed_employee_role_hint" (z.B. "Operations Manager").
2. Passe bei Bedarf den Titel, die Beschreibung oder die Fragen leicht an den
   konkreten Kontext der GF-Antworten und der Diagnose an. NUR wenn echter
   Mehrwert entsteht — sonst lass sie unveraendert (Felder ausgelassen oder null).
3. Vermeide Doppelungen mit dem, was die GF schon erzaehlt hat.

Antworte AUSSCHLIESSLICH mit einem einzelnen JSON-Objekt in diesem Format:

{
  "proposed_employee_user_id": "uuid-oder-null",
  "proposed_employee_role_hint": "Rollen-Text-oder-null",
  "adjusted_title": "Titel-Text-oder-null",
  "adjusted_description": "Beschreibung-oder-null",
  "adjusted_questions": [{"id": "EM-xyz", "text": "Frage", "required": true}] oder null
}

Kein Markdown, keine Erklaerung, kein Code-Fence. Nur das JSON-Objekt.`;

  const kuBlock = subtopicKus.length
    ? subtopicKus
        .map(
          (ku, i) =>
            `### KU ${i + 1} (${ku.unit_type}, ${ku.confidence})\n**${ku.title}**\n${ku.body}`
        )
        .join("\n\n")
    : "_Keine Knowledge Units fuer dieses Subtopic._";

  const diagBlock = subtopicDiagnoses.length
    ? subtopicDiagnoses
        .map(
          (d, i) =>
            `### Diagnose ${i + 1} (${d.ampel ?? "n/a"}, ${d.severity ?? "n/a"})\n${d.summary ?? ""}`
        )
        .join("\n\n")
    : "_Keine Diagnose fuer dieses Subtopic._";

  const empBlock = employees.length
    ? employees
        .map(
          (e) =>
            `- user_id=${e.user_id} | ${e.display_name}` +
            (e.role_hint ? ` | Rolle: ${e.role_hint}` : "") +
            (e.department ? ` | Abteilung: ${e.department}` : "")
        )
        .join("\n")
    : "_Keine aktiven Mitarbeiter._";

  const roleHintBlock = subtopicBridge.typical_employee_role_hints?.length
    ? subtopicBridge.typical_employee_role_hints.join(", ")
    : "_keine Vorgabe_";

  const user = `# Subtopic: ${subtopicBridge.subtopic_key}

## Template-Schablone

**Titel:** ${subtopicBridge.block_template.title}
**Beschreibung:** ${subtopicBridge.block_template.description ?? ""}
**Fragen:**
${subtopicBridge.block_template.questions
  .map((q, i) => `  ${i + 1}. (${q.id}) ${q.text}${q.required ? " [required]" : ""}`)
  .join("\n")}

**Typische Rollen fuer dieses Subtopic:** ${roleHintBlock}

## Kontext aus GF-Antworten (Knowledge Units)

${kuBlock}

## Kontext aus Diagnose

${diagBlock}

## Verfuegbare Mitarbeiter

${empBlock}

## Aufgabe

Waehle den passendsten Mitarbeiter und verfeinere die Schablone minimal fuer dieses
Subtopic. Antworte NUR mit dem JSON-Objekt.`;

  return { system, user };
}

// ============================================================
// Free-Form Prompt
// ============================================================

export function buildFreeFormPrompt(params: {
  maxProposals: number;
  systemPromptAddendum?: string;
  existingSubtopicKeys: string[];
  allKus: BridgeKnowledgeUnit[];
  allDiagnoses: BridgeDiagnosis[];
  employees: BridgeEmployee[];
}): BuiltPrompt {
  const {
    maxProposals,
    systemPromptAddendum,
    existingSubtopicKeys,
    allKus,
    allDiagnoses,
    employees,
  } = params;

  const system = `Du bist ein M&A-Berater und identifizierst Themen fuer eine Mitarbeiter-Befragung,
die die Geschaeftsfuehrung nicht selbst beantworten kann.

${systemPromptAddendum ?? ""}

Deine Aufgabe:
Analysiere die unten gelieferten GF-Antworten (Knowledge Units) und die Diagnose.
Identifiziere bis zu ${maxProposals} Themen, die:
- in den bereits durch die Template-Schablone abgedeckten Subtopics NICHT vorkommen
- aus operativer Mitarbeiter-Sicht echten Mehrwert bringen
- konkret genug sind, dass ein Mitarbeiter sie in 3-5 Fragen beantworten kann

Gib pro Vorschlag einen Block-Titel, eine Beschreibung und MINDESTENS 2 Fragen zurueck.
Ordne wenn moeglich einen passenden Mitarbeiter via proposed_employee_user_id zu.
Wenn kein Mitarbeiter passt: proposed_employee_role_hint setzen (z.B. "Operations Manager").

Antworte AUSSCHLIESSLICH mit einem einzelnen JSON-Objekt in diesem Format:

{
  "proposals": [
    {
      "block_title": "Titel",
      "description": "Beschreibung",
      "questions": [
        {"id": "EM-FF1-1", "text": "Frage 1", "required": true},
        {"id": "EM-FF1-2", "text": "Frage 2", "required": false}
      ],
      "proposed_employee_user_id": "uuid-oder-null",
      "proposed_employee_role_hint": "Rollen-Text-oder-null"
    }
  ]
}

Wenn nichts Sinnvolles uebrigbleibt: gib einfach {"proposals": []} zurueck.
Kein Markdown, keine Erklaerung, kein Code-Fence. Nur das JSON-Objekt.`;

  const existingBlock = existingSubtopicKeys.length
    ? existingSubtopicKeys.map((k) => `- ${k}`).join("\n")
    : "_keine_";

  const kuBlock = allKus.length
    ? allKus
        .map(
          (ku, i) =>
            `### KU ${i + 1} [${ku.block_key}${ku.subtopic_key ? "/" + ku.subtopic_key : ""}] (${ku.unit_type}, ${ku.confidence})\n**${ku.title}**\n${ku.body}`
        )
        .join("\n\n")
    : "_Keine Knowledge Units._";

  const diagBlock = allDiagnoses.length
    ? allDiagnoses
        .map(
          (d, i) =>
            `### Diagnose ${i + 1} [${d.block_key}${d.subtopic_key ? "/" + d.subtopic_key : ""}] (${d.ampel ?? "n/a"}, ${d.severity ?? "n/a"})\n${d.summary ?? ""}`
        )
        .join("\n\n")
    : "_Keine Diagnose._";

  const empBlock = employees.length
    ? employees
        .map(
          (e) =>
            `- user_id=${e.user_id} | ${e.display_name}` +
            (e.role_hint ? ` | Rolle: ${e.role_hint}` : "") +
            (e.department ? ` | Abteilung: ${e.department}` : "")
        )
        .join("\n")
    : "_Keine aktiven Mitarbeiter._";

  const user = `# Free-Form Mitarbeiter-Aufgaben

## Bereits durch Template-Schablone abgedeckt (NICHT doppeln!)

${existingBlock}

## Alle GF-Antworten (Knowledge Units, alle Bloecke)

${kuBlock}

## Alle Diagnosen

${diagBlock}

## Verfuegbare Mitarbeiter

${empBlock}

## Aufgabe

Identifiziere max ${maxProposals} NEUE Themen fuer Mitarbeiter-Befragung, die das
Template NICHT abdeckt. Antworte NUR mit dem JSON-Objekt.`;

  return { system, user };
}
