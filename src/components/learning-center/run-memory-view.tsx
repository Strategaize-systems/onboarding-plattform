"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Brain, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface RunMemoryViewProps {
  runId: string;
}

interface MemoryData {
  text: string;
  version: number;
  updatedAt: string;
}

export function RunMemoryView({ runId }: RunMemoryViewProps) {
  const t = useTranslations("memory");
  const locale = useLocale();
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function loadMemory() {
      try {
        const res = await fetch(`/api/tenant/runs/${runId}/memory`);
        if (res.ok) {
          const data = await res.json();
          setMemory(data.memory);
        }
      } finally {
        setLoading(false);
      }
    }
    loadMemory();
  }, [runId]);

  // Don't render anything while loading or if no memory exists
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200/60 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("title")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 rounded-xl"
      >
        <Brain className="h-4 w-4 text-brand-primary shrink-0" />
        <span className="flex-1 text-sm font-semibold text-slate-700">{t("title")}</span>
        {memory && (
          <span className="text-[10px] text-slate-400 mr-1">
            {t("version", { version: memory.version })}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          {memory?.text ? (
            <>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {memory.text}
              </p>
              <p className="mt-3 text-[10px] text-slate-400">
                {t("lastUpdated", {
                  date: new Date(memory.updatedAt).toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400 italic">{t("emptyState")}</p>
          )}
        </div>
      )}
    </div>
  );
}
