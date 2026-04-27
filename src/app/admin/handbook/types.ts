/**
 * SLC-040 — Handbuch-UI Types.
 *
 * HandbookSnapshotRow spiegelt die Spalten aus public.handbook_snapshot wider, die
 * fuer die UI relevant sind. Worker-interne Felder (storage_path, error_message)
 * werden nur gelesen, nicht gerendert ausser im Failed-Fall.
 */

export type HandbookSnapshotStatus = "generating" | "ready" | "failed";

export interface HandbookSnapshotRow {
  id: string;
  capture_session_id: string;
  status: HandbookSnapshotStatus;
  storage_size_bytes: number | null;
  section_count: number | null;
  knowledge_unit_count: number | null;
  diagnosis_count: number | null;
  sop_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  formattedCreatedAt: string;
}

export interface CaptureSessionLite {
  id: string;
  status: string;
  started_at: string;
  template_name: string | null;
}
