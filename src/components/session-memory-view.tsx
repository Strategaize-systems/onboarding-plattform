"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface MemoryData {
  text: string;
  version: number;
  updatedAt: string;
}

export function SessionMemoryView({ sessionId }: { sessionId: string }) {
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function loadMemory() {
      try {
        const res = await fetch(`/api/capture/${sessionId}/memory`);
        if (res.ok) {
          const data = await res.json();
          setMemory(data.memory);
        }
      } finally {
        setLoading(false);
      }
    }
    loadMemory();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200/60 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Was die KI sich gemerkt hat</span>
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
        <span className="flex-1 text-sm font-semibold text-slate-700">Was die KI sich gemerkt hat</span>
        {memory && (
          <span className="text-[10px] text-slate-400 mr-1">
            v{memory.version}
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
                Zuletzt aktualisiert:{" "}
                {new Date(memory.updatedAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400 italic">
              Noch keine Informationen gesammelt. Das Memory wird nach den ersten Chat-Nachrichten automatisch aufgebaut.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
