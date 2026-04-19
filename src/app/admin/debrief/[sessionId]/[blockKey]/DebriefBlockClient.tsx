"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, MessageSquare, SkipForward, Star } from "lucide-react";
import { KnowledgeUnitList } from "./KnowledgeUnitList";
import { MeetingModeBar } from "./MeetingModeBar";

interface KnowledgeUnit {
  id: string;
  unit_type: string;
  source: string;
  title: string;
  body: string;
  confidence: string;
  evidence_refs: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ValidationEntry {
  id: string;
  knowledge_unit_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

interface GapQuestionStats {
  pending: number;
  answered: number;
  skipped: number;
  maxRound: number;
}

interface DebriefBlockClientProps {
  sessionId: string;
  blockKey: string;
  knowledgeUnits: KnowledgeUnit[];
  validationEntries: ValidationEntry[];
  hasKnowledgeUnits: boolean;
  isAlreadyFinalized: boolean;
  qualityReport?: Record<string, unknown> | null;
  gapQuestionStats?: GapQuestionStats;
}

export function DebriefBlockClient({
  sessionId,
  blockKey,
  knowledgeUnits,
  validationEntries,
  hasKnowledgeUnits,
  isAlreadyFinalized: initialFinalized,
  qualityReport,
  gapQuestionStats,
}: DebriefBlockClientProps) {
  const [isFinalized, setIsFinalized] = useState(initialFinalized);
  const router = useRouter();

  function handleSnapshotCreated(checkpointId: string) {
    setIsFinalized(true);
    router.refresh();
  }

  const hasBackspelling =
    gapQuestionStats &&
    (gapQuestionStats.pending > 0 ||
      gapQuestionStats.answered > 0 ||
      gapQuestionStats.skipped > 0);

  return (
    <div className="space-y-4">
      <MeetingModeBar
        sessionId={sessionId}
        blockKey={blockKey}
        hasKnowledgeUnits={hasKnowledgeUnits}
        isAlreadyFinalized={isFinalized}
        onSnapshotCreated={handleSnapshotCreated}
      />

      {/* Backspelling Status */}
      {hasBackspelling && gapQuestionStats && (
        <BackspellingStatusSection
          stats={gapQuestionStats}
          qualityReport={qualityReport}
        />
      )}

      <KnowledgeUnitList
        sessionId={sessionId}
        blockKey={blockKey}
        knowledgeUnits={knowledgeUnits}
        validationEntries={validationEntries}
      />
    </div>
  );
}

function BackspellingStatusSection({
  stats,
  qualityReport,
}: {
  stats: GapQuestionStats;
  qualityReport?: Record<string, unknown> | null;
}) {
  const total = stats.pending + stats.answered + stats.skipped;
  const overallScore = qualityReport?.overall_score as string | undefined;

  const scoreColor: Record<string, string> = {
    excellent: "text-green-700 bg-green-100 border-green-200",
    acceptable: "text-blue-700 bg-blue-100 border-blue-200",
    needs_improvement: "text-amber-700 bg-amber-100 border-amber-200",
    insufficient: "text-red-700 bg-red-100 border-red-200",
  };

  const scoreLabel: Record<string, string> = {
    excellent: "Exzellent",
    acceptable: "Akzeptabel",
    needs_improvement: "Verbesserung nötig",
    insufficient: "Unzureichend",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-bold text-slate-900">Backspelling-Status</h3>
        {stats.maxRound > 0 && (
          <span className="text-xs text-slate-500">
            ({stats.maxRound} {stats.maxRound === 1 ? "Runde" : "Runden"})
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3">
        {stats.pending > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <Clock className="h-3 w-3" />
            {stats.pending} Offen
          </div>
        )}
        {stats.answered > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            {stats.answered} Beantwortet
          </div>
        )}
        {stats.skipped > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            <SkipForward className="h-3 w-3" />
            {stats.skipped} Übersprungen
          </div>
        )}
      </div>

      {/* Quality score from orchestrator */}
      {overallScore && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <Star className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Qualitätsbewertung:</span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
              scoreColor[overallScore] ?? "text-slate-700 bg-slate-100 border-slate-200"
            }`}
          >
            {scoreLabel[overallScore] ?? overallScore}
          </span>
        </div>
      )}
    </div>
  );
}
