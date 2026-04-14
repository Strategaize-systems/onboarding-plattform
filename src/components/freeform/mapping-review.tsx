"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Pencil, Check, X, Loader2 } from "lucide-react";

interface MappingItem {
  questionId: string;
  questionText: string;
  block: string;
  draftText: string;
  confidence: "high" | "medium" | "low";
  hasExistingAnswer: boolean;
}

interface UnmappedQuestion {
  questionId: string;
  questionText: string;
  block: string;
}

interface DraftState {
  selected: boolean;
  editing: boolean;
  editedText: string;
}

interface MappingReviewProps {
  mappings: MappingItem[];
  unmappedQuestions: UnmappedQuestion[];
  onAccept: (drafts: { questionId: string; text: string }[]) => void;
  onBack: () => void;
  accepting: boolean;
}

const CONFIDENCE_STYLES = {
  high: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

export function MappingReview({
  mappings,
  unmappedQuestions,
  onAccept,
  onBack,
  accepting,
}: MappingReviewProps) {
  const t = useTranslations("freeform.review");
  const tBlocks = useTranslations("blocks");

  // Initialize draft states: high/medium = selected, low = unselected
  const [draftStates, setDraftStates] = useState<Map<string, DraftState>>(() => {
    const states = new Map<string, DraftState>();
    mappings.forEach((m) => {
      states.set(m.questionId, {
        selected: m.confidence !== "low",
        editing: false,
        editedText: m.draftText,
      });
    });
    return states;
  });

  const [unmappedOpen, setUnmappedOpen] = useState(false);

  function updateDraft(questionId: string, update: Partial<DraftState>) {
    setDraftStates((prev) => {
      const next = new Map(prev);
      const current = next.get(questionId);
      if (current) {
        next.set(questionId, { ...current, ...update });
      }
      return next;
    });
  }

  function selectAll() {
    setDraftStates((prev) => {
      const next = new Map(prev);
      next.forEach((state, key) => {
        next.set(key, { ...state, selected: true });
      });
      return next;
    });
  }

  function selectNone() {
    setDraftStates((prev) => {
      const next = new Map(prev);
      next.forEach((state, key) => {
        next.set(key, { ...state, selected: false });
      });
      return next;
    });
  }

  function handleAccept() {
    const selectedDrafts = mappings
      .filter((m) => draftStates.get(m.questionId)?.selected)
      .map((m) => {
        const state = draftStates.get(m.questionId)!;
        return {
          questionId: m.questionId,
          text: state.editedText,
        };
      });
    onAccept(selectedDrafts);
  }

  const selectedCount = [...draftStates.values()].filter((s) => s.selected).length;
  const totalCount = mappings.length;

  // Group by block
  const blocks = Array.from(new Set(mappings.map((m) => m.block))).sort();

  return (
    <div className="mx-auto max-w-4xl py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("title")}</h2>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {/* Empty state: no mappings found */}
      {mappings.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500 mb-6">{t("noMappings")}</p>
          <Button variant="outline" onClick={onBack}>
            {t("backToOverview")}
          </Button>
        </div>
      )}

      {/* Select controls + Drafts + Footer (only when mappings exist) */}
      {mappings.length > 0 && (<>
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm font-semibold text-slate-700">
          {t("acceptCount", { count: selectedCount, total: totalCount })}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {t("selectAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone}>
            {t("selectNone")}
          </Button>
        </div>
      </div>

      {/* Drafts grouped by block */}
      <div className="space-y-6 mb-8">
        {blocks.map((block) => {
          const blockMappings = mappings.filter((m) => m.block === block);
          return (
            <div key={block}>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
                Block {block}: {tBlocks(block)}
              </h3>
              <div className="space-y-3">
                {blockMappings.map((mapping) => {
                  const state = draftStates.get(mapping.questionId);
                  if (!state) return null;

                  return (
                    <Card
                      key={mapping.questionId}
                      className={`transition-all ${
                        state.selected
                          ? "border-brand-primary/30 bg-white shadow-sm"
                          : "border-slate-200 bg-slate-50/50 opacity-60"
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Top: checkbox + question + confidence */}
                        <div className="flex items-start gap-3 mb-3">
                          <Checkbox
                            checked={state.selected}
                            onCheckedChange={(checked) =>
                              updateDraft(mapping.questionId, { selected: !!checked })
                            }
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 leading-snug">
                              {mapping.questionText}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-bold ${CONFIDENCE_STYLES[mapping.confidence]}`}
                              >
                                {t(`confidence.${mapping.confidence}`)}
                              </Badge>
                              {mapping.hasExistingAnswer && (
                                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                  {t("supplement")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Draft text or editor */}
                        {state.editing ? (
                          <div className="ml-8 space-y-2">
                            <Textarea
                              value={state.editedText}
                              onChange={(e) =>
                                updateDraft(mapping.questionId, { editedText: e.target.value })
                              }
                              rows={4}
                              className="text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => updateDraft(mapping.questionId, { editing: false })}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                {t("save")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updateDraft(mapping.questionId, {
                                    editing: false,
                                    editedText: mapping.draftText,
                                  })
                                }
                              >
                                <X className="mr-1 h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="ml-8">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                              {state.editedText}
                            </p>
                            {state.selected && (
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs text-slate-500"
                                  onClick={() =>
                                    updateDraft(mapping.questionId, { editing: true })
                                  }
                                >
                                  <Pencil className="mr-1 h-3 w-3" />
                                  {t("edit")}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unmapped questions (collapsible) */}
      {unmappedQuestions.length > 0 && (
        <Collapsible open={unmappedOpen} onOpenChange={setUnmappedOpen} className="mb-8">
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${unmappedOpen ? "rotate-0" : "-rotate-90"}`}
            />
            {t("unmapped")} ({unmappedQuestions.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <p className="text-xs text-slate-500 mb-3 px-1">{t("unmappedDescription")}</p>
            <div className="space-y-2">
              {unmappedQuestions.map((q) => (
                <div
                  key={q.questionId}
                  className="rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-500"
                >
                  <span className="font-medium text-slate-400 mr-2">Block {q.block}</span>
                  {q.questionText}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Footer: Accept button */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 -mx-4 px-4 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">
          {t("acceptCount", { count: selectedCount, total: totalCount })}
        </span>
        <Button
          onClick={handleAccept}
          disabled={selectedCount === 0 || accepting}
          className="bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-md hover:shadow-lg transition-all font-bold px-6"
        >
          {accepting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("accept")}
            </>
          ) : (
            t("accept")
          )}
        </Button>
      </div>
      </>)}
    </div>
  );
}
