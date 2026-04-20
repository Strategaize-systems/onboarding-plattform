"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, FileText, MessageSquare, Pencil, SkipForward, Star, Stethoscope } from "lucide-react";
import { KnowledgeUnitList } from "./KnowledgeUnitList";
import { MeetingModeBar } from "./MeetingModeBar";
import { SopGenerateButton } from "./SopGenerateButton";
import { SopView } from "./SopView";
import { SopEditor } from "./SopEditor";
import { SopExportButton } from "./SopExportButton";
import { updateSopContent, type SopRow } from "./sop-actions";
import type { SopContent } from "@/workers/sop/types";
import { DiagnosisGenerateButton } from "./DiagnosisGenerateButton";
import { DiagnosisView } from "./DiagnosisView";
import { DiagnosisEditor } from "./DiagnosisEditor";
import { DiagnosisConfirmButton } from "./DiagnosisConfirmButton";
import { DiagnosisExportButton } from "./DiagnosisExportButton";
import { updateDiagnosisContent, type DiagnosisRow } from "./diagnosis-actions";
import type { DiagnosisContent } from "@/workers/diagnosis/types";

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
  initialSop?: SopRow | null;
  initialDiagnosis?: DiagnosisRow | null;
  checkpointId?: string | null;
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
  initialSop,
  initialDiagnosis,
  checkpointId,
}: DebriefBlockClientProps) {
  const [isFinalized, setIsFinalized] = useState(initialFinalized);
  const [sop, setSop] = useState<SopRow | null>(initialSop ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Diagnosis state
  const [diagnosis, setDiagnosis] = useState<DiagnosisRow | null>(initialDiagnosis ?? null);
  const [isDiagnosisEditing, setIsDiagnosisEditing] = useState(false);
  const [isDiagnosisSaving, startDiagnosisSaveTransition] = useTransition();
  const [diagnosisSaveError, setDiagnosisSaveError] = useState<string | null>(null);

  const router = useRouter();

  const diagnosisConfirmed = diagnosis?.status === "confirmed";

  function handleSnapshotCreated(newCheckpointId: string) {
    setIsFinalized(true);
    router.refresh();
  }

  function handleSopGenerated(newSop: SopRow) {
    setSop(newSop);
  }

  function handleDiagnosisGenerated(newDiagnosis: DiagnosisRow) {
    setDiagnosis(newDiagnosis);
  }

  function handleDiagnosisConfirmed() {
    if (diagnosis) {
      setDiagnosis({ ...diagnosis, status: "confirmed" });
    }
  }

  async function handleDiagnosisSave(content: DiagnosisContent) {
    if (!diagnosis) return;
    setDiagnosisSaveError(null);
    startDiagnosisSaveTransition(async () => {
      const result = await updateDiagnosisContent(diagnosis.id, content);
      if (!result.success) {
        setDiagnosisSaveError(result.error ?? "Speichern fehlgeschlagen");
        return;
      }
      setDiagnosis({ ...diagnosis, content, updated_at: new Date().toISOString() });
      setIsDiagnosisEditing(false);
    });
  }

  async function handleSopSave(content: SopContent) {
    if (!sop) return;
    setSaveError(null);
    startSaveTransition(async () => {
      const result = await updateSopContent(sop.id, content);
      if (!result.success) {
        setSaveError(result.error ?? "Speichern fehlgeschlagen");
        return;
      }
      setSop({ ...sop, content, updated_at: new Date().toISOString() });
      setIsEditing(false);
    });
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

      {/* Diagnosis Section (before SOP, gate for SOP) */}
      {hasKnowledgeUnits && checkpointId && (
        <DiagnosisSection
          sessionId={sessionId}
          blockKey={blockKey}
          checkpointId={checkpointId}
          diagnosis={diagnosis}
          isDiagnosisEditing={isDiagnosisEditing}
          isDiagnosisSaving={isDiagnosisSaving}
          diagnosisSaveError={diagnosisSaveError}
          onDiagnosisGenerated={handleDiagnosisGenerated}
          onDiagnosisConfirmed={handleDiagnosisConfirmed}
          onEdit={() => setIsDiagnosisEditing(true)}
          onCancelEdit={() => {
            setIsDiagnosisEditing(false);
            setDiagnosisSaveError(null);
          }}
          onSave={handleDiagnosisSave}
        />
      )}

      {/* SOP Section — gated by diagnosis confirmation */}
      {isFinalized && (
        diagnosisConfirmed ? (
          <SopSection
            sessionId={sessionId}
            blockKey={blockKey}
            checkpointId={checkpointId ?? ""}
            sop={sop}
            isEditing={isEditing}
            isSaving={isSaving}
            saveError={saveError}
            onSopGenerated={handleSopGenerated}
            onEdit={() => setIsEditing(true)}
            onCancelEdit={() => {
              setIsEditing(false);
              setSaveError(null);
            }}
            onSave={handleSopSave}
          />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-800">
                Standard Operating Procedure
              </h3>
            </div>
            <p className="mt-1 text-sm text-amber-700">
              Bitte erst die Diagnose bestätigen, bevor SOPs generiert werden können.
            </p>
          </div>
        )
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

function DiagnosisSection({
  sessionId,
  blockKey,
  checkpointId,
  diagnosis,
  isDiagnosisEditing,
  isDiagnosisSaving,
  diagnosisSaveError,
  onDiagnosisGenerated,
  onDiagnosisConfirmed,
  onEdit,
  onCancelEdit,
  onSave,
}: {
  sessionId: string;
  blockKey: string;
  checkpointId: string;
  diagnosis: DiagnosisRow | null;
  isDiagnosisEditing: boolean;
  isDiagnosisSaving: boolean;
  diagnosisSaveError: string | null;
  onDiagnosisGenerated: (d: DiagnosisRow) => void;
  onDiagnosisConfirmed: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (content: DiagnosisContent) => Promise<void>;
}) {
  const statusColor: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    reviewed: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-green-100 text-green-700 border-green-200",
  };
  const statusLabel: Record<string, string> = {
    draft: "Entwurf",
    reviewed: "Überprüft",
    confirmed: "Bestätigt",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Diagnose</h3>
        </div>
        {diagnosis && (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
              statusColor[diagnosis.status] ?? statusColor.draft
            }`}
          >
            {statusLabel[diagnosis.status] ?? diagnosis.status}
          </span>
        )}
      </div>

      {/* No diagnosis yet — show generate button */}
      {!diagnosis && (
        <DiagnosisGenerateButton
          sessionId={sessionId}
          blockKey={blockKey}
          checkpointId={checkpointId}
          hasExisting={false}
          onDiagnosisGenerated={onDiagnosisGenerated}
        />
      )}

      {/* Diagnosis exists — view or edit */}
      {diagnosis && !isDiagnosisEditing && (
        <>
          <DiagnosisView content={diagnosis.content} />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {diagnosis.status !== "confirmed" && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Bearbeiten
              </button>
            )}
            <DiagnosisConfirmButton
              diagnosisId={diagnosis.id}
              isConfirmed={diagnosis.status === "confirmed"}
              onConfirmed={onDiagnosisConfirmed}
            />
            <DiagnosisExportButton
              content={diagnosis.content}
              blockKey={blockKey}
            />
            {diagnosis.status !== "confirmed" && (
              <DiagnosisGenerateButton
                sessionId={sessionId}
                blockKey={blockKey}
                checkpointId={checkpointId}
                hasExisting={true}
                onDiagnosisGenerated={onDiagnosisGenerated}
              />
            )}
          </div>
        </>
      )}

      {/* Diagnosis edit mode */}
      {diagnosis && isDiagnosisEditing && (
        <>
          <DiagnosisEditor
            content={diagnosis.content}
            onSave={onSave}
            onCancel={onCancelEdit}
            isSaving={isDiagnosisSaving}
          />
          {diagnosisSaveError && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {diagnosisSaveError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SopSection({
  sessionId,
  blockKey,
  checkpointId,
  sop,
  isEditing,
  isSaving,
  saveError,
  onSopGenerated,
  onEdit,
  onCancelEdit,
  onSave,
}: {
  sessionId: string;
  blockKey: string;
  checkpointId: string;
  sop: SopRow | null;
  isEditing: boolean;
  isSaving: boolean;
  saveError: string | null;
  onSopGenerated: (sop: SopRow) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (content: SopContent) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-bold text-slate-900">
          Standard Operating Procedure
        </h3>
      </div>

      {!sop && checkpointId && (
        <SopGenerateButton
          sessionId={sessionId}
          blockKey={blockKey}
          checkpointId={checkpointId}
          onSopGenerated={onSopGenerated}
        />
      )}

      {!sop && !checkpointId && (
        <p className="text-xs text-slate-500">
          SOP-Generierung ist erst nach Meeting-Abschluss möglich
        </p>
      )}

      {sop && !isEditing && (
        <>
          <SopView content={sop.content} />
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Bearbeiten
            </button>
            <SopExportButton content={sop.content} blockKey={blockKey} />
          </div>
        </>
      )}

      {sop && isEditing && (
        <>
          <SopEditor
            content={sop.content}
            onSave={onSave}
            onCancel={onCancelEdit}
            isSaving={isSaving}
          />
          {saveError && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </>
      )}
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
