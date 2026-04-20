"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Pencil,
  Save,
  Send,
  Stethoscope,
} from "lucide-react";
import type { DiagnosisContent } from "@/workers/diagnosis/types";
import { updateDiagnosisContent, type DiagnosisRow } from "./diagnosis-actions";
import { DiagnosisGenerateButton } from "./DiagnosisGenerateButton";
import { DiagnosisConfirmButton } from "./DiagnosisConfirmButton";
import { DiagnosisExportButton } from "./DiagnosisExportButton";

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

// --- Ampel/Score constants ---

const AMPEL_OPTIONS = [
  { value: "green", label: "Grün", class: "bg-green-100 text-green-800 border-green-300" },
  { value: "yellow", label: "Gelb", class: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "red", label: "Rot", class: "bg-red-100 text-red-800 border-red-300" },
];

const RELEVANZ_OPTIONS = [
  { value: "high", label: "Hoch" },
  { value: "medium", label: "Mittel" },
  { value: "low", label: "Niedrig" },
];

const AUFWAND_OPTIONS = [
  { value: "S", label: "Klein (S)" },
  { value: "M", label: "Mittel (M)" },
  { value: "L", label: "Groß (L)" },
];

const KU_TYPE_LABELS: Record<string, string> = {
  finding: "Erkenntnis",
  risk: "Risiko",
  action: "Maßnahme",
  observation: "Beobachtung",
  ai_draft: "KI-Entwurf",
};

// --- Main Component ---

interface DiagnosisWorkspaceProps {
  sessionId: string;
  blockKey: string;
  checkpointId: string;
  diagnosis: DiagnosisRow | null;
  answersBySubtopic: Record<string, AnswerData[]>;
  allAnswers: AnswerData[];
  knowledgeUnits: KnowledgeUnitData[];
  evidenceFiles: EvidenceFileData[];
  subtopicLabels: Record<string, string>;
  onDiagnosisGenerated: (d: DiagnosisRow) => void;
  onDiagnosisConfirmed: () => void;
}

export function DiagnosisWorkspace({
  sessionId,
  blockKey,
  checkpointId,
  diagnosis,
  answersBySubtopic,
  allAnswers,
  knowledgeUnits,
  evidenceFiles,
  subtopicLabels,
  onDiagnosisGenerated,
  onDiagnosisConfirmed,
}: DiagnosisWorkspaceProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [draft, setDraft] = useState<DiagnosisContent | null>(
    diagnosis?.content ? structuredClone(diagnosis.content) : null
  );
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string }>
  >([]);
  const [chatInput, setChatInput] = useState("");

  const subtopics = draft?.subtopics ?? [];
  const activeSubtopic = subtopics[activeIndex] ?? null;
  const subtopicKey = activeSubtopic?.key ?? "";

  // Answers for active subtopic
  const activeAnswers = answersBySubtopic[subtopicKey] ?? [];
  // If no grouped answers, show all for context
  const displayAnswers = activeAnswers.length > 0 ? activeAnswers : allAnswers;

  // When diagnosis is generated, update draft
  function handleDiagnosisGenerated(d: DiagnosisRow) {
    setDraft(structuredClone(d.content));
    setActiveIndex(0);
    onDiagnosisGenerated(d);
  }

  function updateField(fieldKey: string, value: string | number | null) {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.subtopics[activeIndex].fields[fieldKey] = value;
      return next;
    });
  }

  async function handleSave() {
    if (!draft || !diagnosis) return;
    setSaveError(null);
    startSaveTransition(async () => {
      const result = await updateDiagnosisContent(diagnosis.id, draft);
      if (!result.success) {
        setSaveError(result.error ?? "Speichern fehlgeschlagen");
        return;
      }
      setSaveError(null);
    });
  }

  function handleNext() {
    if (activeIndex < subtopics.length - 1) {
      setActiveIndex(activeIndex + 1);
    }
  }

  function handlePrev() {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  }

  // Chat: local-only for now (Phase 2: KI endpoint)
  function sendChatMessage() {
    if (!chatInput.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: chatInput.trim() },
      {
        role: "assistant",
        text: "Chat-Integration kommt in Phase 2. Felder können direkt oben bearbeitet werden.",
      },
    ]);
    setChatInput("");
  }

  // --- No diagnosis yet ---
  if (!diagnosis || !draft) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Diagnose</h3>
        </div>
        <p className="text-sm text-slate-500">
          Noch keine Diagnose vorhanden. Generieren Sie die Diagnose, um den
          Review-Workspace zu starten.
        </p>
        <DiagnosisGenerateButton
          sessionId={sessionId}
          blockKey={blockKey}
          checkpointId={checkpointId}
          hasExisting={false}
          onDiagnosisGenerated={handleDiagnosisGenerated}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Diagnose Review</h3>
          <span className="text-xs text-slate-500">
            {activeIndex + 1} / {subtopics.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DiagnosisExportButton content={draft} blockKey={blockKey} />
          <DiagnosisConfirmButton
            diagnosisId={diagnosis.id}
            isConfirmed={diagnosis.status === "confirmed"}
            onConfirmed={onDiagnosisConfirmed}
          />
        </div>
      </div>

      {/* Subtopic Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {subtopics.map((st, idx) => (
          <button
            key={st.key}
            onClick={() => setActiveIndex(idx)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              idx === activeIndex
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            {st.name}
          </button>
        ))}
      </div>

      {/* Split View: Fields+Chat (2/3) | Source Data (1/3) */}
      {activeSubtopic && (
        <div
          className="grid grid-cols-1 xl:grid-cols-3 gap-3"
          style={{ minHeight: "calc(100vh - 340px)" }}
        >
          {/* LEFT: Fields + Chat */}
          <div className="xl:col-span-2 flex flex-col gap-3">
            {/* Subtopic Fields */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex-1 flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
                  {activeSubtopic.name}
                </h4>
              </div>

              {/* Scrollable field area */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {/* Ampel */}
                <FieldRow label="Ampel">
                  <div className="flex gap-1">
                    {AMPEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateField("ampel", opt.value)}
                        className={`rounded-full border px-3 py-0.5 text-xs font-bold transition-all ${
                          String(activeSubtopic.fields.ampel) === opt.value
                            ? opt.class + " ring-2 ring-offset-1 ring-blue-400"
                            : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FieldRow>

                {/* Numeric scores */}
                <div className="grid grid-cols-3 gap-3">
                  <NumberField label="Reifegrad" value={activeSubtopic.fields.reifegrad} min={0} max={10} onChange={(v) => updateField("reifegrad", v)} />
                  <NumberField label="Risiko" value={activeSubtopic.fields.risiko} min={0} max={10} onChange={(v) => updateField("risiko", v)} />
                  <NumberField label="Hebel" value={activeSubtopic.fields.hebel} min={0} max={10} onChange={(v) => updateField("hebel", v)} />
                </div>

                {/* Selects */}
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="90-Tage-Relevanz">
                    <select value={String(activeSubtopic.fields.relevanz_90d ?? "")} onChange={(e) => updateField("relevanz_90d", e.target.value || null)} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700">
                      <option value="">—</option>
                      {RELEVANZ_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Aufwand">
                    <select value={String(activeSubtopic.fields.aufwand ?? "")} onChange={(e) => updateField("aufwand", e.target.value || null)} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700">
                      <option value="">—</option>
                      {AUFWAND_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </FieldRow>
                </div>

                {/* Text fields */}
                <TextField label="Ist-Situation" value={activeSubtopic.fields.ist_situation} onChange={(v) => updateField("ist_situation", v)} />
                <TextField label="Empfehlung / Maßnahme" value={activeSubtopic.fields.empfehlung} onChange={(v) => updateField("empfehlung", v)} />
                <TextField label="Nächster Schritt" value={activeSubtopic.fields.naechster_schritt} onChange={(v) => updateField("naechster_schritt", v)} />
                <TextField label="Belege / Zitate" value={activeSubtopic.fields.belege} onChange={(v) => updateField("belege", v)} />
                <TextField label="Owner (Intern)" value={activeSubtopic.fields.owner} onChange={(v) => updateField("owner", v)} />
                <TextField label="Abhängigkeiten / Blocker" value={activeSubtopic.fields.abhaengigkeiten} onChange={(v) => updateField("abhaengigkeiten", v)} />
                <TextField label="Zielbild (DOD)" value={activeSubtopic.fields.zielbild} onChange={(v) => updateField("zielbild", v)} />
              </div>

              {/* Action bar */}
              <div className="px-6 py-3 border-t-2 border-slate-100 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeIndex > 0 && (
                      <button onClick={handlePrev} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        ← Zurück
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {saveError && (
                      <span className="text-xs text-red-600">{saveError}</span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {isSaving ? "Speichert…" : "Speichern"}
                    </button>
                    {activeIndex < subtopics.length - 1 ? (
                      <button
                        onClick={handleNext}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-primary-dark transition-all"
                      >
                        Weiter
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-green-700 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Abschließen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Section */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/50">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <MessageSquareText className="h-3.5 w-3.5 text-slate-600" />
                  KI-Assistent
                  <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">(Phase 2)</span>
                </h4>
              </div>

              {/* Messages */}
              {chatMessages.length > 0 && (
                <div className="px-5 py-3 space-y-2 max-h-[200px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-brand-primary text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-700 rounded-bl-sm"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-end gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Frage zum Subtopic stellen..."
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim()}
                  className="p-2.5 rounded-lg bg-brand-primary text-white disabled:opacity-50 hover:bg-brand-primary-dark transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Source Data for active subtopic */}
          <div className="xl:col-span-1 bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Quelldaten — {activeSubtopic.name}
              </h3>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {displayAnswers.length} Antworten · {knowledgeUnits.length} KUs
              </p>
            </div>

            {/* Scrollable source data */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Answers */}
              {displayAnswers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <MessageSquareText className="h-3 w-3" />
                    Antworten
                  </h4>
                  {displayAnswers.map((a) => (
                    <div key={a.questionId} className="rounded-md bg-slate-50 p-2.5 space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500">{a.questionId}</p>
                      <p className="text-xs font-medium text-slate-700 leading-relaxed">{a.questionText}</p>
                      {a.answer ? (
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-slate-300 pl-2 mt-1">
                          {a.answer}
                        </p>
                      ) : (
                        <p className="text-[10px] italic text-slate-400 mt-1">Nicht beantwortet</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Knowledge Units */}
              {knowledgeUnits.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <Stethoscope className="h-3 w-3" />
                    Knowledge Units
                  </h4>
                  {knowledgeUnits.map((ku) => (
                    <KuCard key={ku.id} data={ku} />
                  ))}
                </div>
              )}

              {/* Empty */}
              {displayAnswers.length === 0 && knowledgeUnits.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  Keine Quelldaten für diesen Bereich
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function KuCard({ data }: { data: KnowledgeUnitData }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md bg-slate-50 p-2.5">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">{data.title}</span>
          <span className="text-[10px] text-slate-500 flex-shrink-0">
            {KU_TYPE_LABELS[data.unit_type] ?? data.unit_type}
          </span>
        </div>
      </button>
      {expanded && (
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap border-l-2 border-slate-300 pl-2 mt-1.5">
          {data.body}
        </p>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: {
  label: string;
  value: string | number | null | undefined;
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  const numVal = value !== null && value !== undefined && value !== "" ? Number(value) : null;
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={numVal ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(null); }
          else { const n = parseInt(raw, 10); if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n))); }
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
      />
    </div>
  );
}

function TextField({ label, value, onChange }: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <textarea
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 resize-y"
        placeholder={`${label}…`}
      />
    </div>
  );
}
