// SLC-183 MT-3 (OP V10.2) — Report-View #4: System-Status.
// Inline-Stat-Zeile (laufend / fehlgeschlagen / Fehler 24h) — KEINE großen
// KPI-Karten — plus kompakte Listen der jüngsten Jobs + Fehler.

import type { SystemStatusReport } from "@/lib/workspace/reports";
import { Badge } from "@/components/ui/badge";

import { formatDateTime } from "./format";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "danger";
}) {
  const valueColor =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-slate-900";
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-lg font-bold ${valueColor}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

export function SystemStatusView({ report }: { report: SystemStatusReport }) {
  return (
    <div className="space-y-5">
      {/* Inline-Stat-Zeile */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Stat
          label="laufende Jobs"
          value={report.running_jobs_count}
          tone={report.running_jobs_count > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="fehlgeschlagene Jobs"
          value={report.failed_jobs_count}
          tone={report.failed_jobs_count > 0 ? "danger" : "neutral"}
        />
        <Stat
          label="Fehler (24h)"
          value={report.errors_last_24h_count}
          tone={report.errors_last_24h_count > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* Jüngste Jobs */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Jüngste Jobs
        </h4>
        {report.latest_jobs.length === 0 ? (
          <p className="text-sm text-slate-400">Keine laufenden oder fehlgeschlagenen Jobs.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {report.latest_jobs.map((j, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Badge
                  variant={j.status === "failed" ? "destructive" : "gradient-warning"}
                >
                  {j.status ?? "—"}
                </Badge>
                <span className="font-medium text-slate-700">
                  {j.job_type ?? "—"}
                </span>
                {j.error && (
                  <span className="line-clamp-1 text-xs text-rose-600">
                    {j.error}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {formatDateTime(j.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Jüngste Fehler */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Jüngste Fehler (24h)
        </h4>
        {report.latest_errors.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Fehler in den letzten 24 Stunden.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {report.latest_errors.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Badge variant={e.level === "error" ? "destructive" : "neutral"}>
                  {e.level ?? "—"}
                </Badge>
                <span className="font-medium text-slate-700">
                  {e.source ?? "—"}
                </span>
                {e.message && (
                  <span className="line-clamp-1 text-xs text-slate-500">
                    {e.message}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {formatDateTime(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
