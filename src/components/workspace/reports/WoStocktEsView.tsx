// SLC-183 MT-3 (OP V10.2) — Report-View #3: Wo stockt es?
// Pro Mandant: Stall-Gründe (rose Badges), fehlgeschlagene Jobs, letzte Aktivität.
// Empty-State "Nichts stockt gerade".

import { CheckCircle2 } from "lucide-react";

import type { WoStocktEsReport } from "@/lib/workspace/reports";
import { Badge } from "@/components/ui/badge";

import { formatDateTime } from "./format";

export function WoStocktEsView({ report }: { report: WoStocktEsReport }) {
  if (report.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
        <p className="mt-3 text-sm text-slate-600">Nichts stockt gerade.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {report.rows.map((r) => (
        <div
          key={r.tenant_id}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-900">
              {r.tenant_name ?? "Unbenannter Mandant"}
            </span>
            <span className="text-xs text-slate-500">
              Letzte Aktivität: {formatDateTime(r.last_activity_at)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.reasons.map((reason, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
              >
                {reason}
              </span>
            ))}
            {r.failed_jobs_count > 0 && (
              <Badge variant="destructive">
                {r.failed_jobs_count} fehlgeschlagene Jobs
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
