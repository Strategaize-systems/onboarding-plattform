// SLC-182 MT-3 / SLC-184 MT-3 — Antwort-Panel des Berater-Workspace.
// Rendert je nach status: empty / loading / error, plus die RAG-Antwort mit
// Quellenliste, Coverage-Hinweis (DEC-261/ISSUE-112) und optionalem Re-Embed-Trigger.
"use client";

import { AlertCircle, AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { RagCoverage, RagSource } from "@/lib/workspace/rag";

export type WorkspaceStatus = "empty" | "loading" | "error";

interface AnswerPanelProps {
  status: WorkspaceStatus;
  answer?: string | null;
  sources?: RagSource[];
  coverage?: RagCoverage | null;
  /** Re-Embed-Trigger (nur wenn coverage.canReembed). */
  onReembed?: () => void;
  reembedBusy?: boolean;
}

function CoverageHint({
  coverage,
  onReembed,
  reembedBusy,
}: {
  coverage: RagCoverage;
  onReembed?: () => void;
  reembedBusy?: boolean;
}) {
  if (!coverage.warning) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="space-y-2">
        <p>{coverage.warning}</p>
        {coverage.canReembed && onReembed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReembed}
            disabled={reembedBusy}
            className="border-amber-300 text-amber-800 hover:bg-amber-100"
          >
            {reembedBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>Erkenntnisse jetzt indexieren</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: RagSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Quellen ({sources.length})
      </p>
      <ol className="space-y-2">
        {sources.map((s, i) => (
          <li key={i} className="rounded-lg bg-slate-50 p-2.5 text-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">[{i + 1}]</span>
              {s.title ? <span className="font-semibold text-slate-700">{s.title}</span> : null}
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">{s.source_type}</span>
              {s.date ? <span>{s.date.slice(0, 10)}</span> : null}
              <span className="ml-auto">{Math.round(s.similarity * 100)}%</span>
            </div>
            <p className="mt-1 text-slate-600">{s.snippet}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AnswerPanel({
  status,
  answer,
  sources = [],
  coverage,
  onReembed,
  reembedBusy,
}: AnswerPanelProps) {
  if (status === "loading") {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-600">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Analyse fehlgeschlagen</p>
          <p className="mt-1 text-sm text-slate-500">
            Die Analyse konnte nicht geladen werden. Bitte versuche es erneut.
          </p>
        </div>
      </div>
    );
  }

  // Antwort ODER Coverage-Hinweis (answer kann null sein, wenn keine Grundlage existiert).
  if (answer || coverage?.warning) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
          <Sparkles className="h-4 w-4" />
          <span>Analyse</span>
        </div>
        {coverage ? (
          <div className="mb-3">
            <CoverageHint
              coverage={coverage}
              onReembed={onReembed}
              reembedBusy={reembedBusy}
            />
          </div>
        ) : null}
        {answer ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{answer}</p>
        ) : null}
        <SourceList sources={sources} />
      </div>
    );
  }

  // status === "empty"
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-slate-300" />
      <p className="mt-3 text-sm text-slate-500">
        Noch keine Analyse — wähle einen Bericht oder stelle eine Frage.
      </p>
    </div>
  );
}
