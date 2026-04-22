"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

interface Props {
  topics: MeetingGuideTopic[];
  goal: string | null;
}

export function MeetingGuideSidebar({ topics, goal }: Props) {
  const t = useTranslations("dialogue");
  const [discussed, setDiscussed] = useState<Set<string>>(new Set());

  const toggleDiscussed = (key: string) => {
    setDiscussed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortedTopics = [...topics].sort((a, b) => a.order - b.order);

  return (
    <div className="w-80 border-l bg-white flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm text-slate-900">
          {t("meetingGuide")}
        </h3>
        {goal && (
          <p className="text-xs text-slate-500 mt-1">{goal}</p>
        )}
        <div className="mt-2 text-xs text-slate-400">
          {discussed.size}/{topics.length} {t("discussed")}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {sortedTopics.map((topic, idx) => (
            <div
              key={topic.key}
              className={`rounded-md border p-3 transition-colors ${
                discussed.has(topic.key) ? "bg-green-50 border-green-200" : "bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={discussed.has(topic.key)}
                  onCheckedChange={() => toggleDiscussed(topic.key)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {idx + 1}
                    </Badge>
                    <span className={`text-sm font-medium ${
                      discussed.has(topic.key) ? "text-green-700 line-through" : "text-slate-900"
                    }`}>
                      {topic.title}
                    </span>
                  </div>
                  {topic.questions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {topic.questions.map((q, qi) => (
                        <li key={qi} className="text-xs text-slate-500 pl-1">
                          &bull; {q}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
          {topics.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">
              {t("noGuideTopics")}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
