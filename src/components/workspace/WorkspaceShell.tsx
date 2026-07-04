// SLC-182/183/184 (OP V10.2) — Hybrid-KI-Workspace-Layout.
// Drei Zonen: (oben) Mandanten-Selector + Report-Buttons, (mitte) Frage-Box,
// (unten) Ergebnis-Zone (Bericht ODER RAG-Antwort).
//
// SLC-183: Report-Buttons laden echte Cross-Mandanten-Berichte (cross-Mandant,
// ignorieren den Selector). SLC-184: die Frage-Box treibt die echte RAG-Kette
// (askRagAction) gegen den GEWAEHLTEN Mandanten — mit Coverage-Guard + Quellen +
// Sprach-Eingabe + optionalem Re-Embed. Ohne gewaehlten Mandanten ist der Frage-Pfad
// gesperrt (fail-closed UX; server-seitig zusaetzlich re-validiert, DEC-258).
"use client";

import { useState, useTransition } from "react";

import type { ReportKey, WorkspaceReport } from "@/lib/workspace/reports";
import type { RagCoverage, RagSource } from "@/lib/workspace/rag";
import { Skeleton } from "@/components/ui/skeleton";

import { loadWorkspaceReportAction } from "@/app/admin/mein-tag/actions";
import { askRagAction, reembedTenantAction } from "@/app/admin/mein-tag/rag-action";
import { ReportButtons } from "./ReportButtons";
import { QuestionBox } from "./QuestionBox";
import { AnswerPanel, type WorkspaceStatus } from "./AnswerPanel";
import { TenantSelector, type TenantOption } from "./TenantSelector";
import { ReportView } from "./reports/ReportView";

type ReportStatus = "idle" | "loading" | "error";

interface WorkspaceShellProps {
  tenants: TenantOption[];
}

export function WorkspaceShell({ tenants }: WorkspaceShellProps) {
  const [, startTransition] = useTransition();

  // Mandanten-Auswahl (nur fuer den Frage-Pfad; Berichte sind cross-Mandant).
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  // Bericht-Zweig (SLC-183).
  const [reportStatus, setReportStatus] = useState<ReportStatus>("idle");
  const [report, setReport] = useState<WorkspaceReport | null>(null);

  // Frage-Zweig (SLC-184: echtes RAG).
  const [answerStatus, setAnswerStatus] = useState<WorkspaceStatus>("empty");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [coverage, setCoverage] = useState<RagCoverage | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string>("");
  const [reembedBusy, setReembedBusy] = useState(false);

  const resetQuestionState = () => {
    setAnswer(null);
    setSources([]);
    setCoverage(null);
  };

  const handleSelectReport = (key: ReportKey) => {
    // Frage-Antwort verdrängen, Bericht-Zone übernimmt.
    resetQuestionState();
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
    if (!selectedTenant) return;
    setReport(null);
    setReportStatus("idle");
    resetQuestionState();
    setLastQuestion(question);
    setAnswerStatus("loading");
    startTransition(async () => {
      const result = await askRagAction(selectedTenant, question);
      if (result.ok) {
        setAnswer(result.answer);
        setSources(result.sources);
        setCoverage(result.coverage);
        setAnswerStatus("empty"); // "empty" = neutraler Container; AnswerPanel rendert Antwort/Hinweis.
      } else {
        setAnswerStatus("error");
      }
    });
  };

  const handleReembed = () => {
    if (!selectedTenant) return;
    setReembedBusy(true);
    startTransition(async () => {
      await reembedTenantAction(selectedTenant);
      // Nach dem Indexieren die letzte Frage erneut stellen (Coverage sollte nun passen).
      if (lastQuestion) {
        const result = await askRagAction(selectedTenant, lastQuestion);
        if (result.ok) {
          setAnswer(result.answer);
          setSources(result.sources);
          setCoverage(result.coverage);
          setAnswerStatus("empty");
        } else {
          setAnswerStatus("error");
        }
      }
      setReembedBusy(false);
    });
  };

  return (
    <div className="space-y-6">
      {/* Top-Zone: Mandanten-Selector + Report-Buttons */}
      <div className="space-y-4">
        <TenantSelector
          tenants={tenants}
          value={selectedTenant}
          onChange={setSelectedTenant}
        />
        <ReportButtons onSelect={handleSelectReport} />
      </div>

      {/* Middle-Zone: Frage-Box */}
      <QuestionBox
        onSubmit={handleSubmitQuestion}
        disabled={!selectedTenant}
        disabledHint="Zuerst einen Mandanten wählen"
        busy={answerStatus === "loading"}
      />

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
        <AnswerPanel
          status={answerStatus}
          answer={answer}
          sources={sources}
          coverage={coverage}
          onReembed={handleReembed}
          reembedBusy={reembedBusy}
        />
      )}
    </div>
  );
}
