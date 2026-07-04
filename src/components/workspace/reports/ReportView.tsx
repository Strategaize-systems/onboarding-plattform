// SLC-183 MT-3 (OP V10.2) — Report-View-Dispatcher + KI-Kurzfazit-Block.
// Schaltet je nach report.key auf die passende View. Der "Kurzfazit erstellen"-
// Button ruft generateReportFazitAction via useTransition. Fail-open: fazit=null
// oder Fehler → dezenter Hinweis, der Bericht bleibt voll nutzbar.
"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import type { WorkspaceReport, ReportKey } from "@/lib/workspace/reports";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { generateReportFazitAction } from "@/app/admin/mein-tag/actions";
import { MandantenUebersichtView } from "./MandantenUebersichtView";
import { ReviewQueueView } from "./ReviewQueueView";
import { WoStocktEsView } from "./WoStocktEsView";
import { SystemStatusView } from "./SystemStatusView";
import { ActivityTimelineView } from "./ActivityTimelineView";

const REPORT_TITLE: Record<ReportKey, string> = {
  mandanten_uebersicht: "Mandanten-Übersicht",
  review_queue: "Meine Review-Queue",
  wo_stockt_es: "Wo stockt es",
  system_status: "System-Status",
  activity_timeline: "Activity-Timeline",
};

function renderView(report: WorkspaceReport) {
  switch (report.key) {
    case "mandanten_uebersicht":
      return <MandantenUebersichtView report={report} />;
    case "review_queue":
      return <ReviewQueueView report={report} />;
    case "wo_stockt_es":
      return <WoStocktEsView report={report} />;
    case "system_status":
      return <SystemStatusView report={report} />;
    case "activity_timeline":
      return <ActivityTimelineView report={report} />;
    default: {
      const _exhaustive: never = report;
      return _exhaustive;
    }
  }
}

export function ReportView({ report }: { report: WorkspaceReport }) {
  const [isPending, startTransition] = useTransition();
  const [fazit, setFazit] = useState<string | null>(null);
  const [fazitFailed, setFazitFailed] = useState(false);
  const [requested, setRequested] = useState(false);

  const handleFazit = () => {
    setRequested(true);
    setFazitFailed(false);
    setFazit(null);
    startTransition(async () => {
      const result = await generateReportFazitAction(report.key);
      if (result.ok && result.fazit) {
        setFazit(result.fazit);
      } else {
        // fail-open: kein Fazit, Bericht bleibt nutzbar.
        setFazitFailed(true);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">
          {REPORT_TITLE[report.key]}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleFazit}
          disabled={isPending}
        >
          <Sparkles className="h-4 w-4 text-brand-primary" />
          <span>{isPending ? "Fazit wird erstellt…" : "Kurzfazit erstellen"}</span>
        </Button>
      </div>

      {/* KI-Kurzfazit-Block */}
      {(isPending || requested) && (
        <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <Sparkles className="h-4 w-4" />
            <span>KI-Kurzfazit</span>
          </div>
          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : fazit ? (
            <p className="text-sm leading-relaxed text-slate-700">{fazit}</p>
          ) : fazitFailed ? (
            <p className="text-sm text-slate-500">
              Kurzfazit derzeit nicht verfügbar.
            </p>
          ) : null}
        </div>
      )}

      {renderView(report)}
    </div>
  );
}
