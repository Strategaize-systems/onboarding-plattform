// SLC-182/183 (OP V10.2) — Hybrid-KI-Workspace-Layout.
// Drei Zonen: (oben) Mandanten-Selector-SLOT + Report-Buttons,
// (mitte) Frage-Box, (unten) Ergebnis-Zone (Bericht ODER Antwort).
//
// SLC-183: Report-Buttons laden echte Cross-Mandanten-Berichte via
// loadWorkspaceReportAction (Server-Action, re-gated). Die Ergebnis-Zone rendert
// je nach reportStatus: loading (Skeleton) / error (Hinweis) / Bericht (ReportView)
// / sonst das Frage-Antwort-Panel. Der Frage-Pfad (QuestionBox) bleibt der
// SLC-182-Stub — echtes RAG folgt in SLC-184.
"use client";

import { useState, useTransition } from "react";

import type { ReportKey, WorkspaceReport } from "@/lib/workspace/reports";
import { Skeleton } from "@/components/ui/skeleton";

import { loadWorkspaceReportAction } from "@/app/admin/mein-tag/actions";
import { ReportButtons } from "./ReportButtons";
import { QuestionBox } from "./QuestionBox";
import { AnswerPanel, type WorkspaceStatus } from "./AnswerPanel";
import { ReportView } from "./reports/ReportView";

type ReportStatus = "idle" | "loading" | "error";

export function WorkspaceShell() {
  const [, startTransition] = useTransition();

  // Bericht-Zweig (SLC-183).
  const [reportStatus, setReportStatus] = useState<ReportStatus>("idle");
  const [report, setReport] = useState<WorkspaceReport | null>(null);

  // Frage-Zweig (SLC-182-Stub, RAG folgt SLC-184).
  const [answerStatus, setAnswerStatus] = useState<WorkspaceStatus>("empty");
  const [answer, setAnswer] = useState<string | null>(null);

  const handleSelectReport = (key: ReportKey) => {
    // Frage-Antwort verdrängen, Bericht-Zone übernimmt.
    setAnswer(null);
    setAnswerStatus("empty");
    setReport(null);
    setReportStatus("loading");
    startTransition(async () => {
      const result = await loadWorkspaceReportAction(key);
      if (result.ok) {
        setReport(result.report);
        setReportStatus("idle");
      } else {
        setReportStatus("error");
      }
    });
  };

  const handleSubmitQuestion = (question: string) => {
    // SLC-182-Stub: freie Frage. Echtes RAG folgt SLC-184.
    setReport(null);
    setReportStatus("idle");
    setAnswer(null);
    setAnswerStatus("loading");
    setTimeout(() => {
      setAnswer(
        `Frage erhalten: „${question}“\n\nDie KI-gestützte Antwort folgt in SLC-184.`,
      );
      setAnswerStatus("empty");
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Top-Zone: Mandanten-Selector-SLOT + Report-Buttons */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
          <span className="font-semibold text-slate-500">Mandanten-Auswahl</span>
          <span>folgt (SLC-184)</span>
        </div>
        <ReportButtons onSelect={handleSelectReport} />
      </div>

      {/* Middle-Zone: Frage-Box */}
      <QuestionBox onSubmit={handleSubmitQuestion} />

      {/* Bottom-Zone: Bericht ODER Frage-Antwort */}
      {reportStatus === "loading" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : reportStatus === "error" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Bericht konnte nicht geladen werden. Bitte versuche es erneut.
        </div>
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <AnswerPanel status={answerStatus} answer={answer} />
      )}
    </div>
  );
}
