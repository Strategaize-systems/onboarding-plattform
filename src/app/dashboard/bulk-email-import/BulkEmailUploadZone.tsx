"use client";

// V9 SLC-165 MT-4 — Drag-Drop UI fuer Bulk-Email-Upload.
//
// Pattern aus src/app/capture/[sessionId]/block/[blockKey]/evidence/FileUploadZone.tsx
// (FEAT-013 Multi-File-Upload, SLC-018 Evidence-Mode). Wesentliche Unterschiede:
//   - Upload geht via Next.js Server-Action statt POST an API-Route.
//   - Accept-Filter ist .mbox + .eml statt PDF/DOCX/TXT/CSV/ZIP.
//   - Max-Size 500 MB statt 20 MB.
//   - Duplicate-Result wird separat als Hinweis-Status angezeigt.

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, FileWarning } from "lucide-react";

import { uploadBulkEmailRun } from "./actions";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES, validateUploadFile } from "./helpers";

interface QueuedFile {
  file: File;
  status: "pending" | "uploading" | "done" | "duplicate" | "error";
  runId?: string;
  error?: string;
}

export function BulkEmailUploadZone() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadOne = useCallback(
    async (file: File) => {
      setQueue((prev) =>
        prev.map((q) => (q.file === file ? { ...q, status: "uploading" } : q)),
      );

      const formData = new FormData();
      formData.append("file", file);

      let result;
      try {
        result = await uploadBulkEmailRun(formData);
      } catch (err) {
        setQueue((prev) =>
          prev.map((q) =>
            q.file === file
              ? { ...q, status: "error", error: (err as Error).message }
              : q,
          ),
        );
        return;
      }

      if (!result.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.file === file ? { ...q, status: "error", error: result.error } : q,
          ),
        );
        return;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.file === file
            ? {
                ...q,
                status: result.duplicate ? "duplicate" : "done",
                runId: result.runId,
              }
            : q,
        ),
      );

      // Status-Liste neu laden — Server-Component-Page wird re-rendered.
      startTransition(() => {
        router.refresh();
      });
    },
    [router],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: QueuedFile[] = [];
      for (const file of Array.from(files)) {
        const clientError = validateUploadFile(file);
        if (clientError) {
          newItems.push({ file, status: "error", error: clientError });
          continue;
        }
        newItems.push({ file, status: "pending" });
      }
      setQueue((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        if (item.status === "pending") {
          uploadOne(item.file);
        }
      }
    },
    [uploadOne],
  );

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
    [addFiles],
  );

  const acceptAttr = ALLOWED_EXTENSIONS.join(",");
  const maxMb = Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024);

  return (
    <div className="space-y-3">
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
          .mbox- oder .eml-Dateien hierher ziehen oder klicken
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Mehrere Dateien parallel — max. {maxMb} MB pro Datei
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttr}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

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
                  {(item.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              {item.status === "uploading" && (
                <Loader2 className="h-4 w-4 text-brand-primary animate-spin" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {item.status === "duplicate" && (
                <div className="flex items-center gap-1">
                  <FileWarning className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    Bereits hochgeladen
                  </span>
                </div>
              )}
              {item.status === "error" && (
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-500 max-w-[200px] truncate">
                    {item.error}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(item.file);
                }}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Aus Warteschlange entfernen"
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
