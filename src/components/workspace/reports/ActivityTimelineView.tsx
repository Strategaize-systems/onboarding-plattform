// SLC-183 MT-3 (OP V10.2) — Report-View #5: Activity-Timeline.
// Vertikale Timeline: je Eintrag Mandant · Label · relative Zeit. Empty-State.

import type { ActivityTimelineReport } from "@/lib/workspace/reports";
import type { ActivitySource } from "@/lib/workspace/reports/activity-timeline";

import { formatRelative } from "./format";

const SOURCE_LABEL: Record<ActivitySource, string> = {
  capture_events: "Erfassung",
  diagnose_event: "Diagnose",
  modul_output: "Modul-Output",
  block_checkpoint: "Block",
  validation_layer: "Review",
};

const SOURCE_DOT: Record<ActivitySource, string> = {
  capture_events: "bg-brand-primary",
  diagnose_event: "bg-amber-500",
  modul_output: "bg-emerald-500",
  block_checkpoint: "bg-sky-500",
  validation_layer: "bg-violet-500",
};

export function ActivityTimelineView({
  report,
}: {
  report: ActivityTimelineReport;
}) {
  if (report.entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-500">
          Keine Aktivitäten im gewählten Zeitraum.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {report.entries.map((e, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            className={`absolute -left-[1.65rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${SOURCE_DOT[e.source]}`}
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold text-slate-900">
              {e.tenant_name ?? "Unbenannter Mandant"}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {SOURCE_LABEL[e.source]}
            </span>
            <span className="ml-auto text-xs text-slate-400">
              {formatRelative(e.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">{e.label}</p>
        </li>
      ))}
    </ol>
  );
}
