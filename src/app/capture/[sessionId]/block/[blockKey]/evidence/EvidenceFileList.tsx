"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface EvidenceFile {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  extraction_status: string;
  extraction_error: string | null;
  created_at: string;
}

interface EvidenceFileListProps {
  sessionId: string;
  blockKey: string;
  refreshKey?: number; // increment to force refresh
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
    label: "Wird analysiert...",
    color: "text-brand-primary",
  },
  extracted: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: "Analysiert",
    color: "text-green-600",
  },
  failed: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    label: "Fehlgeschlagen",
    color: "text-red-500",
  },
};

export function EvidenceFileList({
  sessionId,
  blockKey,
  refreshKey = 0,
}: EvidenceFileListProps) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    async function loadFiles() {
      const supabase = createClient();
      const { data } = await supabase
        .from("evidence_file")
        .select(
          "id, original_filename, mime_type, file_size_bytes, extraction_status, extraction_error, created_at"
        )
        .eq("capture_session_id", sessionId)
        .eq("block_key", blockKey)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setFiles(data ?? []);
        setLoading(false);

        // Poll if any files are still pending/extracting
        const hasPending = (data ?? []).some(
          (f) => f.extraction_status === "pending" || f.extraction_status === "extracting"
        );
        if (hasPending) {
          pollTimer = setTimeout(loadFiles, 5000);
        }
      }
    }

    loadFiles();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [sessionId, blockKey, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (files.length === 0) {
    return null; // no files uploaded yet
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Hochgeladene Dateien ({files.length})
      </h4>
      {files.map((file) => {
        const status = STATUS_CONFIG[file.extraction_status] ?? STATUS_CONFIG.pending;
        return (
          <div
            key={file.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">
                {file.original_filename}
              </p>
              <p className="text-xs text-slate-400">
                {(file.file_size_bytes / 1024).toFixed(0)} KB
              </p>
            </div>
            <div className={`flex items-center gap-1.5 ${status.color}`}>
              {status.icon}
              <span className="text-xs font-medium">{status.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
