// V9 SLC-168 MT-1 — Pure-Function-Layer fuer Handbuch-Import (FEAT-074)
//
// Slice: SLC-168 — V9 Handbuch-Integration + Audit + Source-Attribution-View
// DECs: DEC-193 (Path-A-Lite — knowledge_unit-INSERT mit Source-Attribution im body-Markdown)
//
// Pattern-Reuse:
//   - triggerHandbookSnapshot: 1:1 portiert aus
//     `src/app/admin/handbook/actions.ts:35-101` (SLC-040 MT-1).
//     Hier ohne eigene Auth-Gate, weil der Aufrufer (MT-2 importToHandbook)
//     bereits authorizeActor() durchlaufen hat und die RPC `rpc_trigger_handbook_snapshot`
//     SECURITY DEFINER + Role-Check intern macht.
//
// Path-A-Lite (DEC-193):
//   - knowledge_unit-INSERT mit body = pattern.description + Source-Attribution-Markdown
//   - Pseudo-block_checkpoint pro Bulk-Run erfuellt NOT NULL FK
//   - 0 Worker-Aenderung (handle-snapshot-job.ts liest title/body wie ueblich)
//   - 0 Reader-Aenderung (V4.1 FEAT-028 Reader unangetastet)
//
// Public API (4 exports):
//   - mapConfidenceToTier(confidence): KnowledgeUnitConfidence
//   - renderSourceAttributionMarkdown(args): string
//   - mapPatternToKnowledgeUnit(args): KnowledgeUnitInsertInput  (Pure)
//   - getOrCreatePseudoBlockCheckpoint(adminClient, args): Promise<{ok, ...}>
//   - triggerHandbookSnapshot(client, captureSessionId): Promise<{ok, ...}>

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────────────────────
// Public Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bulk-Run-Subset fuer Handbook-Import. Wird im importToHandbook (MT-2)
 * via service_role-Client geladen — hier nur das, was Mapper braucht.
 */
export interface BulkRunForImport {
  id: string;
  tenant_id: string;
  capture_session_id: string | null;
  source_file_name: string;
}

/**
 * Pattern-Subset fuer Handbook-Import. Subset des `email_pattern`-Schemas
 * (MIG-051/106) — nur was Mapper braucht. Entkoppelt handbook-import vom
 * Curation-UI-Modul (`/dashboard/bulk-email-import/[run_id]/curation/helpers`).
 */
export interface PatternForImport {
  id: string;
  thread_id: string;
  title: string;
  description: string;
  evidence_snippets: unknown[] | null;
  confidence: number;
  curated_section: string | null;
}

/**
 * Source-Attribution-Daten pro Pattern. Werden in body als Markdown gerendert
 * und (defensiv) zusaetzlich in knowledge_unit.metadata JSONB geschrieben
 * (per DEC-193: try-set Pattern in MT-2-INSERT-Code).
 */
export interface SourceAttribution {
  source_type: "email_bulk";
  bulk_run_id: string;
  pattern_id: string;
  thread_id: string;
  participant_pseudonyms?: Record<string, string>;
  confidence_raw: number;
  extracted_at: string; // ISO
}

/**
 * Confidence-Tier fuer knowledge_unit.confidence
 * (CHECK low|medium|high, Migration 021).
 * Schwellen: high >= 0.85, medium >= 0.7, sonst low.
 */
export type KnowledgeUnitConfidence = "low" | "medium" | "high";

/**
 * Pflicht-Felder fuer knowledge_unit-INSERT. Spalten mit DB-Default werden
 * weggelassen (created_at, updated_at).
 *
 * `metadata` ist OPTIONAL — die Spalte ist nicht zuverlaessig in den
 * Migrations-Files dokumentiert (siehe DEC-193). MT-2-INSERT-Code befuellt
 * sie defensiv und retry-en ohne diese Spalte, falls die LIVE-DB sie nicht
 * hat. Source-Attribution liegt in jedem Fall vollstaendig im `body`-Markdown.
 */
export interface KnowledgeUnitInsertInput {
  tenant_id: string;
  capture_session_id: string;
  block_checkpoint_id: string;
  block_key: string;
  /** V9.0 fix auf 'observation' — passt zu Email-Pattern als Beobachtung. */
  unit_type: "observation";
  /** V9.0 fix auf 'email_bulk' — wurde via MIG-055/Migration 110 zugelassen. */
  source: "email_bulk";
  title: string;
  body: string;
  confidence: KnowledgeUnitConfidence;
  /** Pattern ist schon GF-akzeptiert → status='accepted' direkt. */
  status: "accepted";
  updated_by: string;
  evidence_refs?: unknown[];
  metadata?: SourceAttribution;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Pure-Function: mapConfidenceToTier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bilde numerische Pattern-Confidence (0..1) auf knowledge_unit.confidence-
 * Enum (low|medium|high) ab.
 *
 * Schwellen analog Curation-UI helpers.ts CONFIDENCE_GREEN_MIN=0.8 +
 * CONFIDENCE_YELLOW_MIN=0.5 — aber leicht strenger fuer Handbuch-Konsum
 * (high=0.85, medium=0.7), weil die Vier-Augen-Curation schon eine
 * Vorfilter-Stufe war.
 */
export function mapConfidenceToTier(
  confidence: number,
): KnowledgeUnitConfidence {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Pure-Function: renderSourceAttributionMarkdown
// ────────────────────────────────────────────────────────────────────────────

export interface SourceAttributionRenderArgs {
  bulkRunId: string;
  sourceFileName: string;
  /** ISO-Date oder Datetime. Es wird nur YYYY-MM-DD verwendet. */
  extractedAt: string;
  confidence: number;
  participantPseudonyms?: Record<string, string>;
}

/**
 * Render Source-Attribution-Block als Markdown ans Ende des body. Der
 * bestehende Worker `handle-snapshot-job.ts` liest body und uebergibt es
 * 1:1 an den ZIP-Renderer — Reader sieht das in der gerenderten Section.
 *
 * Output-Form (Beispiel mit Pseudonymen):
 *
 *     ---
 *     **Quelle**: Aus Email-Bulk-Import vom 2026-06-05 (Datei `mailbox.mbox`).
 *     **Confidence**: high (raw 0.90)
 *     **Pseudonyme**: Klarnamen wurden pseudonymisiert. Beteiligte: P1 | P2.
 *     **Run-Detail**: [Quelle ansehen](/dashboard/bulk-email-import/<bulk_run_id>)
 *
 * Datum-Format: YYYY-MM-DD aus dem ISO-String-Prefix (TZ-agnostisch — der
 * Datums-Anteil ist unabhaengig vom Offset stabil, weil ISO-Strings immer
 * UTC sind wenn sie auf 'Z' enden).
 */
export function renderSourceAttributionMarkdown(
  args: SourceAttributionRenderArgs,
): string {
  const datePart = args.extractedAt.slice(0, 10);
  const tier = mapConfidenceToTier(args.confidence);
  const pseudonymsLine = (() => {
    if (!args.participantPseudonyms) {
      return "**Pseudonyme**: Klarnamen wurden pseudonymisiert.";
    }
    const values = Object.values(args.participantPseudonyms).filter(
      (v) => typeof v === "string" && v.length > 0,
    );
    if (values.length === 0) {
      return "**Pseudonyme**: Klarnamen wurden pseudonymisiert.";
    }
    return `**Pseudonyme**: Klarnamen wurden pseudonymisiert. Beteiligte: ${values.join(" | ")}.`;
  })();

  return [
    "",
    "---",
    "",
    `**Quelle**: Aus Email-Bulk-Import vom ${datePart} (Datei \`${args.sourceFileName}\`).`,
    `**Confidence**: ${tier} (raw ${args.confidence.toFixed(2)})`,
    pseudonymsLine,
    `**Run-Detail**: [Quelle ansehen](/dashboard/bulk-email-import/${args.bulkRunId})`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Pure-Function: mapPatternToKnowledgeUnit
// ────────────────────────────────────────────────────────────────────────────

export interface MapPatternArgs {
  pattern: PatternForImport;
  bulkRun: BulkRunForImport;
  captureSessionId: string;
  blockCheckpointId: string;
  curatorUserId: string;
  /** ISO-Datum des Pattern-Extracts (pattern.created_at). */
  extractedAt: string;
  /** Optional: Pseudonym-Map des Threads (P1 -> "Person A", …). */
  participantPseudonyms?: Record<string, string>;
}

/**
 * Pure-Function: bilde Pattern + Run-Context auf einen knowledge_unit-INSERT-
 * Datensatz ab.
 *
 * Regeln:
 *   - curated_section -> block_key (Pflicht; getCurationData + Server-Action
 *     sichern ab dass akzeptierte/editierte Patterns eine Section haben).
 *   - body = pattern.description.trim() + Source-Attribution-Markdown.
 *   - confidence (numerisch 0..1) -> Tier ('low'|'medium'|'high').
 *   - source='email_bulk', unit_type='observation', status='accepted'.
 *   - evidence_refs aus pattern.evidence_snippets falls Array, sonst [].
 *   - metadata wird mitgegeben (Source-Attribution-Audit-Form), MT-2-INSERT
 *     setzt sie defensiv.
 *
 * Wirft Error wenn curated_section leer/null ist — Caller (MT-2) muss vorher
 * filtern auf curation_status IN ('accepted','edited') AND curated_section
 * IS NOT NULL.
 */
export function mapPatternToKnowledgeUnit(
  args: MapPatternArgs,
): KnowledgeUnitInsertInput {
  const section = args.pattern.curated_section?.trim();
  if (!section) {
    throw new Error(
      `mapPatternToKnowledgeUnit: pattern ${args.pattern.id} hat keine curated_section — kann nicht importiert werden`,
    );
  }

  const sourceAttribution = renderSourceAttributionMarkdown({
    bulkRunId: args.bulkRun.id,
    sourceFileName: args.bulkRun.source_file_name,
    extractedAt: args.extractedAt,
    confidence: args.pattern.confidence,
    participantPseudonyms: args.participantPseudonyms,
  });

  const body = `${args.pattern.description.trim()}\n${sourceAttribution}`;

  const metadata: SourceAttribution = {
    source_type: "email_bulk",
    bulk_run_id: args.bulkRun.id,
    pattern_id: args.pattern.id,
    thread_id: args.pattern.thread_id,
    confidence_raw: args.pattern.confidence,
    extracted_at: args.extractedAt,
    ...(args.participantPseudonyms
      ? { participant_pseudonyms: args.participantPseudonyms }
      : {}),
  };

  return {
    tenant_id: args.bulkRun.tenant_id,
    capture_session_id: args.captureSessionId,
    block_checkpoint_id: args.blockCheckpointId,
    block_key: section,
    unit_type: "observation",
    source: "email_bulk",
    title: args.pattern.title.trim(),
    body,
    confidence: mapConfidenceToTier(args.pattern.confidence),
    status: "accepted",
    updated_by: args.curatorUserId,
    evidence_refs: Array.isArray(args.pattern.evidence_snippets)
      ? args.pattern.evidence_snippets
      : [],
    metadata,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. I/O: getOrCreatePseudoBlockCheckpoint
// ────────────────────────────────────────────────────────────────────────────

export interface PseudoCheckpointArgs {
  captureSessionId: string;
  bulkRunId: string;
  tenantId: string;
  createdByUserId: string;
  /** Default 'email_bulk' — gemeinsamer block_key fuer alle KUs eines Runs. */
  blockKey?: string;
}

export type PseudoCheckpointResult =
  | { ok: true; blockCheckpointId: string }
  | { ok: false; error: string };

/**
 * Idempotent: liefert die block_checkpoint.id fuer den Pseudo-Checkpoint
 * dieses Bulk-Runs. Wenn schon vorhanden, wird die ID zurueckgegeben,
 * sonst neu erzeugt.
 *
 * Eindeutigkeit via content_hash = sha256(bulkRunId). block_checkpoint hat
 * KEINE UNIQUE-Constraint auf content_hash — erst SELECT, dann INSERT.
 * Race-Fenster ist im V9-importToHandbook-Pfad minimal (Server-Action ist
 * single-threaded pro bulkRunId; Status-Guard 'pattern_extracted'/'curating'
 * blockiert parallele Re-Entries).
 *
 * Erfordert MIG-055/Migration 110 LIVE-applied (block_checkpoint.checkpoint_type
 * CHECK akzeptiert 'email_bulk_import').
 */
export async function getOrCreatePseudoBlockCheckpoint(
   
  adminClient: SupabaseClient<any>,
  args: PseudoCheckpointArgs,
): Promise<PseudoCheckpointResult> {
  const blockKey = args.blockKey ?? "email_bulk";
  const contentHash = createHash("sha256")
    .update(args.bulkRunId)
    .digest("hex");

  const { data: existing, error: selectError } = await adminClient
    .from("block_checkpoint")
    .select("id")
    .eq("capture_session_id", args.captureSessionId)
    .eq("content_hash", contentHash)
    .eq("checkpoint_type", "email_bulk_import")
    .maybeSingle();
  if (selectError) {
    return {
      ok: false,
      error: `block_checkpoint SELECT fehlgeschlagen: ${selectError.message}`,
    };
  }
  if (existing) {
    return { ok: true, blockCheckpointId: existing.id as string };
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("block_checkpoint")
    .insert({
      tenant_id: args.tenantId,
      capture_session_id: args.captureSessionId,
      block_key: blockKey,
      checkpoint_type: "email_bulk_import",
      content: {},
      content_hash: contentHash,
      created_by: args.createdByUserId,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return {
      ok: false,
      error: `block_checkpoint INSERT fehlgeschlagen: ${insertError?.message ?? "unknown"}`,
    };
  }
  return { ok: true, blockCheckpointId: inserted.id as string };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. I/O: triggerHandbookSnapshot
// ────────────────────────────────────────────────────────────────────────────

export type TriggerHandbookSnapshotResult =
  | { ok: true; handbookSnapshotId: string }
  | { ok: false; error: string };

/**
 * Trigger handbook_snapshot via RPC `rpc_trigger_handbook_snapshot`.
 *
 * 1:1 portiert aus `src/app/admin/handbook/actions.ts:35-101` (SLC-040 MT-1).
 * Hier OHNE eigene Auth-Gate, weil der Aufrufer (MT-2 importToHandbook)
 * bereits `authorizeActor()` durchlaufen hat und die RPC SECURITY DEFINER
 * + Role-Check intern macht. Cross-Tenant-Schutz fuer tenant_admin liegt
 * ebenfalls in der RPC (074_rpc_handbook.sql L72-75).
 *
 * Worker `handle-snapshot-job.ts` pickt das via claim-loop auf
 * job_type='handbook_snapshot_generation' und rendert das ZIP.
 */
export async function triggerHandbookSnapshot(
   
  client: SupabaseClient<any>,
  captureSessionId: string,
): Promise<TriggerHandbookSnapshotResult> {
  if (!captureSessionId) {
    return { ok: false, error: "capture_session_id_required" };
  }

  const { data, error } = await client.rpc("rpc_trigger_handbook_snapshot", {
    p_capture_session_id: captureSessionId,
  });

  if (error) {
    return {
      ok: false,
      error: `rpc_trigger_handbook_snapshot: ${error.message}`,
    };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return {
      ok: false,
      error: (result?.error as string) ?? "rpc_unknown_error",
    };
  }
  const handbookSnapshotId = result.handbook_snapshot_id;
  if (typeof handbookSnapshotId !== "string") {
    return { ok: false, error: "rpc_invalid_response" };
  }

  return { ok: true, handbookSnapshotId };
}
