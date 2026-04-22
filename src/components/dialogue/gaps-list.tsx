"use client";

import { AlertTriangle } from "lucide-react";
import type { DialogueGap } from "@/types/dialogue-session";

interface GapsListProps {
  gaps: DialogueGap[];
}

export function GapsList({ gaps }: GapsListProps) {
  if (gaps.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-bold text-amber-800">
          Nicht besprochene Themen ({gaps.length})
        </h3>
      </div>

      <div className="space-y-2">
        {gaps.map((gap, i) => (
          <div
            key={gap.topic_key ?? i}
            className="rounded-lg bg-white/70 border border-amber-100 px-3 py-2"
          >
            <p className="text-sm font-medium text-amber-900">
              {gap.topic_title}
            </p>
            {gap.reason && (
              <p className="text-xs text-amber-700 mt-0.5">{gap.reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
