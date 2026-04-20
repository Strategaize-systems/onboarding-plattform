"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MessageSquareText,
  Lightbulb,
  Paperclip,
} from "lucide-react";

// --- Types ---

interface AnswerData {
  questionId: string;
  questionText: string;
  answer: string;
}

interface KnowledgeUnitData {
  id: string;
  title: string;
  body: string;
  unit_type: string;
  confidence: string;
  status: string;
}

interface EvidenceFileData {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  extraction_status: string;
}

interface SourceDataSidebarProps {
  /** Answers grouped by subtopic key */
  answersBySubtopic: Record<string, AnswerData[]>;
  /** All answers for the block (ungrouped fallback) */
  allAnswers: AnswerData[];
  /** Knowledge Units for this block */
  knowledgeUnits: KnowledgeUnitData[];
  /** Evidence files for this session/block */
  evidenceFiles: EvidenceFileData[];
  /** Subtopic labels for headers */
  subtopicLabels: Record<string, string>;
}

export function SourceDataSidebar({
  answersBySubtopic,
  allAnswers,
  knowledgeUnits,
  evidenceFiles,
  subtopicLabels,
}: SourceDataSidebarProps) {
  const hasGroupedAnswers = Object.keys(answersBySubtopic).length > 0;

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-white" />
          </div>
          Quelldaten
        </h3>
        <p className="mt-1 text-[10px] text-slate-500">
          Rohdaten zur Überprüfung der Diagnose
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Section 1: Answers grouped by subtopic */}
        {hasGroupedAnswers ? (
          Object.entries(answersBySubtopic).map(([subtopicKey, answers]) => (
            <AccordionSection
              key={subtopicKey}
              icon={<MessageSquareText className="h-3.5 w-3.5" />}
              title={subtopicLabels[subtopicKey] ?? subtopicKey}
              badge={`${answers.length}`}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {answers.map((a) => (
                  <AnswerCard key={a.questionId} data={a} />
                ))}
              </div>
            </AccordionSection>
          ))
        ) : allAnswers.length > 0 ? (
          <AccordionSection
            icon={<MessageSquareText className="h-3.5 w-3.5" />}
            title="Antworten"
            badge={`${allAnswers.length}`}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {allAnswers.map((a) => (
                <AnswerCard key={a.questionId} data={a} />
              ))}
            </div>
          </AccordionSection>
        ) : null}

        {/* Section 2: Knowledge Units */}
        {knowledgeUnits.length > 0 && (
          <AccordionSection
            icon={<Lightbulb className="h-3.5 w-3.5" />}
            title="Knowledge Units"
            badge={`${knowledgeUnits.length}`}
            defaultOpen={false}
          >
            <div className="space-y-2">
              {knowledgeUnits.map((ku) => (
                <KnowledgeUnitCard key={ku.id} data={ku} />
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Section 3: Evidence Files */}
        {evidenceFiles.length > 0 && (
          <AccordionSection
            icon={<Paperclip className="h-3.5 w-3.5" />}
            title="Evidence-Dateien"
            badge={`${evidenceFiles.length}`}
            defaultOpen={false}
          >
            <div className="space-y-1.5">
              {evidenceFiles.map((ef) => (
                <EvidenceCard key={ef.id} data={ef} />
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Empty state */}
        {allAnswers.length === 0 &&
          knowledgeUnits.length === 0 &&
          evidenceFiles.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">
              Keine Quelldaten verfügbar
            </div>
          )}
      </div>
    </div>
  );
}

// --- Accordion ---

function AccordionSection({
  icon,
  title,
  badge,
  defaultOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-slate-500">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="text-slate-600">{icon}</span>
        <span className="text-xs font-bold text-slate-700 flex-1 truncate">
          {title}
        </span>
        {badge && (
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-200 rounded-full px-1.5 py-0.5">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="p-2 border-t border-slate-100">{children}</div>}
    </div>
  );
}

// --- Cards ---

function AnswerCard({ data }: { data: AnswerData }) {
  return (
    <div className="rounded-md bg-slate-50 p-2.5 space-y-1">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
        {data.questionId}
      </p>
      <p className="text-xs font-medium text-slate-700 leading-relaxed">
        {data.questionText}
      </p>
      {data.answer ? (
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-slate-300 pl-2 mt-1">
          {data.answer}
        </p>
      ) : (
        <p className="text-[10px] italic text-slate-400 mt-1">
          Nicht beantwortet
        </p>
      )}
    </div>
  );
}

const KU_TYPE_LABELS: Record<string, string> = {
  finding: "Erkenntnis",
  risk: "Risiko",
  action: "Maßnahme",
  observation: "Beobachtung",
  ai_draft: "KI-Entwurf",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "text-green-700 bg-green-50",
  medium: "text-amber-700 bg-amber-50",
  low: "text-red-700 bg-red-50",
};

function KnowledgeUnitCard({ data }: { data: KnowledgeUnitData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md bg-slate-50 p-2.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-slate-700 text-left hover:text-slate-900 transition-colors flex-1"
        >
          {data.title}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-slate-500">
            {KU_TYPE_LABELS[data.unit_type] ?? data.unit_type}
          </span>
          <span
            className={`text-[10px] font-semibold rounded px-1 ${
              CONFIDENCE_STYLES[data.confidence] ?? "text-slate-500 bg-slate-100"
            }`}
          >
            {data.confidence}
          </span>
        </div>
      </div>
      {expanded && (
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-slate-300 pl-2">
          {data.body}
        </p>
      )}
    </div>
  );
}

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/zip": "ZIP",
};

function EvidenceCard({ data }: { data: EvidenceFileData }) {
  const sizeKb = (data.file_size_bytes / 1024).toFixed(0);
  const typeLabel = MIME_LABELS[data.mime_type] ?? data.mime_type;

  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2">
      <Paperclip className="h-3 w-3 text-slate-400 flex-shrink-0" />
      <span className="text-xs text-slate-700 truncate flex-1">
        {data.original_filename}
      </span>
      <span className="text-[10px] text-slate-500">{typeLabel}</span>
      <span className="text-[10px] text-slate-400">{sizeKb} KB</span>
    </div>
  );
}
