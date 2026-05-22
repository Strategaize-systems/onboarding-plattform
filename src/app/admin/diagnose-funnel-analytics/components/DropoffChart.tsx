// SLC-139 MT-5 (FEAT-058) — Drop-off-Bar-Chart pro Frage (Tailwind-Bars).

import type { QuestionStats } from "@/lib/diagnose-analytics/aggregations";

interface DropoffChartProps {
  perQuestion: QuestionStats[];
}

export function DropoffChart({ perQuestion }: DropoffChartProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          Drop-off pro Frage
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Prozentsatz der Sessions, die diese Frage gestartet, aber die naechste
          (bzw. den Abschluss bei der letzten Frage) nicht erreicht haben.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {perQuestion.map((q, index) => {
          const widthPct =
            q.dropOffRate === null ? 0 : Math.max(2, q.dropOffRate * 100);
          return (
            <div
              key={q.questionKey}
              className="grid grid-cols-[3rem_8rem_1fr_4rem] items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className="text-xs font-medium text-slate-500">
                Q{index + 1}
              </span>
              <span
                className="truncate font-mono text-xs text-slate-700"
                title={q.questionKey}
              >
                {q.questionKey}
              </span>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {q.belowThreshold ? (
                  <div className="absolute inset-0 flex items-center px-2 text-[10px] text-slate-400">
                    zu wenig Daten
                  </div>
                ) : (
                  <div
                    className={`h-full rounded-full ${
                      (q.dropOffRate ?? 0) > 0.3
                        ? "bg-red-500"
                        : (q.dropOffRate ?? 0) > 0.1
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                )}
              </div>
              <span className="text-right text-xs font-medium text-slate-700">
                {q.dropOffRate === null
                  ? "—"
                  : `${(q.dropOffRate * 100).toFixed(0)} %`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
