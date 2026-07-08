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
  BERATER_REPORT_KEYS,
  type ReportKey,
  type WorkspaceReport,
} from "@/lib/workspace/reports";
import { summarizeReport } from "@/lib/workspace/fazit";
import { resolveWorkspaceScope } from "@/lib/workspace/workspace-scope";

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

/**
 * Whitelist-Check gegen den Report-Key. Fuer Berater zusaetzlich auf das
 * Berater-Report-Set (ohne system_status) eingeschraenkt — system-weite Reports
 * sind fuer den Berater nicht tenant-scopebar und bleiben admin-only (DEC-270).
 */
function isKeyAllowedForScope(key: unknown, isBerater: boolean): key is ReportKey {
  if (!isValidKey(key)) return false;
  if (isBerater) return BERATER_REPORT_KEYS.includes(key);
  return true;
}

export type LoadReportResult =
  | { ok: true; report: WorkspaceReport }
  | { ok: false; error: string };

export async function loadWorkspaceReportAction(
  key: ReportKey,
): Promise<LoadReportResult> {
  const scope = await resolveWorkspaceScope();
  if (!scope) return { ok: false, error: "unauthorized" };

  const isBerater = scope.role === "strategaize_berater";
  if (!isKeyAllowedForScope(key, isBerater)) {
    return { ok: false, error: "invalid_key" };
  }

  try {
    // allowedTenantIds: undefined (Admin) => alle Tenants; string[] (Berater) => nur diese.
    const report = await loadReport(
      createAdminClient(),
      key,
      scope.allowedTenantIds,
    );
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
  const scope = await resolveWorkspaceScope();
  if (!scope) return { ok: false, error: "unauthorized" };

  const isBerater = scope.role === "strategaize_berater";
  if (!isKeyAllowedForScope(key, isBerater)) {
    return { ok: false, error: "invalid_key" };
  }

  try {
    // Report server-seitig neu laden — dem Client uebergebene Daten NICHT vertrauen.
    // Fuer Berater gescopt (allowedTenantIds), damit auch das KI-Fazit nur
    // zugewiesene Mandanten sieht.
    const report = await loadReport(
      createAdminClient(),
      key,
      scope.allowedTenantIds,
    );
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
