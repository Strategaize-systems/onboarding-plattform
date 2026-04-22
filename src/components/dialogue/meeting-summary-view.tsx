"use client";

import { CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";
import type { DialogueSummary } from "@/types/dialogue-session";

interface MeetingSummaryViewProps {
  summary: DialogueSummary;
}

export function MeetingSummaryView({ summary }: MeetingSummaryViewProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand-primary" />
        <h3 className="text-sm font-bold text-slate-900">Meeting-Zusammenfassung</h3>
      </div>

      {/* Overall summary */}
      {summary.overall && (
        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
          {summary.overall}
        </p>
      )}

      {/* Per-topic summaries */}
      {summary.topics && summary.topics.length > 0 && (
        <div className="space-y-3">
          {summary.topics.map((topic) => (
            <div
              key={topic.key}
              className="rounded-lg border border-slate-100 p-3 space-y-2"
            >
              <h4 className="text-sm font-semibold text-slate-800">
                {topic.title}
              </h4>

              {topic.highlights && topic.highlights.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Highlights</p>
                  <ul className="space-y-1">
                    {topic.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {topic.decisions && topic.decisions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Entscheidungen</p>
                  <ul className="space-y-1">
                    {topic.decisions.map((d, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <span className="text-blue-500 font-bold flex-shrink-0">&rarr;</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {topic.open_points && topic.open_points.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Offene Punkte</p>
                  <ul className="space-y-1">
                    {topic.open_points.map((o, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <AlertCircle className="h-3 w-3 mt-0.5 text-amber-500 flex-shrink-0" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
