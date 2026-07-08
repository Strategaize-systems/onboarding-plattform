// SLC-182 MT-3 / SLC-183 — Report-Button-Reihe (FEAT-100).
// Fuenf Standard-Berichte cross-Mandant. Klick ruft onSelect(reportKey); die Shell
// laedt darueber den echten Bericht via loadWorkspaceReportAction (SLC-183).
"use client";

import {
  LayoutGrid,
  ClipboardCheck,
  AlertTriangle,
  Activity,
  History,
  type LucideIcon,
} from "lucide-react";

import type { ReportKey } from "@/lib/workspace/reports";

interface ReportButtonsProps {
  onSelect: (reportKey: ReportKey) => void;
  /**
   * Optionale Whitelist der anzuzeigenden Report-Keys. undefined => alle (Admin).
   * V10.4 SLC-190: der Berater bekommt nur sein Report-Set (kein System-Status),
   * damit kein garantiert fehlschlagender Button gerendert wird (DEC-270).
   */
  reportKeys?: ReportKey[];
}

const REPORTS: { key: ReportKey; label: string; icon: LucideIcon }[] = [
  { key: "mandanten_uebersicht", label: "Mandanten-Übersicht", icon: LayoutGrid },
  { key: "review_queue", label: "Meine Review-Queue", icon: ClipboardCheck },
  { key: "wo_stockt_es", label: "Wo stockt es", icon: AlertTriangle },
  { key: "system_status", label: "System-Status", icon: Activity },
  { key: "activity_timeline", label: "Activity-Timeline", icon: History },
];

export function ReportButtons({ onSelect, reportKeys }: ReportButtonsProps) {
  const visibleReports =
    reportKeys === undefined
      ? REPORTS
      : REPORTS.filter((r) => reportKeys.includes(r.key));

  return (
    <div className="flex flex-wrap gap-2">
      {visibleReports.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary-dark to-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_12px_-2px_rgba(68,84,184,0.35)] transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Icon className="h-4 w-4 text-white" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
