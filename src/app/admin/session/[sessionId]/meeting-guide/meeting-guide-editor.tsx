"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TopicList } from "@/components/meeting-guide/topic-list";
import { AiSuggestions } from "@/components/meeting-guide/ai-suggestions";
import {
  createMeetingGuide,
  updateMeetingGuide,
} from "@/app/actions/meeting-guide-actions";
import type {
  MeetingGuide,
  MeetingGuideTopic,
} from "@/types/meeting-guide";
import { Save, Printer, FileText } from "lucide-react";

interface Props {
  sessionId: string;
  templateBlocks: Array<{ key: string; title: string }>;
  initialGuide: MeetingGuide | null;
}

export function MeetingGuideEditor({
  sessionId,
  templateBlocks,
  initialGuide,
}: Props) {
  const t = useTranslations("meetingGuide");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [guideId, setGuideId] = useState<string | null>(initialGuide?.id ?? null);
  const [goal, setGoal] = useState(initialGuide?.goal ?? "");
  const [contextNotes, setContextNotes] = useState(initialGuide?.context_notes ?? "");
  const [topics, setTopics] = useState<MeetingGuideTopic[]>(initialGuide?.topics ?? []);
  const [aiUsed, setAiUsed] = useState(initialGuide?.ai_suggestions_used ?? false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function handleAddTopic() {
    const newTopic: MeetingGuideTopic = {
      key: `topic-${Date.now()}`,
      title: "",
      description: "",
      questions: [""],
      block_key: null,
      order: topics.length + 1,
    };
    setTopics([...topics, newTopic]);
  }

  function handleUpdateTopic(index: number, updated: MeetingGuideTopic) {
    const next = [...topics];
    next[index] = updated;
    setTopics(next);
  }

  function handleDeleteTopic(index: number) {
    const next = topics.filter((_, i) => i !== index);
    // Reorder
    setTopics(next.map((t, i) => ({ ...t, order: i + 1 })));
  }

  function handleMoveTopic(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === topics.length - 1) return;

    const next = [...topics];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setTopics(next.map((t, i) => ({ ...t, order: i + 1 })));
  }

  function handleAcceptSuggestions(suggested: MeetingGuideTopic[]) {
    const startOrder = topics.length + 1;
    const withOrder = suggested.map((s, i) => ({
      ...s,
      order: startOrder + i,
    }));
    setTopics([...topics, ...withOrder]);
    setAiUsed(true);
  }

  function handleSave() {
    setSaveStatus("saving");
    startTransition(async () => {
      try {
        if (guideId) {
          // Update existing
          const { error } = await updateMeetingGuide(guideId, {
            goal: goal || undefined,
            context_notes: contextNotes || undefined,
            topics,
            ai_suggestions_used: aiUsed,
          });
          if (error) {
            setSaveStatus("error");
            return;
          }
        } else {
          // Create new
          const { data, error } = await createMeetingGuide({
            capture_session_id: sessionId,
            goal: goal || undefined,
            context_notes: contextNotes || undefined,
            topics,
          });
          if (error || !data) {
            setSaveStatus("error");
            return;
          }
          setGuideId(data.id);
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
          <FileText className="h-4 w-4" />
          {t("editorTitle")}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            {t("print")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || saveStatus === "saving"}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saveStatus === "saving"
              ? tc("loading")
              : saveStatus === "saved"
                ? t("saved")
                : tc("save")}
          </Button>
        </div>
      </div>

      {/* Goal + Context */}
      <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 print:border-0 print:p-0 print:shadow-none">
        <div>
          <Label htmlFor="goal" className="text-sm font-medium text-slate-700">
            {t("goal")}
          </Label>
          <Input
            id="goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t("goalPlaceholder")}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="context" className="text-sm font-medium text-slate-700">
            {t("contextNotes")}
          </Label>
          <Textarea
            id="context"
            value={contextNotes}
            onChange={(e) => setContextNotes(e.target.value)}
            placeholder={t("contextPlaceholder")}
            className="mt-1"
            rows={2}
          />
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="print:hidden">
        <AiSuggestions
          sessionId={sessionId}
          onAccept={handleAcceptSuggestions}
        />
      </div>

      {/* Topics */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("topics")} ({topics.length})
          </h2>
          <Button variant="outline" size="sm" onClick={handleAddTopic} className="print:hidden">
            + {t("addTopic")}
          </Button>
        </div>

        <TopicList
          topics={topics}
          templateBlocks={templateBlocks}
          onUpdate={handleUpdateTopic}
          onDelete={handleDeleteTopic}
          onMove={handleMoveTopic}
        />

        {topics.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            {t("noTopics")}
          </div>
        )}
      </div>

      {/* Print Footer */}
      <div className="hidden border-t border-slate-200 pt-4 text-xs text-slate-400 print:block">
        StrategAIze Meeting-Guide — {new Date().toLocaleDateString("de-DE")}
      </div>
    </div>
  );
}
