// StB-Vertikale SOP-Bruecke — Pure-Mapping (SLC-181 MT-1, OP V10.1).
//
// Reine, hermetisch testbare Auswahl-/Mapping-Logik der Bruecke: bewertete
// `modul_output`-Rows (status=accepted) -> `sop`-Row-Objekte (bestehende Tabelle,
// MIG-042). KEINE DB-/LLM-/"use server"-Abhaengigkeit — die I/O-Schicht (Fetch +
// block_key-Aufloesung + service_role-Upsert) lebt in `sop-bridge-action.ts`.
// Trennung wie reife-ampel.ts <-> persist-ampel.ts / assess-answer-prompt.ts <->
// assess-answer.ts.
//
// Founder-Kontrakt (DEC-256, 2026-07-04):
//   Auswahl:   nur output_kind 'standard' + 'implementierungsschritt' (= Prozess-
//              Content) mit status='accepted' werden SOP-Sektionen. 'entscheidung'
//              (Beschluss) + 'ki_hebel' (KI-Chance) bleiben draussen (keine SOPs).
//   Scoring:   die Modul-Reife (computeModulReifeAmpel, SLC-178) wird als Prioritaet
//              in sop.content annotiert (green -> normal, sonst high) — FILTERT NICHT.
//   Persistenz: reine Reuse der sop-Spalten + duenne Provenance-Spalte
//              source_modul_output_id (MIG-130) fuer Idempotenz.
//   Legacy src/workers/sop/* + sop_generation-Job unberuehrt (DEC-253/D).

import type { Ampel } from "@/lib/stb-vertikale/blueprint";

/** Die zwei modul_output-Kinds, die zu SOP-Sektionen werden (DEC-256). */
export const SOP_BRIDGE_OUTPUT_KINDS = [
  "standard",
  "implementierungsschritt",
] as const;

/** generated_by_model-Marker der bridge-erzeugten SOP-Rows (kein LLM zur Bridge-Zeit). */
export const SOP_BRIDGE_GENERATED_BY = "module_delivery_bridge" as const;

/** Relevante Felder einer modul_output-Row (Ausschnitt, wie aus MIG-124 gelesen). */
export interface BridgeModulOutput {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  block_checkpoint_id: string | null;
  modul_key: string;
  output_kind: string;
  title: string | null;
  body: string;
  evidence_refs: unknown;
  status: string;
}

/** Ein modul_output + der aus block_checkpoint aufgeloeste block_key. */
export interface BridgeInput {
  output: BridgeModulOutput;
  /** block_key aus block_checkpoint (sop.block_key ist NOT NULL). */
  blockKey: string;
}

/** Modul-Scoring als Prioritaets-Annotation (kein Filter, DEC-256). */
export interface BridgeScoring {
  reife: Ampel;
  triggerHitCount: number;
}

/** Ein einzufuegendes sop-Row-Objekt (bestehende sop-Spalten + MIG-130-Provenance). */
export interface SopBridgeRow {
  tenant_id: string;
  capture_session_id: string;
  block_key: string;
  block_checkpoint_id: string;
  content: SopBridgeContent;
  generated_by_model: string;
  source_modul_output_id: string;
}

export interface SopBridgeContent {
  title: string | null;
  body: string;
  output_kind: string;
  modul_key: string;
  evidence_refs: unknown;
  origin: typeof SOP_BRIDGE_GENERATED_BY;
  scoring: {
    reife: Ampel;
    modul_trigger_hit_count: number;
    priority: "normal" | "high";
  };
}

function isProcessKind(kind: string): boolean {
  return (SOP_BRIDGE_OUTPUT_KINDS as readonly string[]).includes(kind);
}

/**
 * Auswahl + Mapping (AC-181-1/AC-181-2). Ein Output wird NUR dann eine SOP-Row, wenn
 *   (1) output_kind in {standard, implementierungsschritt} (Prozess-Content),
 *   (2) status = 'accepted' (kuratiert),
 *   (3) block_checkpoint_id gesetzt (sop.block_checkpoint_id ist NOT NULL) —
 *       Defensive: modul_output.block_checkpoint_id ist nullable.
 * Alles andere wird ausgelassen (nicht gefiltert-und-verworfen, sondern nie SOP).
 * Das Scoring steuert nur die Prioritaets-Annotation, nicht die Auswahl.
 */
export function mapModulOutputsToSopRows(
  inputs: readonly BridgeInput[],
  scoring: BridgeScoring,
): SopBridgeRow[] {
  const priority: "normal" | "high" = scoring.reife === "green" ? "normal" : "high";
  const rows: SopBridgeRow[] = [];

  for (const { output, blockKey } of inputs) {
    if (!isProcessKind(output.output_kind)) continue;
    if (output.status !== "accepted") continue;
    if (!output.block_checkpoint_id) continue;
    if (!blockKey) continue;

    rows.push({
      tenant_id: output.tenant_id,
      capture_session_id: output.capture_session_id,
      block_key: blockKey,
      block_checkpoint_id: output.block_checkpoint_id,
      content: {
        title: output.title,
        body: output.body,
        output_kind: output.output_kind,
        modul_key: output.modul_key,
        evidence_refs: output.evidence_refs ?? [],
        origin: SOP_BRIDGE_GENERATED_BY,
        scoring: {
          reife: scoring.reife,
          modul_trigger_hit_count: scoring.triggerHitCount,
          priority,
        },
      },
      generated_by_model: SOP_BRIDGE_GENERATED_BY,
      source_modul_output_id: output.id,
    });
  }

  return rows;
}
