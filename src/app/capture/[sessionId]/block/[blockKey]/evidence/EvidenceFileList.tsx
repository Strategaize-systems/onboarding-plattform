"use client";

import { useEffect, useState } from "react";
import { Image, Loader2, CheckCircle2, AlertCircle, Download, Sparkles, ChevronDown, ChevronRight } from "lucide-react";

interface EvidenceFile {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  extraction_status: string;
  extraction_error: string | null;
  created_at: string;
}

interface AnalysisResult {
  text: string;
  created_at: string;
}

interface EvidenceFileListProps {
  sessionId: string;
  blockKey: string;
  refreshKey?: number;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  pending: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    label: "Warten...",
    color: "text-slate-500",
  },
  extracting: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    label: "Wird verarbeitet...",
    color: "text-brand-primary",
  },
  extracted: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: "Verarbeitet",
    color: "text-green-600",
  },
  failed: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    label: "Fehlgeschlagen",
    color: "text-red-500",
  },
};

function getFileTypeDisplay(filename: string, mimeType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || mimeType === "application/pdf";
  const isDocx = ext === "docx" || mimeType.includes("wordprocessingml");
  const isExcel = ext === "xlsx" || ext === "xls" || mimeType.includes("spreadsheet") || mimeType.includes("ms-excel");
  const isImage = mimeType.startsWith("image/");
  const isCsv = ext === "csv" || mimeType === "text/csv";
  const isZip = ext === "zip" || mimeType === "application/zip";
  const isTxt = ext === "txt" || mimeType === "text/plain";

  const iconBg = isPdf
    ? "from-red-600 to-red-700"
    : isDocx
    ? "from-blue-600 to-blue-700"
    : isExcel
    ? "from-emerald-600 to-emerald-700"
    : isImage
    ? "from-violet-500 to-violet-600"
    : isCsv
    ? "from-teal-500 to-teal-600"
    : isZip
    ? "from-amber-500 to-amber-600"
    : isTxt
    ? "from-slate-400 to-slate-500"
    : "from-slate-500 to-slate-600";

  const iconLabel = isPdf ? "PDF" : isDocx ? "DOCX" : isExcel ? (ext === "xls" ? "XLS" : "XLSX") : isCsv ? "CSV" : isZip ? "ZIP" : isTxt ? "TXT" : isImage ? null : ext.toUpperCase() || "FILE";

  return { iconBg, iconLabel, isImage };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFile(sessionId: string, fileId: string) {
  try {
    const res = await fetch(`/api/capture/${sessionId}/evidence/${fileId}/download`);
    if (res.ok) {
      const data = await res.json();
      window.open(data.download_url, "_blank");
    }
  } catch {
    // Silent fail
  }
}

export function EvidenceFileList({
  sessionId,
  blockKey,
  refreshKey = 0,
}: EvidenceFileListProps) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAnalyses, setExpandedAnalyses] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    async function loadData() {
      try {
        const res = await fetch(
          `/api/capture/${sessionId}/evidence/list?blockKey=${encodeURIComponent(blockKey)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (!cancelled) {
          const currentFiles: EvidenceFile[] = data.files ?? [];
          setFiles(currentFiles);
          setAnalyses(data.analyses ?? {});
          setLoading(false);

          // Poll if files are processing or recent files lack analysis
          const hasProcessing = currentFiles.some(
            (f) => f.extraction_status === "pending" || f.extraction_status === "extracting"
          );
          const recentWithoutAnalysis = currentFiles.some((f) => {
            const age = Date.now() - new Date(f.created_at).getTime();
            return age < 3 * 60 * 1000 && !data.analyses?.[f.id];
          });

          if (hasProcessing || recentWithoutAnalysis) {
            pollTimer = setTimeout(loadData, 5000);
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [sessionId, blockKey, refreshKey]);

  function toggleAnalysis(fileId: string) {
    setExpandedAnalyses((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Hochgeladene Dateien ({files.length})
      </h4>
      {files.map((file) => {
        const status = STATUS_CONFIG[file.extraction_status] ?? STATUS_CONFIG.pending;
        const { iconBg, iconLabel, isImage: isImageFile } = getFileTypeDisplay(file.original_filename, file.mime_type);
        const analysis = analyses[file.id];
        const age = Date.now() - new Date(file.created_at).getTime();
        const isAnalysisPending = !analysis && age < 3 * 60 * 1000;
        const isExpanded = expandedAnalyses.has(file.id);

        return (
          <div key={file.id} className="space-y-0">
            {/* File row */}
            <div className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all px-3 py-2.5">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${iconBg} flex items-center justify-center text-white shadow-md flex-shrink-0`}>
                {isImageFile ? (
                  <Image className="h-4 w-4" />
                ) : (
                  <span className="text-[10px] font-bold">{iconLabel}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {file.original_filename}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{formatFileSize(file.file_size_bytes)}</span>
                  <span>&bull;</span>
                  <span>{new Date(file.created_at).toLocaleDateString("de-DE")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 ${status.color}`}>
                  {status.icon}
                  <span className="text-xs font-medium">{status.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadFile(sessionId, file.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-200"
                  title="Herunterladen"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* KI Analysis pending */}
            {isAnalysisPending && (
              <div className="ml-5 mt-1 flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-brand-primary animate-pulse flex-shrink-0" />
                <Loader2 className="h-3 w-3 animate-spin text-brand-primary flex-shrink-0" />
                <span className="text-xs text-brand-primary font-medium">
                  KI analysiert Dokument...
                </span>
              </div>
            )}

            {/* KI Analysis result */}
            {analysis && (
              <div className="ml-5 mt-1 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2">
                <button
                  onClick={() => toggleAnalysis(file.id)}
                  className="w-full flex items-center gap-2 text-left"
                >
                  <Sparkles className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />
                  <span className="text-xs font-semibold text-brand-primary flex-1">
                    KI-Analyse
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-brand-primary" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-brand-primary" />
                  )}
                </button>
                {isExpanded && (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap border-t border-brand-primary/10 pt-2">
                    {analysis.text}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
