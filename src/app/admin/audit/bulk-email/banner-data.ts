// V9.1 SLC-V9.1-B MT-4 — Pure-Helper fuer den Cap-Hit/Approval-Banner.
//
// Trennung von page.tsx (Server-Component) fuer hermetische Unit-Tests der
// Banner-Logik (banner-data.test.ts), analog helpers.ts-Pattern.

export type FlaggedStatus = "paused" | "awaiting_approval";

export interface FlaggedRunInput {
  id: string;
  tenant_name: string | null;
  status: string;
}

export interface FlaggedRun {
  id: string;
  tenant_name: string | null;
  status: FlaggedStatus;
}

/**
 * Liefert die Runs, die im Admin-Audit als Banner-relevant gelten:
 * status 'paused' (Daily/Monthly-Cap-Hit) oder 'awaiting_approval'
 * (Per-Email-Approval-Pause). Reihenfolge bleibt erhalten (Input ist bereits
 * created_at-desc sortiert).
 */
export function selectFlaggedRuns(runs: FlaggedRunInput[]): FlaggedRun[] {
  const out: FlaggedRun[] = [];
  for (const r of runs) {
    if (r.status === "paused" || r.status === "awaiting_approval") {
      out.push({ id: r.id, tenant_name: r.tenant_name, status: r.status });
    }
  }
  return out;
}

/** Deutsche Label + Action-Text pro Flag-Status fuer das Banner. */
export function flaggedStatusLabel(status: FlaggedStatus): {
  label: string;
  action: string;
} {
  return status === "paused"
    ? { label: "Pausiert (Kostenlimit)", action: "Cost-Review oeffnen" }
    : { label: "Freigabe erforderlich", action: "Approval pruefen" };
}
