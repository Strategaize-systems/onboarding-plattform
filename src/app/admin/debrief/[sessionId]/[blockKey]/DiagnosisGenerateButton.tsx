"use client";

import { useState, useEffect, useTransition } from "react";
import { Loader2, Stethoscope } from "lucide-react";
import {
  triggerDiagnosisGeneration,
  fetchDiagnosis,
  type DiagnosisRow,
} from "./diagnosis-actions";

interface DiagnosisGenerateButtonProps {
  sessionId: string;
  blockKey: string;
  checkpointId: string;
  hasExisting: boolean;
  onDiagnosisGenerated: (diagnosis: DiagnosisRow) => void;
}

export function DiagnosisGenerateButton({
  sessionId,
  blockKey,
  checkpointId,
  hasExisting,
  onDiagnosisGenerated,
}: DiagnosisGenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isGenerating) return;

    const interval = setInterval(async () => {
      const diagnosis = await fetchDiagnosis(sessionId, blockKey);
      if (diagnosis) {
        setIsGenerating(false);
        onDiagnosisGenerated(diagnosis);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isGenerating, sessionId, blockKey, onDiagnosisGenerated]);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await triggerDiagnosisGeneration(
        sessionId,
        blockKey,
        checkpointId
      );
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
          Diagnose wird generiert…
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
        <Stethoscope className="h-4 w-4" />
        {isPending
          ? "Wird gestartet…"
          : hasExisting
            ? "Diagnose neu generieren"
            : "Diagnose generieren"}
      </button>
      <p className="text-xs text-slate-500">
        Generiert eine strukturierte Diagnose pro Unterthema aus den Knowledge
        Units
      </p>
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
