// StB-Vertikale Live-Scoring — Prompt + Guardrail/Heilung (SLC-179 MT-2, OP V10.1).
//
// Pure, hermetisch testbare Kern-Logik der Live-Bewertung (assessModulAnswer,
// SLC-179 MT-1). KEINE DB-, LLM- oder "use server"-Abhaengigkeit — die
// I/O-Schicht (Bedrock-Haiku-Call + capture_session.metadata-Persist) lebt in
// `assess-answer.ts`. Trennung wie reife-ampel.ts <-> persist-ampel.ts (SLC-178).
//
// Founder-Entscheidungen (bei Slice-Start, /architecture DEC-253/A+F):
//   F-A/1  Max. 2 Rueckfragen pro Modul-Block (Nervfaktor-Guardrail R3).
//   F-A/2  Konservative Trigger-Schwelle: nur KLAR unvollstaendige/riskante
//          Antworten loesen eine Rueckfrage + Trigger-Hit aus (Prompt-getrieben).
//   F-B    Bewertung synchron pro Frage (Haiku 4.5, temp 0) -> geringe Latenz.

import { z } from "zod";

import type { TemplateQuestion } from "@/lib/db/template-queries";

/**
 * Max. Anzahl Live-Rueckfragen pro Modul-Block (Founder F-A/1, AC-179-3).
 * Ein Trigger-Hit == eine Rueckfrage (1:1) -> die Kappung zaehlt die je Block
 * bereits vermerkten Trigger-Hits.
 */
export const MAX_RUECKFRAGEN_PER_BLOCK = 2 as const;

/** Strukturierte Haiku-Ausgabe der Einzel-Antwort-Bewertung (AC-179-2). */
export const ModulAnswerAssessmentSchema = z.object({
  /**
   * `ok`            = Antwort ist inhaltlich ausreichend/belastbar (kein Trigger).
   * `unvollstaendig`= Antwort laesst eine klare Luecke (Trigger-wuerdig).
   * `riskant`       = Antwort zeigt ein konkretes Risiko im Flag-Kontext (Trigger-wuerdig).
   */
  status: z.enum(["ok", "unvollstaendig", "riskant"]),
  /** Knappe, konkrete Rueckfrage bei status != ok; sonst null. */
  rueckfrage: z.string().nullable().default(null),
});

export type ModulAnswerAssessment = z.infer<typeof ModulAnswerAssessmentSchema>;

/** Menschlich lesbare Flag-Hinweise fuer den Bewertungs-Kontext (konservativ). */
function flagHints(question: TemplateQuestion): string[] {
  const hints: string[] = [];
  if (question.ko_hart)
    hints.push("hartes KO-Kriterium (klarer Deal-Breaker beim Verkauf)");
  if (question.ko_soft)
    hints.push("weiches KO-Kriterium (verhandelbar, aber wertmindernd)");
  if (question.deal_blocker)
    hints.push("moeglicher Deal-Blocker im Verkaufsprozess");
  if (question.owner_dependency)
    hints.push("Inhaberabhaengigkeit (Wissen/Beziehungen haengen an der Person)");
  if (question.sop_trigger)
    hints.push("prozessrelevant (Kandidat fuer eine SOP/Standardanweisung)");
  return hints;
}

/**
 * Baut den Bedrock-Haiku-Prompt (system + user) fuer die Einzel-Antwort-Bewertung.
 * Die konservative Trigger-Schwelle (F-A/2) ist im System-Prompt kodiert:
 * im Zweifel `ok`. Der Flag-Kontext gibt Haiku den Grund, WARUM die Frage zaehlt.
 */
export function buildAssessAnswerPrompt(
  question: TemplateQuestion,
  answer: string,
): { system: string; user: string } {
  const system =
    "Du bewertest EINE Selbstauskunft eines Steuerberaters zur eigenen Kanzlei " +
    "im Rahmen eines Reifegrad-Moduls. Beurteile ausschliesslich, ob die Antwort " +
    "die Frage inhaltlich ausreichend und belastbar beantwortet. Sei KONSERVATIV: " +
    "Stufe nur dann als 'unvollstaendig' oder 'riskant' ein, wenn die Antwort KLAR " +
    "lueckenhaft, ausweichend oder ein konkretes Risiko erkennbar ist. Im Zweifel " +
    "'ok'. Wenn 'unvollstaendig' oder 'riskant': formuliere EINE knappe, konkrete " +
    "Rueckfrage (Feld rueckfrage), die gezielt die Luecke schliesst. Bei 'ok': " +
    'rueckfrage = null. Antworte AUSSCHLIESSLICH mit JSON: {"status":"ok|' +
    'unvollstaendig|riskant","rueckfrage":"..."|null} — keine Erklaerung, kein ' +
    "Markdown.";

  const hints = flagHints(question);
  const flagLine =
    hints.length > 0
      ? `Bedeutung der Frage: ${hints.join("; ")}.`
      : "Bedeutung der Frage: allgemeiner Reifegrad-Aspekt.";

  const user = [
    `Unterthema: ${question.unterbereich}`,
    `Frage: ${question.text}`,
    flagLine,
    `Antwort des Steuerberaters: ${answer}`,
  ].join("\n");

  return { system, user };
}

/**
 * Ergebnis der Guardrail-/Heilungs-Entscheidung.
 * - `rueckfrage`      : an den Wizard zurueckgegebener Rueckfrage-Text (SLC-180)
 *                        oder null (keine Rueckfrage).
 * - `nextTriggerHits` : neuer Trigger-Hit-Stand fuer den Modul-Schluessel, oder
 *                        null, wenn keine Persistenz-Aenderung noetig ist.
 */
export interface AssessOutcome {
  rueckfrage: string | null;
  nextTriggerHits: string[] | null;
}

/**
 * Reine Entscheidungs-Logik der Live-Bewertung (AC-179-3): mappt die
 * Haiku-Bewertung auf Rueckfrage + Trigger-Hit-Vermerk unter Beachtung von
 *   (1) fail-open  — `assessment === null` (LLM nicht verfuegbar) => keine
 *       Rueckfrage, keine Zustandsaenderung (Capture laeuft weiter, AC-179-1);
 *   (2) Heilung F-E — eine zuvor getriggerte, jetzt als `ok` bewertete Frage wird
 *       aus den Trigger-Hits entfernt (SLC-179/180 heilen, SLC-178 liest final);
 *   (3) Guardrail F-A/1 — pro Block max. `MAX_RUECKFRAGEN_PER_BLOCK` neue
 *       Trigger-Hits; daruber hinaus wird die Rueckfrage unterdrueckt.
 *
 * @param assessment       Haiku-Ausgabe, oder null bei LLM-/Schema-Fehler (fail-open)
 * @param frageId          bewertete Frage
 * @param blockFrageIds    alle frage_ids des Blocks, zu dem `frageId` gehoert
 * @param currentTriggerHits bisheriger Trigger-Hit-Stand des Moduls
 */
export function computeAssessOutcome(
  assessment: ModulAnswerAssessment | null,
  frageId: string,
  blockFrageIds: readonly string[],
  currentTriggerHits: readonly string[],
): AssessOutcome {
  const hits = currentTriggerHits;
  const alreadyHit = hits.includes(frageId);

  // (1) fail-open: keine Bewertung -> nichts anzeigen, nichts aendern.
  if (!assessment) {
    return { rueckfrage: null, nextTriggerHits: null };
  }

  const triggerWorthy = assessment.status !== "ok";

  // (2) 'ok'-Antwort: ggf. einen frueheren Trigger-Hit heilen (F-E).
  if (!triggerWorthy) {
    if (alreadyHit) {
      return {
        rueckfrage: null,
        nextTriggerHits: hits.filter((id) => id !== frageId),
      };
    }
    return { rueckfrage: null, nextTriggerHits: null };
  }

  // Trigger-wuerdig + bereits vermerkt: idempotent -> Rueckfrage erneut zeigen,
  // Trigger-Hit-Stand unveraendert (zaehlt nicht doppelt gegen die Guardrail).
  if (alreadyHit) {
    return { rueckfrage: assessment.rueckfrage ?? null, nextTriggerHits: null };
  }

  // (3) Neuer Trigger-Hit: Guardrail max. N je Block (F-A/1).
  const blockSet = new Set(blockFrageIds);
  const blockHits = hits.filter((id) => blockSet.has(id)).length;
  if (blockHits >= MAX_RUECKFRAGEN_PER_BLOCK) {
    // Nervfaktor-Guardrail: keine weitere Rueckfrage, kein weiterer Vermerk.
    return { rueckfrage: null, nextTriggerHits: null };
  }

  return {
    rueckfrage: assessment.rueckfrage ?? null,
    nextTriggerHits: [...hits, frageId],
  };
}
