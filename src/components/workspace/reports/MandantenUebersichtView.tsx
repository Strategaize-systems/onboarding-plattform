// SLC-183 MT-3 (OP V10.2) — Report-View #1: Mandanten-Übersicht.
// Pro-Mandant-Tabelle: Name, Blöcke-Fortschritt, Reife-Ampel, Bridge- +
// Handbuch-Status als Badges, letzte Aktivität. Kein KPI-Widget-Layout.

import type { MandantenUebersichtReport } from "@/lib/workspace/reports";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

import { Ampel } from "./Ampel";
import { formatDateTime } from "./format";

const BRIDGE_LABEL: Record<string, string> = {
  none: "—",
  running: "läuft",
  completed: "fertig",
  failed: "Fehler",
  stale: "veraltet",
};

const HANDBOOK_LABEL: Record<string, string> = {
  none: "—",
  generating: "in Arbeit",
  ready: "fertig",
  failed: "Fehler",
};

function statusVariant(
  status: string,
): "neutral" | "gradient-success" | "gradient-warning" | "destructive" {
  if (status === "completed" || status === "ready") return "gradient-success";
  if (status === "running" || status === "generating") return "gradient-warning";
  if (status === "failed") return "destructive";
  return "neutral";
}

export function MandantenUebersichtView({
  report,
}: {
  report: MandantenUebersichtReport;
}) {
  if (report.rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">Keine Mandanten vorhanden.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-4 font-semibold">Mandant</th>
            <th className="pb-2 pr-4 font-semibold">Blöcke</th>
            <th className="pb-2 pr-4 font-semibold">Reife</th>
            <th className="pb-2 pr-4 font-semibold">Bridge</th>
            <th className="pb-2 pr-4 font-semibold">Handbuch</th>
            <th className="pb-2 pr-4 font-semibold">Mitarbeiter</th>
            <th className="pb-2 font-semibold">Letzte Aktivität</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => {
            const pct =
              r.blocks_total > 0
                ? Math.round((r.blocks_submitted / r.blocks_total) * 100)
                : 0;
            return (
              <tr
                key={r.tenant_id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="py-3 pr-4 font-medium text-slate-900">
                  {r.tenant_name}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-2 w-24" />
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {r.blocks_total > 0
                        ? `${r.blocks_submitted}/${r.blocks_total}`
                        : "–"}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Ampel value={r.modul_reife_ampel} />
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={statusVariant(r.bridge_status)}>
                    {BRIDGE_LABEL[r.bridge_status] ?? r.bridge_status}
                    {r.bridge_proposal_count > 0
                      ? ` (${r.bridge_proposal_count})`
                      : ""}
                  </Badge>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={statusVariant(r.handbook_status)}>
                    {HANDBOOK_LABEL[r.handbook_status] ?? r.handbook_status}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-slate-700">
                  {r.employees_count}
                </td>
                <td className="py-3 text-slate-500">
                  {formatDateTime(r.last_activity_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
