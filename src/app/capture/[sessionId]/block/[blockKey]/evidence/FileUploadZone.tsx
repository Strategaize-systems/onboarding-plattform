"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const ALLOWED_EXTENSIONS = ".pdf,.docx,.txt,.csv,.zip";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

interface UploadResult {
  id: string;
  filename: string;
  status: string;
}

interface FileUploadZoneProps {
  sessionId: string;
  blockKey: string;
  onUploadComplete?: (result: UploadResult) => void;
}

interface QueuedFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  result?: UploadResult;
  error?: string;
}

export function FileUploadZone({
  sessionId,
  blockKey,
  onUploadComplete,
}: FileUploadZoneProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: QueuedFile[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          newItems.push({
            file,
            status: "error",
            error: `Zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)`,
          });
          continue;
        }
        newItems.push({ file, status: "pending" });
      }
      setQueue((prev) => [...prev, ...newItems]);

      // Start uploading pending files
      for (const item of newItems) {
        if (item.status === "pending") {
          uploadFile(item.file);
        }
      }
    },
    [sessionId, blockKey]
  );

  const uploadFile = async (file: File) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.file === file ? { ...q, status: "uploading" as const } : q
      )
    );

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("blockKey", blockKey);

      const res = await fetch(
        `/api/capture/${sessionId}/evidence/upload`,
        { method: "POST", body: formData }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? `Upload fehlgeschlagen (${res.status})`;
        setQueue((prev) =>
          prev.map((q) =>
            q.file === file ? { ...q, status: "error" as const, error: msg } : q
          )
        );
        return;
      }

      const result: UploadResult = await res.json();
      setQueue((prev) =>
        prev.map((q) =>
          q.file === file ? { ...q, status: "done" as const, result } : q
        )
      );
      onUploadComplete?.(result);
    } catch (err) {
      setQueue((prev) =>
        prev.map((q) =>
          q.file === file
            ? { ...q, status: "error" as const, error: "Netzwerkfehler" }
            : q
        )
      );
    }
  };

  const removeFromQueue = (file: File) => {
    setQueue((prev) => prev.filter((q) => q.file !== file));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors
          ${isDragging
            ? "border-brand-primary bg-brand-primary/5"
            : "border-slate-300 hover:border-brand-primary/50 hover:bg-slate-50"
          }
        `}
      >
        <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">
          Dateien hierher ziehen oder klicken
        </p>
        <p className="text-xs text-slate-400 mt-1">
          PDF, DOCX, TXT, CSV, ZIP — max. 20 MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Upload Queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item, i) => (
            <div
              key={`${item.file.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-slate-400">
                  {(item.file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              {item.status === "uploading" && (
                <Loader2 className="h-4 w-4 text-brand-primary animate-spin" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {item.status === "error" && (
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-500 max-w-[150px] truncate">
                    {item.error}
                  </span>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(item.file);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
