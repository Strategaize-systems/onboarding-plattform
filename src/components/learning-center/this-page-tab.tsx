// SLC-055 — "Diese Seite"-Tab im Learning Center (DEC-064 Variante 3).
//
// Rendert page-spezifisches Help-Markdown aus SLC-050 via react-markdown +
// remark-gfm (Wiederverwendung des Pattern aus dem alten HelpSheet bzw. dem
// Reader, DEC-049). Markdown wird via /api/help/<pageKey> client-side geholt
// und im Parent gecached, damit Tab-Wechsel keinen Re-Fetch ausloesen.
//
// Fallback-Banner wenn (a) pageKey null ist (unbekannter Pfad) oder
// (b) Fetch fehlschlaegt (z.B. 404).

"use client";

import { FileQuestion } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ThisPageTabProps {
  pageKey: string | null;
  markdown: string | null;
  loading: boolean;
  error: string | null;
}

export function ThisPageTab({ pageKey, markdown, loading, error }: ThisPageTabProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (!pageKey || error || !markdown) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <FileQuestion className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">
          Fuer diese Seite gibt es noch keinen Hilfe-Artikel.
        </p>
        <p className="max-w-xs text-xs text-slate-500">
          Schau in die Bedienungsanleitung oder die Video-Tutorials fuer
          allgemeine Erklaerungen.
        </p>
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
