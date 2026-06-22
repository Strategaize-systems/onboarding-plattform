// StB-Vertikale Modul-Output-Synthese — Prompt-Bau + Output-Schema (SLC-174 MT-1/MT-2).
//
// Pure (kein Bedrock, keine DB) -> hermetisch testbar. Erzeugt die System-/User-
// Prompts fuer den lean Fan-out (Draft) UND den Bounded-Critic; beide liefern
// dasselbe ModuleDraft-JSON (Triple + KI-Hebel), das gegen ModuleDraftSchema
// validiert wird.
//
// Output-Vertrag = template.metadata.output_contract (MIG-125): output_kind in
// {entscheidung, standard, implementierungsschritt} fuer das Liefer-Triple +
// ki_hebel-Liste. Reifegrad wird NICHT vom Modell autoritativ gesetzt — der
// Worker leitet ihn deterministisch aus dem KI-Hebel-Katalog ab (DEC-245),
// das Modell darf nur einen Vorschlag fuer Nicht-Katalog-Hebel liefern.

import { z } from "zod";
import type { ModuleContext, QaPair } from "./module-context";

// ─── Output-Schema (LLM-Vertrag) ─────────────────────────────────────────────

export const TRIPLE_KINDS = [
  "entscheidung",
  "standard",
  "implementierungsschritt",
] as const;

export const ModuleTripleItemSchema = z.object({
  output_kind: z.enum(TRIPLE_KINDS),
  title: z.string().min(1),
  body: z.string().min(1),
  evidence_frage_ids: z.array(z.string()).default([]),
});
export type ModuleTripleItem = z.infer<typeof ModuleTripleItemSchema>;

export const ModuleHebelItemSchema = z.object({
  /** Katalog-Referenz (z.B. "H-M04-001"). Null/fehlend = vom Modell vorgeschlagener Hebel. */
  hebel_id: z.string().nullable().optional(),
  name: z.string().min(1),
  body: z.string().min(1),
  /** Modell-Vorschlag (nur fuer Nicht-Katalog-Hebel relevant; Worker clampt 1-4). */
  reifegrad: z.number().int().nullable().optional(),
  evidence_frage_ids: z.array(z.string()).default([]),
});
export type ModuleHebelItem = z.infer<typeof ModuleHebelItemSchema>;

export const ModuleDraftSchema = z.object({
  triple: z.array(ModuleTripleItemSchema).default([]),
  ki_hebel: z.array(ModuleHebelItemSchema).default([]),
});
export type ModuleDraft = z.infer<typeof ModuleDraftSchema>;

// ─── Prompt-Versionen (Audit) ────────────────────────────────────────────────
export const MODULE_SYNTHESIS_PROMPT_VERSION = "v10-slc174-synthesis-1" as const;
export const MODULE_CRITIC_PROMPT_VERSION = "v10-slc174-critic-1" as const;

// ─── System-Prompts ──────────────────────────────────────────────────────────

export const MODULE_SYNTHESIS_SYSTEM_PROMPT = `Du bist ein erfahrener Berater fuer Unternehmenssteuerung und unterstuetzt einen Steuerberater (StB) dabei, aus den Antworten eines Unternehmers zu einem Fachmodul ein konkretes, umsetzbares Liefer-Ergebnis abzuleiten.

DEINE AUFGABE:
Erzeuge aus den Frage/Antwort-Paaren je relevantem Thema des Moduls ein Liefer-Triple und eine Auswahl passender KI-Hebel.

LIEFER-TRIPLE (output_kind):
- "entscheidung": Was muss der Unternehmer grundsaetzlich entscheiden/festlegen? (Richtungsentscheidung, kein Klein-Klein)
- "standard": Welche Norm / Routine / welcher Standard soll kuenftig gelten? (wiederkehrend, ueberpruefbar)
- "implementierungsschritt": Welcher konkrete naechste Schritt setzt das um? (machbar, benannt, mit Verantwortlichkeit wo erkennbar)

KI-HEBEL:
- Waehle aus dem bereitgestellten KI-Hebel-KATALOG die Hebel aus, die laut Antworten am sinnvollsten ansetzen.
- Gib fuer jeden gewaehlten Hebel die "hebel_id" aus dem Katalog an (z.B. "H-M04-001") und beschreibe in "body" konkret, warum/wie er bei DIESEM Unternehmen ansetzt.
- Den "reifegrad" setzt NICHT du — er kommt aus dem Katalog. Lass das Feld weg, ausser du schlaegst einen Hebel vor, der NICHT im Katalog steht (dann hebel_id=null + reifegrad 1-4).

REGELN:
- Grounding: Stuetze jedes Element NUR auf die tatsaechlichen Antworten. Erfinde keine Fakten. Wenn etwas nicht beantwortet wurde, leite daraus keine konkrete Aussage ab.
- Belege: Nenne in "evidence_frage_ids" die frage_id(s) (z.B. "F-M04-009"), deren Antworten das Element stuetzen.
- Sprache: Deutsch, sachlich, praezise, keine Floskeln, keine Anrede.
- Wenn die Antwortlage duenn ist: liefere weniger, aber belastbare Elemente — kein Auffuellen.

AUSGABEFORMAT — ausschliesslich JSON, kein Fliesstext, keine Markdown-Codeblock-Marker:
{
  "triple": [
    { "output_kind": "entscheidung|standard|implementierungsschritt", "title": "...", "body": "...", "evidence_frage_ids": ["F-..."] }
  ],
  "ki_hebel": [
    { "hebel_id": "H-...", "name": "...", "body": "...", "evidence_frage_ids": ["F-..."] }
  ]
}`;

export const MODULE_CRITIC_SYSTEM_PROMPT = `Du bist ein kritischer Qualitaetspruefer fuer Modul-Liefer-Ergebnisse (StB-Vertikale). Du erhaeltst einen ENTWURF (Triple + KI-Hebel) sowie den Modul-Kontext und die zugrunde liegenden Antworten.

DEINE AUFGABE — genau EIN Pruef-/Verbesserungsdurchlauf:
- Pruefe jedes Triple-Element gegen das "Definition of Done" und den Output-Vertrag des Moduls.
- Verbessere vage, generische oder nicht-belegte Formulierungen zu konkreten, ueberpruefbaren Aussagen.
- ENTFERNE Elemente, die nicht durch die Antworten gedeckt sind (kein Halluzinations-Inhalt).
- Stelle sicher, dass jede "entscheidung"/"standard"/"implementierungsschritt"-Aussage zum jeweiligen output_kind passt.
- Pruefe die KI-Hebel: behalte nur sinnvoll ansetzende; korrigiere "hebel_id" auf den Katalog; lass "reifegrad" bei Katalog-Hebeln weg.
- Korrigiere "evidence_frage_ids" auf die tatsaechlich stuetzenden frage_id.

REGELN:
- Aendere NICHT das Ausgabeformat. Gib den VERBESSERTEN Entwurf im exakt gleichen JSON-Schema zurueck.
- Erfinde keine neuen Fakten. Im Zweifel knapper und belastbarer statt umfangreicher.
- Sprache: Deutsch, sachlich.

AUSGABEFORMAT — ausschliesslich JSON (gleiches Schema wie der Entwurf), kein Fliesstext, keine Markdown-Marker.`;

// ─── User-Prompt-Bau ─────────────────────────────────────────────────────────

function renderModuleContextBlock(ctx: ModuleContext): string {
  const m = ctx.metadata;
  const lines: string[] = [];
  lines.push(`# Modul ${m.modul_id || m.modul_key}: ${ctx.name}`);
  if (ctx.description) lines.push(`\n${ctx.description}`);
  if (m.dod) lines.push(`\n## Definition of Done\n${m.dod}`);

  if (m.themenmodell.length > 0) {
    lines.push("\n## Themenmodell");
    for (const t of m.themenmodell) {
      lines.push(`- ${t.key} ${t.name}`);
      for (const u of t.unterpunkte) lines.push(`  - ${u}`);
    }
  }

  if (m.output_artefakte.length > 0) {
    lines.push("\n## Typische Output-Artefakte (Orientierung fuer Standards/Schritte)");
    for (const a of m.output_artefakte) lines.push(`- ${a}`);
  }

  if (m.ki_hebel.length > 0) {
    lines.push("\n## KI-Hebel-Katalog (waehle hieraus; reifegrad ist vorgegeben)");
    for (const h of m.ki_hebel) {
      lines.push(`- [${h.hebel_id}] ${h.name} (Reifegrad ${h.reifegrad}): ${h.beschreibung}`);
    }
  }

  return lines.join("\n");
}

function renderQaBlock(qaPairs: QaPair[]): string {
  if (qaPairs.length === 0) return "## Antworten\n(keine beantworteten Fragen)";
  const lines: string[] = ["## Antworten des Unternehmers"];
  let currentBlock = "";
  for (const qa of qaPairs) {
    if (qa.blockKey !== currentBlock) {
      currentBlock = qa.blockKey;
      lines.push(`\n### ${qa.blockTitle}`);
    }
    lines.push(`\n[${qa.frageId}] ${qa.unterbereich}`);
    lines.push(`Frage: ${qa.questionText}`);
    lines.push(`Antwort: ${qa.answer}`);
  }
  return lines.join("\n");
}

/** Draft-User-Prompt (MT-1): Modul-Kontext + Antworten. */
export function buildModuleSynthesisUserPrompt(
  ctx: ModuleContext,
  qaPairs: QaPair[],
): string {
  return [
    renderModuleContextBlock(ctx),
    "",
    renderQaBlock(qaPairs),
    "",
    "Leite jetzt das Liefer-Triple und die KI-Hebel ab. Gib ausschliesslich das JSON aus.",
  ].join("\n");
}

/** Critic-User-Prompt (MT-2): Kontext + Antworten + Entwurf-JSON. */
export function buildModuleCriticUserPrompt(
  ctx: ModuleContext,
  qaPairs: QaPair[],
  draft: ModuleDraft,
): string {
  return [
    renderModuleContextBlock(ctx),
    "",
    renderQaBlock(qaPairs),
    "",
    "## Zu pruefender Entwurf (JSON)",
    JSON.stringify(draft, null, 2),
    "",
    "Gib den verbesserten Entwurf im gleichen JSON-Schema zurueck. Nur JSON.",
  ].join("\n");
}
