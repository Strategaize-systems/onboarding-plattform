"use client";

import { useState, useEffect, useTransition } from "react";
import { Loader2, FileText } from "lucide-react";
import { triggerSopGeneration, fetchSop, type SopRow } from "./sop-actions";

interface SopGenerateButtonProps {
  sessionId: string;
  blockKey: string;
  checkpointId: string;
  onSopGenerated: (sop: SopRow) => void;
}

export function SopGenerateButton({
  sessionId,
  blockKey,
  checkpointId,
  onSopGenerated,
}: SopGenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isGenerating) return;

    const interval = setInterval(async () => {
      const sop = await fetchSop(sessionId, blockKey);
      if (sop) {
        setIsGenerating(false);
        onSopGenerated(sop);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isGenerating, sessionId, blockKey, onSopGenerated]);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await triggerSopGeneration(sessionId, blockKey, checkpointId);
      if (!result.success) {
        setError(result.error ?? "Unbekannter Fehler");
        return;
      }
      setIsGenerating(true);
    });
  }

  if (isGenerating) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span className="text-sm font-medium text-blue-700">
          SOP wird generiert…
        </span>
        <span className="text-xs text-blue-500">
          Dies kann 30–60 Sekunden dauern
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        <FileText className="h-4 w-4" />
        {isPending ? "Wird gestartet…" : "SOP generieren"}
      </button>
      <p className="text-xs text-slate-500">
        Generiert einen strukturierten Handlungsplan aus den Knowledge Units
      </p>
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
