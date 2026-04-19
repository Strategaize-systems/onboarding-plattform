"use client";

import { useState, useRef, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListOrdered,
  Pencil,
  Save,
  Shield,
  Target,
} from "lucide-react";
import type { SopContent, SopStep } from "@/workers/sop/types";

interface SopEditorProps {
  content: SopContent;
  onSave: (content: SopContent) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function SopEditor({
  content,
  onSave,
  onCancel,
  isSaving,
}: SopEditorProps) {
  const [draft, setDraft] = useState<SopContent>(structuredClone(content));

  function updateStep(
    index: number,
    field: keyof SopStep,
    value: string
  ) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      const step = next.steps[index];
      if (field === "action") step.action = value;
      else if (field === "responsible") step.responsible = value;
      else if (field === "timeframe") step.timeframe = value;
      else if (field === "success_criterion") step.success_criterion = value;
      return next;
    });
  }

  function updateRisk(index: number, value: string) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      next.risks[index] = value;
      return next;
    });
  }

  function updateFallback(index: number, value: string) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      next.fallbacks[index] = value;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Edit banner */}
      <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
          <Pencil className="h-4 w-4" />
          Bearbeitungsmodus
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Wird gespeichert…" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Title + Objective */}
      <div className="space-y-2">
        <InlineInput
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
          className="text-lg font-bold text-slate-900"
        />
        <InlineInput
          value={draft.objective}
          onChange={(v) => setDraft({ ...draft, objective: v })}
          className="text-sm text-slate-600"
          multiline
        />
      </div>

      {/* Prerequisites */}
      {draft.prerequisites.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5" />
            Voraussetzungen
          </h4>
          <ul className="space-y-1">
            {draft.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-1 text-sm text-slate-700">
                <span>&bull;</span>
                <InlineInput
                  value={p}
                  onChange={(v) => {
                    const next = structuredClone(draft);
                    next.prerequisites[i] = v;
                    setDraft(next);
                  }}
                  className="text-sm text-slate-700"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <ListOrdered className="h-3.5 w-3.5" />
          Schritte ({draft.steps.length})
        </h4>
        <div className="space-y-2">
          {draft.steps.map((step, i) => (
            <EditableStepCard
              key={step.number}
              step={step}
              onUpdate={(field, value) => updateStep(i, field, value)}
            />
          ))}
        </div>
      </div>

      {/* Risks */}
      {draft.risks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Risiken
          </h4>
          <ul className="space-y-1">
            {draft.risks.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-1 text-sm text-amber-800"
              >
                <span>&bull;</span>
                <InlineInput
                  value={r}
                  onChange={(v) => updateRisk(i, v)}
                  className="text-sm text-amber-800"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallbacks */}
      {draft.fallbacks.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green-600">
            <Shield className="h-3.5 w-3.5" />
            Fallback-Optionen
          </h4>
          <ul className="space-y-1">
            {draft.fallbacks.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-1 text-sm text-green-800"
              >
                <span>&bull;</span>
                <InlineInput
                  value={f}
                  onChange={(v) => updateFallback(i, v)}
                  className="text-sm text-green-800"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EditableStepCard({
  step,
  onUpdate,
}: {
  step: SopStep;
  onUpdate: (field: keyof SopStep, value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
          {step.number}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <InlineInput
            value={step.action}
            onChange={(v) => onUpdate("action", v)}
            className="text-sm font-medium text-slate-900"
            multiline
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-semibold text-slate-500">
                Verantwortlich:
              </span>
              <InlineInput
                value={step.responsible}
                onChange={(v) => onUpdate("responsible", v)}
                className="text-xs text-slate-700"
              />
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              <InlineInput
                value={step.timeframe}
                onChange={(v) => onUpdate("timeframe", v)}
                className="text-xs text-slate-700"
              />
            </div>
          </div>
          <div>
            <div className="flex items-start gap-1 text-xs">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
              <InlineInput
                value={step.success_criterion}
                onChange={(v) => onUpdate("success_criterion", v)}
                className="text-xs text-slate-600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  className = "",
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  function handleBlur() {
    setIsEditing(false);
    if (editValue !== value) {
      onChange(editValue);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      handleBlur();
    }
    if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  }

  if (isEditing) {
    const inputClasses = `w-full rounded border border-blue-300 bg-white px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400 ${className}`;

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={3}
          className={inputClasses}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={inputClasses}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setEditValue(value);
        setIsEditing(true);
      }}
      className={`cursor-pointer rounded px-1 hover:bg-blue-50 hover:outline hover:outline-1 hover:outline-blue-200 ${className}`}
      title="Klicken zum Bearbeiten"
    >
      {value || (
        <span className="italic text-slate-400">
          Leer — klicken zum Bearbeiten
        </span>
      )}
    </span>
  );
}
