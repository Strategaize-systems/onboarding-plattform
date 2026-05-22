// SLC-139 MT-5 (FEAT-058) — KPI-Tiles fuer Funnel-Analytics.
// Pure Presentation, kein State.

import type { AnalyticsKpis } from "@/lib/diagnose-analytics/aggregations";

interface KpiTilesProps {
  kpis: AnalyticsKpis;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)} %`;
}

function formatMs(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)} min`;
}

export function KpiTiles({ kpis }: KpiTilesProps) {
  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Sessions",
      value: String(kpis.totalSessions),
      sub:
        kpis.totalSessions === 0
          ? "Noch keine Funnel-Daten"
          : `${kpis.completedSessions} abgeschlossen`,
    },
    {
      label: "Completion-Rate",
      value: formatPct(kpis.completionRate),
      sub:
        kpis.totalSessions === 0
          ? undefined
          : `${kpis.completedSessions} von ${kpis.totalSessions}`,
    },
    {
      label: "Median Zeit/Frage",
      value: formatMs(kpis.medianTimeOnQuestionMs),
      sub:
        kpis.medianTimeOnQuestionMs === null
          ? undefined
          : "ueber alle Fragen + Sessions",
    },
    {
      label: "Helper-Open-Rate",
      value: formatPct(kpis.helperOpenRate),
      sub: "Info-Klicks / Frage-Renders",
    },
    {
      label: "Abandoned",
      value: String(kpis.abandonedSessions),
      sub: "inaktiv > 30 Min, nicht abgeschlossen",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {tile.label}
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {tile.value}
          </div>
          {tile.sub ? (
            <div className="mt-1 text-xs text-slate-500">{tile.sub}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
