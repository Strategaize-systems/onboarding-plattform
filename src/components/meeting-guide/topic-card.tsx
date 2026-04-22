"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, Plus, X } from "lucide-react";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

interface Props {
  topic: MeetingGuideTopic;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  templateBlocks: Array<{ key: string; title: string }>;
  onUpdate: (topic: MeetingGuideTopic) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function TopicCard({
  topic,
  index,
  isFirst,
  isLast,
  templateBlocks,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
  const t = useTranslations("meetingGuide");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateField<K extends keyof MeetingGuideTopic>(
    field: K,
    value: MeetingGuideTopic[K]
  ) {
    onUpdate({ ...topic, [field]: value });
  }

  function handleQuestionChange(qIndex: number, value: string) {
    const next = [...topic.questions];
    next[qIndex] = value;
    onUpdate({ ...topic, questions: next });
  }

  function handleAddQuestion() {
    onUpdate({ ...topic, questions: [...topic.questions, ""] });
  }

  function handleRemoveQuestion(qIndex: number) {
    const next = topic.questions.filter((_, i) => i !== qIndex);
    onUpdate({ ...topic, questions: next.length > 0 ? next : [""] });
  }

  const blockLabel = topic.block_key
    ? templateBlocks.find((b) => b.key === topic.block_key)?.title ?? topic.block_key
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:border-slate-300 print:shadow-none">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
            {index + 1}
          </span>
          <Input
            value={topic.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder={t("topicTitlePlaceholder")}
            className="h-8 border-0 bg-transparent px-1 text-base font-semibold text-slate-900 shadow-none focus-visible:ring-1 print:p-0"
          />
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
              >
                {t("confirmDelete")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-red-500"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      <Textarea
        value={topic.description}
        onChange={(e) => updateField("description", e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        className="mb-3 text-sm print:border-0 print:p-0"
        rows={2}
      />

      {/* Questions */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("questions")}
        </label>
        <div className="space-y-2">
          {topic.questions.map((q, qIdx) => (
            <div key={qIdx} className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{qIdx + 1}.</span>
              <Input
                value={q}
                onChange={(e) => handleQuestionChange(qIdx, e.target.value)}
                placeholder={t("questionPlaceholder")}
                className="h-8 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-500 print:hidden"
                onClick={() => handleRemoveQuestion(qIdx)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-7 text-xs text-slate-500 print:hidden"
          onClick={handleAddQuestion}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addQuestion")}
        </Button>
      </div>

      {/* Block assignment */}
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <label className="text-xs font-medium text-slate-500">
          {t("blockAssignment")}:
        </label>
        <div className="print:hidden">
          <Select
            value={topic.block_key ?? "none"}
            onValueChange={(v) => updateField("block_key", v === "none" ? null : v)}
          >
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue placeholder={t("selectBlock")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("noBlock")}</SelectItem>
              {templateBlocks.map((block) => (
                <SelectItem key={block.key} value={block.key}>
                  {block.key} — {block.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Print: show badge instead of dropdown */}
        {blockLabel && (
          <Badge variant="secondary" className="hidden text-xs print:inline-flex">
            {topic.block_key} — {blockLabel}
          </Badge>
        )}
      </div>
    </div>
  );
}
