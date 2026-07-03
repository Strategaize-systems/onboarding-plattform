// StB-Vertikale Modul-Output-Synthese — Modul-Kontext + Q&A-Assembly (SLC-174, OP V10).
//
// Pure Helfer (KEINE "use server", keine DB-Abhaengigkeit -> hermetisch testbar).
// Extrahiert den Synthese-Kontext aus der Modul-`template.metadata` (Seed MIG-125,
// stb_modul_m04) und baut aus den `block_checkpoint.content`-Snapshots (SLC-173,
// content.answers keyed by Frage-UUID `question.id`) die Frage/Antwort-Paare, die
// der Synthese-Worker (SLC-174 MT-3) an das LLM gibt.
//
// Quelle der Shapes:
//   - template.metadata: sql/migrations/125_v10_stb_template_seed.sql
//       (modul_key, output_contract{kinds, ki_hebel_kind, reifegrad_range},
//        themenmodell[], dod, output_artefakte[], symptome[], abgrenzung, ki_hebel[])
//   - block_checkpoint.content: src/app/capture/[sessionId]/block/[blockKey]/submit-action.ts
//       ({ answers: { <question.id>: text, "evidence.<block>.<qid>": text,
//         "followup.<block>.<qid>": text }, block_key, ... })
//   - Block/Question: src/lib/db/template-queries.ts (TemplateBlock, TemplateQuestion)

import { z } from "zod";
import { TemplateBlockSchema } from "@/lib/db/template-queries";
import type { TemplateBlock, TemplateQuestion } from "@/lib/db/template-queries";

// ─── KI-Hebel-Katalog (template.metadata.ki_hebel) ──────────────────────────
// Der Katalog ist die AUTORITATIVE Reifegrad-Quelle (DEC-245 / R-174-2): der
// Reifegrad eines KI-Hebels stammt deterministisch aus diesem Seed, nicht aus
// einer freien LLM-Schaetzung.
export const KiHebelCatalogEntrySchema = z.object({
  hebel_id: z.string(),
  name: z.string(),
  beschreibung: z.string().optional().default(""),
  reifegrad: z.number().int().min(1).max(4),
  referenz: z.string().optional().default(""),
});
export type KiHebelCatalogEntry = z.infer<typeof KiHebelCatalogEntrySchema>;

// ─── output_contract (template.metadata.output_contract) ────────────────────
export const OutputContractSchema = z.object({
  kinds: z.array(z.string()).default([]),
  ki_hebel_kind: z.string().default("ki_hebel"),
  reifegrad_range: z.tuple([z.number(), z.number()]).default([1, 4]),
  beschreibung: z.string().optional().default(""),
});
export type OutputContract = z.infer<typeof OutputContractSchema>;

const ThemaSchema = z.object({
  key: z.string(),
  name: z.string(),
  unterpunkte: z.array(z.string()).default([]),
});

// ─── Modul-Metadaten (Teilmenge der template.metadata, fuer den Prompt) ──────
export const ModuleMetadataSchema = z.object({
  modul_id: z.string().optional().default(""),
  modul_key: z.string(),
  modul_kategorie: z.string().optional().default(""),
  output_contract: OutputContractSchema,
  themenmodell: z.array(ThemaSchema).default([]),
  dod: z.string().optional().default(""),
  output_artefakte: z.array(z.string()).default([]),
  symptome: z.array(z.string()).default([]),
  abgrenzung: z.string().optional().default(""),
  ki_hebel: z.array(KiHebelCatalogEntrySchema).default([]),
});
export type ModuleMetadata = z.infer<typeof ModuleMetadataSchema>;

/**
 * Der vollstaendige Synthese-Kontext eines Moduls: Stamm-Infos + Metadaten-
 * Vertrag + Block/Frage-Definitionen (fuer das Frage/Antwort-Mapping).
 */
export interface ModuleContext {
  modulKey: string;
  name: string;
  description: string;
  metadata: ModuleMetadata;
  blocks: TemplateBlock[];
}

export interface TemplateLike {
  name: string;
  description?: string | null;
  blocks: unknown;
  metadata: unknown;
}

/**
 * Extrahiert + validiert den Modul-Kontext aus der geladenen template-Row.
 * `blocks` (jsonb) + `metadata` (jsonb) werden via zod geparst — wirft bei
 * fehlender/kaputter metadata.modul_key/output_contract oder Block-Shape; der
 * Worker faengt das als sauberen Fail (kein halb-geschriebenes modul_output).
 */
export function extractModuleContext(template: TemplateLike): ModuleContext {
  const metadata = ModuleMetadataSchema.parse(template.metadata ?? {});
  const blocks = z.array(TemplateBlockSchema).parse(template.blocks ?? []);
  return {
    modulKey: metadata.modul_key,
    name: template.name,
    description: template.description ?? "",
    metadata,
    blocks,
  };
}

// ─── Frage/Antwort-Paare ─────────────────────────────────────────────────────

export interface QaPair {
  blockKey: string;
  blockTitle: string;
  frageId: string;
  unterbereich: string;
  questionText: string;
  answer: string;
}

/** Ein Block-Checkpoint-Snapshot (nur die fuer die Synthese relevanten Felder). */
export interface CheckpointSnapshot {
  block_key: string;
  content: unknown;
}

interface CheckpointContent {
  answers?: Record<string, string> | null;
}

function blockTitleDe(block: TemplateBlock): string {
  const t = block.title as Record<string, string>;
  return t?.de ?? t?.en ?? block.key;
}

/**
 * Merged alle `content.answers` der uebergebenen Checkpoints zu einer Map
 * `question.id -> answer`. Zwei Praefix-Schluessel werden an ihre Frage-UUID
 * angehaengt statt eigenstaendig gesetzt:
 *   - `evidence.<block>.<qid>`  (Dokument-Beleg-Merge, submit-action.ts) -> `[Beleg]`
 *   - `followup.<block>.<qid>`  (Inline-Rueckfrage-Antwort, SLC-180)     -> `[Nachfrage]`
 * Spaetere Checkpoints (weiter hinten im Array) gewinnen bei Kollision —
 * der Caller uebergibt die Checkpoints latest-last. Innerhalb eines Checkpoints
 * werden die Eltern-Antworten (`<qid>`) vor den Praefix-Schluesseln eingefuegt
 * (submit-action.ts-Reihenfolge), damit das Anhaengen die Eltern-Antwort findet.
 */
function mergeAnswers(checkpoints: CheckpointSnapshot[]): Map<string, string> {
  const byQuestionId = new Map<string, string>();
  const append = (qid: string, label: string, value: string) => {
    const existing = byQuestionId.get(qid);
    byQuestionId.set(qid, existing ? `${existing}\n\n${label} ${value}` : `${label} ${value}`);
  };
  for (const cp of checkpoints) {
    const content = (cp.content ?? {}) as CheckpointContent;
    const answers = content.answers ?? {};
    for (const [key, rawValue] of Object.entries(answers)) {
      const value = typeof rawValue === "string" ? rawValue.trim() : "";
      if (!value) continue;
      if (key.startsWith("evidence.")) {
        // evidence.<block>.<questionId> -> haenge an die Frage-Antwort an.
        const qid = key.split(".").pop();
        if (qid) append(qid, "[Beleg]", value);
      } else if (key.startsWith("followup.")) {
        // followup.<block>.<questionId> -> Inline-Rueckfrage-Antwort (SLC-180).
        const qid = key.split(".").pop();
        if (qid) append(qid, "[Nachfrage]", value);
      } else {
        byQuestionId.set(key, value);
      }
    }
  }
  return byQuestionId;
}

/**
 * Baut die Frage/Antwort-Paare des Moduls (AC-174-1): jede Template-Frage, die
 * eine nicht-leere Antwort hat, wird zu einem QaPair (mit Frage-Text +
 * Unterbereich fuer den Prompt-Kontext). Reihenfolge folgt Block-`order` +
 * Frage-`position`. Fragen ohne Antwort werden ausgelassen.
 */
export function assembleQaPairs(
  blocks: TemplateBlock[],
  checkpoints: CheckpointSnapshot[],
): QaPair[] {
  const answers = mergeAnswers(checkpoints);
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const pairs: QaPair[] = [];
  for (const block of sortedBlocks) {
    const sortedQuestions = [...(block.questions ?? [])].sort(
      (a: TemplateQuestion, b: TemplateQuestion) => a.position - b.position,
    );
    for (const q of sortedQuestions) {
      const answer = answers.get(q.id);
      if (!answer) continue;
      pairs.push({
        blockKey: block.key,
        blockTitle: blockTitleDe(block),
        frageId: q.frage_id,
        unterbereich: q.unterbereich,
        questionText: q.text,
        answer,
      });
    }
  }
  return pairs;
}

/** Die Menge aller gueltigen frage_id des Moduls (Provenance-Rekonziliation). */
export function moduleFrageIds(blocks: TemplateBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    for (const q of block.questions ?? []) ids.add(q.frage_id);
  }
  return ids;
}
