// StB-Vertikale Kanzlei-Blueprint — pure Helfer (SLC-172 MT-1, FEAT-092, OP V10).
//
// Bewusst KEINE "use server"-Direktive + keine DB-Abhaengigkeit -> hermetisch
// testbar. Session-Start + adaptives Ampel-Assessment (DB/LLM) liegen in der
// co-located Server-Action `src/app/dashboard/stb/blueprint/actions.ts`.
//
// Reuse-Disziplin (strategaize-pattern-reuse.md): der Capture-Flow selbst
// (capture_session, block_checkpoint, QuestionnaireWorkspace, Whisper-Voice)
// wird 1:1 wiederverwendet (Schwester-Modul `modul-capture.ts`); hier entsteht
// nur die duenne Blueprint-Schicht + die adaptive Vertiefung-Logik (DEC-249).
//
// Adaptive Vertiefung (Choice A, Founder-Entscheid 2026-06-24, M-BP §7.7):
// Die 5 Vertiefungsfragen (`ebene=Vertiefung`) sind NICHT Teil des 15-Fragen-
// Gratis-Pfads. Eine Vertiefungsfrage wird nur eingeblendet, wenn die gekoppelte
// Kern-Frage live als Ampel gelb/rot bewertet wird. Die Kopplung wird aus dem
// Template ABGELEITET (gemeinsames `unterbereich`) — Single-Source aus dem Seed
// (MIG-126), kein hartkodierter Drift.

import type { TemplateBlock } from "@/lib/db/template-queries";

/** Template-Slug des Kanzlei-Blueprints (Seed-Konvention SLC-170b / MIG-126). */
export const BLUEPRINT_SLUG = "stb_blueprint_kanzlei" as const;

/** Pfad-Praefix fuer die wiederverwendeten Wizard-Komponenten (basePath). */
export const BLUEPRINT_BASE_PATH = "/dashboard/stb/blueprint" as const;

/** Ebene-Marker im Template (`question.ebene`), case-insensitiv verglichen. */
const EBENE_KERN = "kern";
const EBENE_VERTIEFUNG = "vertiefung";

/** Live-Ampel einer Antwort. Engine-/Seed-konsistent (green|yellow|red). */
export type Ampel = "green" | "yellow" | "red";

/** Eine Vertiefung wird eingeblendet, wenn ihre Kern-Frage gelb oder rot ist. */
export function isYellowOrRed(ampel: Ampel): boolean {
  return ampel === "yellow" || ampel === "red";
}

/**
 * Kopplung Kern-Frage -> Vertiefungs-Frage ueber das gemeinsame `unterbereich`.
 * Aus dem Template abgeleitet (nicht hartkodiert): `kernFrageId` triggert
 * `vertiefungFrageId`, wenn die Kern-Antwort gelb/rot ist.
 */
export interface VertiefungCoupling {
  unterbereich: string;
  kernFrageId: string;
  vertiefungFrageId: string;
}

function ebeneOf(q: { ebene: string }): string {
  return q.ebene.trim().toLowerCase();
}

/**
 * Leitet die Kern->Vertiefung-Kopplungen aus den Template-Bloecken ab: jede
 * Vertiefungsfrage wird mit jeder Kern-Frage gepaart, die dasselbe
 * `unterbereich` teilt. Reine Funktion (Single-Source = der Seed MIG-126).
 *
 * Erwartung beim Kanzlei-Blueprint: 5 Paare (a2: F-BP-004->016, b1: 005->017,
 * c1: 007->018, d1: 009->019, f1: 013->020).
 */
export function deriveVertiefungCouplings(
  blocks: TemplateBlock[]
): VertiefungCoupling[] {
  const kernByUnterbereich = new Map<string, string[]>();
  const vertiefungByUnterbereich = new Map<string, string[]>();

  for (const block of blocks) {
    for (const q of block.questions) {
      const target =
        ebeneOf(q) === EBENE_KERN
          ? kernByUnterbereich
          : ebeneOf(q) === EBENE_VERTIEFUNG
            ? vertiefungByUnterbereich
            : null;
      if (!target) continue;
      const list = target.get(q.unterbereich) ?? [];
      list.push(q.frage_id);
      target.set(q.unterbereich, list);
    }
  }

  const couplings: VertiefungCoupling[] = [];
  for (const [unterbereich, vertiefungIds] of vertiefungByUnterbereich) {
    const kernIds = kernByUnterbereich.get(unterbereich);
    if (!kernIds) continue; // Vertiefung ohne Kern-Anker -> nicht koppelbar
    for (const vertiefungFrageId of vertiefungIds) {
      for (const kernFrageId of kernIds) {
        couplings.push({ unterbereich, kernFrageId, vertiefungFrageId });
      }
    }
  }
  return couplings;
}

/** Alle Kern-Frage-IDs, die ueberhaupt eine Vertiefung triggern koennen. */
export function coupledKernFrageIds(
  couplings: VertiefungCoupling[]
): string[] {
  return Array.from(new Set(couplings.map((c) => c.kernFrageId)));
}

/**
 * Bestimmt, welche Vertiefungsfragen eingeblendet werden: eine Vertiefung
 * erscheint, sobald MINDESTENS eine ihrer gekoppelten Kern-Fragen gelb/rot ist.
 * `kernAmpel` = Map frageId -> Ampel (fehlende Kern-Fragen zaehlen als nicht
 * getriggert). Reine Funktion -> hermetisch testbar (AC-172-6).
 */
export function surfacedVertiefungFrageIds(
  couplings: VertiefungCoupling[],
  kernAmpel: Record<string, Ampel>
): string[] {
  const surfaced = new Set<string>();
  for (const c of couplings) {
    const ampel = kernAmpel[c.kernFrageId];
    if (ampel && isYellowOrRed(ampel)) {
      surfaced.add(c.vertiefungFrageId);
    }
  }
  return Array.from(surfaced);
}

/**
 * Robuste Extraktion der Ampel aus der LLM-Roh-Antwort (`assessAnswerAmpel`).
 * Akzeptiert reines JSON `{"ampel":"red"}`, das blanke Wort oder eingebettete
 * Vorkommen. Fail-open: unparsebar -> "yellow" (lieber nachfragen als eine
 * noetige Vertiefung unterdruecken). Reine Funktion -> hermetisch testbar.
 */
export function parseAmpel(raw: string): Ampel {
  const text = (raw ?? "").toLowerCase();
  if (/\bred\b|"ampel"\s*:\s*"red"|\brot\b/.test(text)) return "red";
  if (/\byellow\b|"ampel"\s*:\s*"yellow"|\bgelb\b/.test(text)) return "yellow";
  if (/\bgreen\b|"ampel"\s*:\s*"green"|\bgr(?:ü|ue)n\b/.test(text)) return "green";
  return "yellow"; // fail-open
}
