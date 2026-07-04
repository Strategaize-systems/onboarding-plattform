// SLC-183 MT-3 (OP V10.2) — Report-View #2: Meine Review-Queue.
// Pro Mandant: offene Wissens-Units (Zahl-Badge) + offene Walkthrough-Reviews +
// jüngste Unit-Titel. Empty-State wenn keine offenen Items.

import { ClipboardCheck } from "lucide-react";

import type { ReviewQueueReport } from "@/lib/workspace/reports";
import { Badge } from "@/components/ui/badge";

export function ReviewQueueView({ report }: { report: ReviewQueueReport }) {
  if (report.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <ClipboardCheck className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">
          Keine offenen Reviews — die Queue ist leer.
        </p>
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gradient-primary">
                {r.proposed_units_count} Wissens-Units
              </Badge>
              {r.pending_walkthrough_reviews > 0 && (
                <Badge variant="gradient-warning">
                  {r.pending_walkthrough_reviews} Walkthrough-Reviews
                </Badge>
              )}
            </div>
          </div>
          {r.latest_unit_titles.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {r.latest_unit_titles.map((title, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                  <span className="line-clamp-1">{title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
