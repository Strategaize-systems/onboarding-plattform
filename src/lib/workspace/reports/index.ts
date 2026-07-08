// SLC-183 MT-1 (OP V10.2) — Cross-Mandanten Report-Loader-Dispatcher.
//
// Fuenf ergebnisoffene Report-Loader fuer den Berater-KI-Workspace "Mein Tag".
// Jeder Loader liest bestehende Tabellen ueber einen service-role Admin-Client,
// der als PARAMETER hereingereicht wird — der Aufrufer (Server-Component/Action)
// macht das strategaize_admin-Gate (R-183-1: Loader holen KEINE Auth selbst).
//
// 0 Migrationen. Backend-only (keine React-Komponenten hier).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadMandantenUebersicht,
  type MandantenUebersichtReport,
} from "./mandanten-uebersicht";
import { loadReviewQueue, type ReviewQueueReport } from "./review-queue";
import { loadWoStocktEs, type WoStocktEsReport } from "./wo-stockt-es";
import { loadSystemStatus, type SystemStatusReport } from "./system-status";
import {
  loadActivityTimeline,
  type ActivityTimelineReport,
} from "./activity-timeline";

export type {
  MandantenUebersichtReport,
  MandantenUebersichtRow,
} from "./mandanten-uebersicht";
export type { ReviewQueueReport, ReviewQueueRow } from "./review-queue";
export type { WoStocktEsReport, WoStocktEsRow } from "./wo-stockt-es";
export type {
  SystemStatusReport,
  SystemStatusJob,
  SystemStatusError,
} from "./system-status";
export type {
  ActivityTimelineReport,
  ActivityTimelineEntry,
} from "./activity-timeline";

export {
  loadMandantenUebersicht,
  loadReviewQueue,
  loadWoStocktEs,
  loadSystemStatus,
  loadActivityTimeline,
};

/**
 * Kanonische Report-Keys — MUESSEN exakt zu den ReportButtons aus SLC-182
 * passen (Frontend-Vertrag).
 */
export type ReportKey =
  | "mandanten_uebersicht"
  | "review_queue"
  | "wo_stockt_es"
  | "system_status"
  | "activity_timeline";

/** Diskriminierte Union aller Report-Ergebnisse (discriminant = `key`). */
export type WorkspaceReport =
  | MandantenUebersichtReport
  | ReviewQueueReport
  | WoStocktEsReport
  | SystemStatusReport
  | ActivityTimelineReport;

/**
 * V10.4 SLC-190 (DEC-270) — Report-Set fuer strategaize_berater.
 *
 * Die vier tenant-scopebaren Reports. `system_status` ist bewusst NICHT dabei:
 * er liest system-weite ai_jobs/error_log OHNE tenant-Spalte und ist damit nicht
 * pro Tenant filterbar -> bleibt admin-only (fail-closed, sonst cross-tenant-Ops-Leak).
 * Single Source of Truth fuer die Server-Whitelist (actions.ts) und die
 * Report-Button-Filterung (WorkspaceShell/page).
 */
export const BERATER_REPORT_KEYS: ReportKey[] = [
  "mandanten_uebersicht",
  "review_queue",
  "wo_stockt_es",
  "activity_timeline",
];

/**
 * Dispatcher: laedt den angeforderten Report ueber den bereits-authentifizierten
 * Admin-Client. Wirft bei unbekanntem Key (exhaustive switch).
 *
 * V10.4 SLC-190: optionaler `allowedTenantIds`-Filter (DEC-270). undefined =>
 * Admin (alle Tenants, unveraendert); gesetzt => nur diese Tenants. `system_status`
 * ist nicht tenant-scopebar und ignoriert den Filter (nur ueber die Berater-
 * Whitelist in actions.ts vom Berater-Pfad ausgeschlossen).
 */
export async function loadReport(
  admin: SupabaseClient,
  key: ReportKey,
  allowedTenantIds?: string[],
): Promise<WorkspaceReport> {
  switch (key) {
    case "mandanten_uebersicht":
      return loadMandantenUebersicht(admin, allowedTenantIds);
    case "review_queue":
      return loadReviewQueue(admin, allowedTenantIds);
    case "wo_stockt_es":
      return loadWoStocktEs(admin, allowedTenantIds);
    case "system_status":
      return loadSystemStatus(admin);
    case "activity_timeline":
      return loadActivityTimeline(admin, undefined, allowedTenantIds);
    default: {
      const _exhaustive: never = key;
      throw new Error(`Unbekannter Report-Key: ${String(_exhaustive)}`);
    }
  }
}
