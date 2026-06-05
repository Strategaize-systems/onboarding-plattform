// V9 SLC-167 MT-6 — Pure helpers + constants fuer Curation-UI.
//
// Trennung von actions.ts: Next.js "use server"-Files erlauben nur async-
// Function-Exports. Konstanten + Types + Pure-Helpers landen hier.
//
// Pattern-Reuse: ../filter-review/helpers.ts (SLC-166 MT-3).

import { isSentinelSection, type SectionOption } from "@/lib/bulk-email/sections";

/** Valide curation_status-Werte aus CHECK constraint (MIG-051/106). */
export const CURATION_STATUSES = [
  "pending_curation",
  "accepted",
  "rejected",
  "edited",
] as const;

export type CurationStatus = (typeof CURATION_STATUSES)[number];

/** Pruefe, ob ein String ein valider CurationStatus ist. */
export function isCurationStatus(value: unknown): value is CurationStatus {
  return (
    typeof value === "string" &&
    (CURATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Confidence-Pill-Schwellen — gruen/gelb/rot Indikation pro Pattern-Card.
 * Spec L186 "Confidence-Pill (gruen/gelb/rot per Schwellen)".
 */
export const CONFIDENCE_GREEN_MIN = 0.8;
export const CONFIDENCE_YELLOW_MIN = 0.5;

export type ConfidenceTier = "green" | "yellow" | "red";

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= CONFIDENCE_GREEN_MIN) return "green";
  if (confidence >= CONFIDENCE_YELLOW_MIN) return "yellow";
  return "red";
}

/**
 * Default-Confidence-Threshold fuer Bulk-Accept-Aktion. Spec L189
 * "Bulk-Aktion 'alle confidence >0.8 akzeptieren'".
 */
export const BULK_ACCEPT_DEFAULT_THRESHOLD = 0.8;

/** Maximal-Laenge edited_title fuer Edit-Modal. */
export const MAX_EDIT_TITLE_LENGTH = 200;

/** Maximal-Laenge edited_description fuer Edit-Modal. */
export const MAX_EDIT_DESCRIPTION_LENGTH = 2000;

/** Maximal-Laenge curated_section bei Free-Text "Andere..."-Wahl. */
export const MAX_FREE_TEXT_SECTION_LENGTH = 100;

/**
 * Validiere einen curated_section-String. Lehnt Sentinel ab — der Sentinel
 * darf nie als persistierter Wert in die DB (siehe sections.ts).
 */
export function isValidCuratedSection(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_FREE_TEXT_SECTION_LENGTH) return false;
  if (isSentinelSection(trimmed)) return false;
  return true;
}

/**
 * Ein Pattern in der Curation-Liste. Felder aus email_pattern.
 */
export interface CurationPattern {
  id: string;
  thread_id: string;
  title: string;
  description: string;
  evidence_snippets: unknown[] | null;
  themes: string[] | null;
  confidence: number;
  suggested_section: string | null;
  curation_status: CurationStatus;
  curated_section: string | null;
  curator_user_id: string | null;
  curated_at: string | null;
}

/** Bulk-Run-Header fuer das Page-Header. */
export interface CurationRunHeader {
  id: string;
  source_file_name: string;
  status: string;
  capture_session_id: string | null;
  template_id: string | null;
}

/** Vollstaendige Page-Data, geladen via getCurationData. */
export interface CurationData {
  run: CurationRunHeader;
  patterns: CurationPattern[];
  sections: SectionOption[];
  /** Curation-Progress-Zahlen fuer Progress-Bar (Spec L190). */
  progress: {
    total: number;
    curated: number;
    accepted: number;
    rejected: number;
    edited: number;
    pending: number;
  };
}

export function computeProgress(patterns: CurationPattern[]): CurationData["progress"] {
  const progress = {
    total: patterns.length,
    curated: 0,
    accepted: 0,
    rejected: 0,
    edited: 0,
    pending: 0,
  };
  for (const p of patterns) {
    if (p.curation_status === "pending_curation") {
      progress.pending += 1;
    } else {
      progress.curated += 1;
      if (p.curation_status === "accepted") progress.accepted += 1;
      else if (p.curation_status === "rejected") progress.rejected += 1;
      else if (p.curation_status === "edited") progress.edited += 1;
    }
  }
  return progress;
}

/**
 * Result-Type fuer Server-Action `updatePatternCuration`.
 */
export type UpdatePatternCurationResult =
  | { ok: true; patternId: string }
  | { ok: false; error: string };

/** Result-Type fuer `bulkAcceptPatterns`. */
export type BulkAcceptResult =
  | { ok: true; acceptedCount: number }
  | { ok: false; error: string };

/** Result-Type fuer `bulkRejectAll`. */
export type BulkRejectResult =
  | { ok: true; rejectedCount: number }
  | { ok: false; error: string };

/** Result-Type fuer `finishCurationAndStartHandbookImport`. */
export type FinishCurationResult =
  | {
      ok: true;
      /** true wenn SLC-168-Import getriggert wurde, false wenn nur Status-Flip. */
      handbookImportStarted: boolean;
      /** Hinweis-Text falls handbookImportStarted=false. */
      pendingMessage?: string;
    }
  | { ok: false; error: string };

/**
 * Result-Type fuer `importToHandbook` (SLC-168 MT-2).
 *
 * Erfolg liefert die Stats des Imports plus die handbookSnapshotId, die der
 * Worker `handle-snapshot-job.ts` asynchron in den fertigen Snapshot ueberfuehrt.
 * Bei 0 pending Patterns (Idempotenz-Re-Run nach erfolgreichem Vorlauf) wird
 * handbookSnapshotId leer zurueckgegeben — kein 2. Snapshot getriggert.
 */
export type ImportToHandbookResult =
  | {
      ok: true;
      /** Anzahl in diesem Lauf importierter Patterns. */
      patternsImported: number;
      /** Anzahl angelegter knowledge_unit-Rows. Sollte = patternsImported sein. */
      knowledgeUnitsCreated: number;
      /** Snapshot-ID — leer falls keine neuen Patterns importiert wurden. */
      handbookSnapshotId: string;
    }
  | { ok: false; error: string };
