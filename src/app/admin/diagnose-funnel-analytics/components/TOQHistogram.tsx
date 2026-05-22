// SLC-139 MT-5 (FEAT-058) — Time-on-Question p50/p75/p90 pro Frage.
// Auffaellige Fragen (p90 > 60s) werden visuell markiert.

import type { QuestionStats } from "@/lib/diagnose-analytics/aggregations";

interface TOQHistogramProps {
  perQuestion: QuestionStats[];
}

const HIGH_P90_THRESHOLD_MS = 60_000;

function formatMs(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  return `${seconds.toFixed(1)} s`;
}

export function TOQHistogram({ perQuestion }: TOQHistogramProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          Zeit pro Frage (p50/p75/p90)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Verteilung der Zeit zwischen Frage-Render und Antwort. Fragen mit p90
          ueber 60 Sekunden sind markiert — Kandidaten fuer eine
          Umformulierung.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {perQuestion.map((q, index) => {
          const isHigh =
            q.toqP90Ms !== null && q.toqP90Ms > HIGH_P90_THRESHOLD_MS;
          return (
            <div
              key={q.questionKey}
              className="grid grid-cols-[3rem_8rem_1fr_1fr_1fr_5rem] items-center gap-3 px-4 py-2.5 text-sm"
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
              <div className="text-xs text-slate-500">
                p50:{" "}
                <span className="font-medium text-slate-700">
                  {formatMs(q.toqP50Ms)}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                p75:{" "}
                <span className="font-medium text-slate-700">
                  {formatMs(q.toqP75Ms)}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                p90:{" "}
                <span
                  className={`font-medium ${isHigh ? "text-red-600" : "text-slate-700"}`}
                >
                  {formatMs(q.toqP90Ms)}
                </span>
              </div>
              <div className="text-right">
                {isHigh ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-100">
                    auffaellig
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
