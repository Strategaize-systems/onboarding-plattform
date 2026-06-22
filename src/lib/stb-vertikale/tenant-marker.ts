// StB-Vertikale Stage-Marker — SLC-171 MT-1 (FEAT-090 / BL-509, OP V10).
//
// DEC-243 (Founder-delegiert 2026-06-22): Der "StB-Vertikale Stufe-1"-Marker
// lebt in `capture_session.metadata.stb_vertical_stage` — NICHT auf `tenants`.
// Grund: `tenants` hat keine metadata/settings-jsonb-Spalte, und die V10-
// Architektur fixiert "1 Migration gesamt = 124" (keine MIG-126 in Phase 1).
// `capture_session.metadata` (MIG-103 / DEC-165) ist der bereits etablierte
// no-DDL-jsonb-Slot (vgl. DEC-237 imported_dataset_ref). Der tatsaechliche
// Set-Aufruf bei Capture-Erstellung wird in SLC-173 verdrahtet; dieser Helper
// ist die Foundation (lesen/setzen, idempotent).
//
// JSONB-Merge erfolgt in JS (fetch-merge-write) — das Supabase-JS-SDK
// unterstuetzt den jsonb-||-Operator nicht direkt
// (feedback_fetch_merge_write_supabase_jsonb.md). Pattern 1:1 aus
// src/lib/llm/v8-1-augmentation/cache.ts (SLC-161 MT-3).

import { createAdminClient } from "@/lib/supabase/admin";

/** JSONB-Key unter capture_session.metadata, in dem der Marker lebt. */
export const STB_VERTICAL_STAGE_KEY = "stb_vertical_stage" as const;

/** Stufe-1-Markerwert (String '1' gem. Slice-Spec AC-171-2). */
export const STB_VERTICAL_STAGE_1 = "1" as const;

/**
 * Liest den StB-Vertikale-Stage-Marker aus einem metadata-JSONB-Object
 * (frisch aus DB gelesen). Defensiv: null bei fehlendem metadata, fehlendem
 * Key, leerem oder nicht-string-Wert.
 */
export function readStbVerticalStage(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  const raw = metadata[STB_VERTICAL_STAGE_KEY];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** True wenn die Session der StB-Vertikale (irgendeine Stufe) zugeordnet ist. */
export function isStbVerticalSession(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return readStbVerticalStage(metadata) !== null;
}

/**
 * Merged den Stage-Marker additiv in das bestehende metadata-JSONB.
 * Bestehende Keys (z.B. v8_report_snapshot, imported_dataset_ref) bleiben
 * erhalten. Pure — schreibt nicht in DB. Idempotent: gleicher Stage -> gleiches
 * Ergebnis-Object.
 */
export function mergeStbVerticalStage(
  currentMetadata: Record<string, unknown> | null | undefined,
  stage: string = STB_VERTICAL_STAGE_1
): Record<string, unknown> {
  const base = currentMetadata ?? {};
  return {
    ...base,
    [STB_VERTICAL_STAGE_KEY]: stage,
  };
}

export type SetStbVerticalStageResult =
  | { ok: true; alreadySet: boolean }
  | { ok: false; error: "not_found" | "read_failed" | "write_failed" };

/**
 * Setzt den StB-Vertikale-Stage-Marker auf einer capture_session
 * (fetch-merge-write, additiv). Idempotent: ist der Marker bereits auf `stage`,
 * wird kein Write ausgefuehrt (alreadySet=true).
 *
 * Nutzt den Admin-Client, weil der Marker ein System-Stempel ist (kein
 * Mandant-Input). Die Ownership-/Tenant-Pruefung liegt beim Caller — der
 * Set-Aufruf wird in SLC-173 im RLS-gescopten Capture-Erstellungs-Pfad
 * verdrahtet; capture_session-RLS bleibt unveraendert (kein neues Policy-
 * Surface, AC-171-3).
 */
export async function setStbVerticalStage(
  captureSessionId: string,
  stage: string = STB_VERTICAL_STAGE_1
): Promise<SetStbVerticalStageResult> {
  const admin = createAdminClient();

  const { data: row, error: readErr } = await admin
    .from("capture_session")
    .select("metadata")
    .eq("id", captureSessionId)
    .single();

  if (readErr) {
    // PostgREST PGRST116 = 0 rows (Session existiert nicht).
    if (readErr.code === "PGRST116") return { ok: false, error: "not_found" };
    return { ok: false, error: "read_failed" };
  }
  if (!row) return { ok: false, error: "not_found" };

  const current = (row.metadata ?? {}) as Record<string, unknown>;
  if (readStbVerticalStage(current) === stage) {
    return { ok: true, alreadySet: true };
  }

  const merged = mergeStbVerticalStage(current, stage);
  const { error: writeErr } = await admin
    .from("capture_session")
    .update({ metadata: merged })
    .eq("id", captureSessionId);

  if (writeErr) return { ok: false, error: "write_failed" };
  return { ok: true, alreadySet: false };
}
