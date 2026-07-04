// SLC-182 MT-3 — Frage-Box (freie Frage an den Berater-Workspace).
// Text-Eingabe + Submit + Sprach-Eingabe-SLOT (deaktiviert, folgt SLC-184).
// onSubmit(question) treibt in der Shell den AnswerPanel-State.
"use client";

import { useState } from "react";
import { Mic, Send } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface QuestionBoxProps {
  onSubmit: (question: string) => void;
}

export function QuestionBox({ onSubmit }: QuestionBoxProps) {
  const [question, setQuestion] = useState("");

  const trimmed = question.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="workspace-question" className="block text-sm font-semibold text-slate-900">
        Freie Frage an deinen Workspace
      </label>
      <Textarea
        id="workspace-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="z. B. „Bei welchen Mandanten stockt gerade die Wissenserfassung?“"
        className="min-h-[96px] resize-y"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled
          title="Sprach-Eingabe folgt (SLC-184)"
          aria-label="Sprach-Eingabe folgt (SLC-184)"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-300 cursor-not-allowed"
        >
          <Mic className="h-4 w-4" />
        </button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          <Send className="h-4 w-4" />
          <span>Frage stellen</span>
        </Button>
      </div>
    </div>
  );
}
