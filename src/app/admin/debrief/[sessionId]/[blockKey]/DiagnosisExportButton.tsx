"use client";

import { Download } from "lucide-react";
import type { DiagnosisContent } from "@/workers/diagnosis/types";

interface DiagnosisExportButtonProps {
  content: DiagnosisContent;
  blockKey: string;
}

export function DiagnosisExportButton({
  content,
  blockKey,
}: DiagnosisExportButtonProps) {
  function handleExport() {
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `diagnosis-${blockKey}-${dateStr}.json`;
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <Download className="h-3.5 w-3.5" />
      JSON exportieren
    </button>
  );
}
