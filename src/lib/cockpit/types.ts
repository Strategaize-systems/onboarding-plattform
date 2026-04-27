/**
 * SLC-040 — Cockpit-Datentypen.
 *
 * CockpitMetrics ist das Aggregat, das die Dashboard-Server-Component an alle
 * Renderer (Karten, Banner, NextStepBanner) durchreicht. Alle Felder sind
 * deterministisch aus der DB ableitbar.
 *
 * NextStep ist das Ergebnis der regelbasierten Empfehlungs-Logik
 * (siehe next-step.ts). Pure function -> TDD-Pflicht (Slice-Spec MT-4).
 */

export type CockpitRunStatus = "running" | "completed" | "failed" | "stale";
export type CockpitSnapshotStatus = "generating" | "ready" | "failed";

export interface BridgeRunSummary {
  id: string;
  status: CockpitRunStatus;
  proposal_count: number;
  created_at: string;
}

export interface HandbookSnapshotSummary {
  id: string;
  status: CockpitSnapshotStatus;
  created_at: string;
}

export interface CockpitMetrics {
  /** capture_session.id der GF-Session des Admins, oder null wenn keine existiert */
  captureSessionId: string | null;
  /** Anzahl Blocks im Template der GF-Session */
  blocksTotal: number;
  /** Anzahl distinkter block_keys mit checkpoint_type='questionnaire_submit' */
  blocksSubmitted: number;
  /** Anzahl profiles mit role='employee' im Tenant */
  employeesInvited: number;
  /** Anzahl capture_session mit capture_mode='employee_questionnaire' und status in ('open','in_progress') */
  employeeTasksOpen: number;
  /** Anzahl capture_session mit capture_mode='employee_questionnaire' und status in ('submitted','finalized') */
  employeeTasksDone: number;
  /** Juengster bridge_run der GF-Session, oder null */
  lastBridgeRun: BridgeRunSummary | null;
  /** Juengster handbook_snapshot der GF-Session, oder null */
  lastHandbookSnapshot: HandbookSnapshotSummary | null;
}

export interface NextStep {
  label: string;
  href: string;
  reason: string;
}
