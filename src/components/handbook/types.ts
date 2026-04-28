// SLC-044 — Geteilte Types fuer den Handbuch-Reader (Server- und Client-Seite).

export type SnapshotStatus = "generating" | "ready" | "failed";

export interface ReaderSnapshotMeta {
  id: string;
  status: SnapshotStatus;
  created_at: string;
  formattedCreatedAt: string;
  section_count: number | null;
  knowledge_unit_count: number | null;
  isActive: boolean;
}

export interface ReaderSnapshotHeaderInfo {
  status: SnapshotStatus;
  createdAtFormatted: string;
  tenantName: string | null;
  sizeBytes: number | null;
  sectionCount: number | null;
  knowledgeUnitCount: number | null;
  diagnosisCount: number | null;
  sopCount: number | null;
  errorMessage: string | null;
  metadata:
    | {
        pending_blocks: number;
        approved_blocks: number;
        rejected_blocks: number;
      }
    | null;
}
