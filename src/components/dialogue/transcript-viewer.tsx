"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

interface TranscriptViewerProps {
  transcript: string;
  maxCollapsedLines?: number;
}

export function TranscriptViewer({
  transcript,
  maxCollapsedLines = 10,
}: TranscriptViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = transcript.split("\n");
  const isLong = lines.length > maxCollapsedLines;
  const displayText = isExpanded
    ? transcript
    : lines.slice(0, maxCollapsedLines).join("\n");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-bold text-slate-900">Transkript</h3>
        <span className="text-xs text-slate-400">
          {lines.length} Zeilen &middot;{" "}
          {Math.round(transcript.length / 1000)}k Zeichen
        </span>
      </div>

      <div className="relative">
        <pre className="whitespace-pre-wrap text-xs text-slate-600 font-mono bg-slate-50 rounded-lg p-3 max-h-[500px] overflow-y-auto leading-relaxed">
          {displayText}
        </pre>

        {isLong && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-50 to-transparent rounded-b-lg" />
        )}
      </div>

      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-brand-primary-dark"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Gesamtes Transkript anzeigen ({lines.length} Zeilen)
            </>
          )}
        </button>
      )}
    </div>
  );
}
