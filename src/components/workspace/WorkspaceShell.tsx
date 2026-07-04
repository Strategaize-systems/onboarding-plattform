// SLC-182 MT-2 — Hybrid-KI-Workspace-Layout (statische Shell).
// Drei Zonen: (oben) Mandanten-Selector-SLOT + Report-Buttons,
// (mitte) Frage-Box, (unten) Antwort-Panel.
// Owns lokalen status-State, damit Report-/Frage-Klicks den AnswerPanel
// demonstrierbar durch empty -> loading -> Stub-Antwort schalten (fuer den
// Smoke-Test). Keine Live-Daten, kein LLM, keine DB — folgt SLC-183/184.
"use client";

import { useState } from "react";

import { ReportButtons, type ReportKey } from "./ReportButtons";
import { QuestionBox } from "./QuestionBox";
import { AnswerPanel, type WorkspaceStatus } from "./AnswerPanel";

const REPORT_STUBS: Record<ReportKey, string> = {
  mandanten_uebersicht: "Mandanten-Übersicht: Live-Daten folgen in SLC-183.",
  review_queue: "Meine Review-Queue: Live-Daten folgen in SLC-183.",
  wo_stockt_es: "Wo stockt es: Live-Daten folgen in SLC-183.",
  system_status: "System-Status: Live-Daten folgen in SLC-183.",
  activity_timeline: "Activity-Timeline: Live-Daten folgen in SLC-183.",
};

export function WorkspaceShell() {
  const [status, setStatus] = useState<WorkspaceStatus>("empty");
  const [answer, setAnswer] = useState<string | null>(null);

  // Stub-Ablauf: Klick -> loading -> nach kurzer Verzoegerung Stub-Antwort.
  // Ersetzt in SLC-183/184 durch echte Berichts-/RAG-Calls.
  const runStub = (stubAnswer: string) => {
    setAnswer(null);
    setStatus("loading");
    setTimeout(() => {
      setAnswer(stubAnswer);
      setStatus("empty");
    }, 600);
  };

  const handleSelectReport = (reportKey: ReportKey) => {
    runStub(REPORT_STUBS[reportKey]);
  };

  const handleSubmitQuestion = (question: string) => {
    runStub(
      `Frage erhalten: „${question}“\n\nDie KI-gestützte Antwort folgt in SLC-184.`,
    );
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

      {/* Bottom-Zone: Antwort-Panel */}
      <AnswerPanel status={status} answer={answer} />
    </div>
  );
}
