// SLC-183 MT-4a (OP V10.2) — Server-Actions fuer den Berater-KI-Workspace "Mein Tag".
//
// Zwei Actions: Report laden + KI-Kurzfazit erzeugen. BEIDE re-gaten
// strategaize_admin VOR dem createAdminClient-Zugriff (R-183-1 /
// security-audit-standard: Server-Actions sind eigenstaendige Entry-Points,
// das Page-Gate schuetzt sie NICHT). Zusaetzlich Whitelist-Check des Report-Keys
// (defense-in-depth), damit kein beliebiger String an loadReport durchreicht.
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadReport,
  type ReportKey,
  type WorkspaceReport,
} from "@/lib/workspace/reports";
import { summarizeReport } from "@/lib/workspace/fazit";
import { assertStrategaizeAdmin } from "@/lib/workspace/admin-gate";

// Kanonische Report-Labels (deutsch) fuer den KI-Kurzfazit-Titel. Modul-intern:
// ein "use server"-File darf ausschliesslich async Functions exportieren (Next.js
// Runtime-Constraint) — ein exportiertes Objekt crasht die Server-Action-Module-
// Evaluation zur Laufzeit (ISSUE-113). ReportButtons.tsx haelt seine eigene Label-Liste.
const REPORT_LABELS: Record<ReportKey, string> = {
  mandanten_uebersicht: "Mandanten-Übersicht",
  review_queue: "Meine Review-Queue",
  wo_stockt_es: "Wo stockt es",
  system_status: "System-Status",
  activity_timeline: "Activity-Timeline",
};

/** Whitelist der fuenf gueltigen Report-Keys (defense-in-depth gegen beliebige Inputs). */
const VALID_KEYS = Object.keys(REPORT_LABELS) as ReportKey[];

function isValidKey(key: unknown): key is ReportKey {
  return typeof key === "string" && (VALID_KEYS as string[]).includes(key);
}

export type LoadReportResult =
  | { ok: true; report: WorkspaceReport }
  | { ok: false; error: string };

export async function loadWorkspaceReportAction(
  key: ReportKey,
): Promise<LoadReportResult> {
  const user = await assertStrategaizeAdmin();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!isValidKey(key)) return { ok: false, error: "invalid_key" };

  try {
    const report = await loadReport(createAdminClient(), key);
    return { ok: true, report };
  } catch {
    return { ok: false, error: "load_failed" };
  }
}

export type FazitResult =
  | { ok: true; fazit: string | null }
  | { ok: false; error: string };

export async function generateReportFazitAction(
  key: ReportKey,
): Promise<FazitResult> {
  const user = await assertStrategaizeAdmin();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!isValidKey(key)) return { ok: false, error: "invalid_key" };

  try {
    // Report server-seitig neu laden — dem Client uebergebene Daten NICHT vertrauen.
    const report = await loadReport(createAdminClient(), key);
    const { fazit } = await summarizeReport({
      reportKey: key,
      reportTitle: REPORT_LABELS[key],
      data: report,
    });
    return { ok: true, fazit };
  } catch {
    return { ok: false, error: "fazit_failed" };
  }
}
