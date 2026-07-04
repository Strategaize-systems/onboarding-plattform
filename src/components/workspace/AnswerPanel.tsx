// SLC-182 MT-3 — Antwort-Panel des Berater-Workspace.
// Rendert je nach status: empty / loading / error, plus optionale Stub-Antwort.
// Echte Analysen (Berichte + RAG-Frage-Antwort) folgen in SLC-183/184.
"use client";

import { AlertCircle, Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export type WorkspaceStatus = "empty" | "loading" | "error";

interface AnswerPanelProps {
  status: WorkspaceStatus;
  answer?: string | null;
}

export function AnswerPanel({ status, answer }: AnswerPanelProps) {
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

  if (answer) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
          <Sparkles className="h-4 w-4" />
          <span>Analyse</span>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{answer}</p>
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
