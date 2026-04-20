"use client";

import { useState } from "react";
import { Pencil, Save } from "lucide-react";
import type { DiagnosisContent } from "@/workers/diagnosis/types";

interface DiagnosisEditorProps {
  content: DiagnosisContent;
  onSave: (content: DiagnosisContent) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

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

export function DiagnosisEditor({
  content,
  onSave,
  onCancel,
  isSaving,
}: DiagnosisEditorProps) {
  const [draft, setDraft] = useState<DiagnosisContent>(
    structuredClone(content)
  );

  function updateField(
    subtopicIndex: number,
    fieldKey: string,
    value: string | number | null
  ) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      next.subtopics[subtopicIndex].fields[fieldKey] = value;
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

      {/* Subtopic editors */}
      {draft.subtopics.map((subtopic, stIdx) => (
        <div
          key={subtopic.key}
          className="rounded-lg border border-blue-100 bg-white p-4 space-y-3"
        >
          <h4 className="text-sm font-bold text-slate-900">{subtopic.name}</h4>

          {/* Ampel — 3-button toggle */}
          <FieldRow label="Ampel">
            <div className="flex gap-1">
              {AMPEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateField(stIdx, "ampel", opt.value)}
                  className={`rounded-full border px-3 py-0.5 text-xs font-bold transition-all ${
                    String(subtopic.fields.ampel) === opt.value
                      ? opt.class + " ring-2 ring-offset-1 ring-blue-400"
                      : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Number fields: Reifegrad, Risiko, Hebel */}
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Reifegrad"
              value={subtopic.fields.reifegrad}
              min={0}
              max={10}
              onChange={(v) => updateField(stIdx, "reifegrad", v)}
            />
            <NumberField
              label="Risiko"
              value={subtopic.fields.risiko}
              min={0}
              max={10}
              onChange={(v) => updateField(stIdx, "risiko", v)}
            />
            <NumberField
              label="Hebel"
              value={subtopic.fields.hebel}
              min={0}
              max={10}
              onChange={(v) => updateField(stIdx, "hebel", v)}
            />
          </div>

          {/* Relevanz 90d — select */}
          <FieldRow label="90-Tage-Relevanz">
            <select
              value={String(subtopic.fields.relevanz_90d ?? "")}
              onChange={(e) =>
                updateField(stIdx, "relevanz_90d", e.target.value || null)
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
            >
              <option value="">—</option>
              {RELEVANZ_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Aufwand — select */}
          <FieldRow label="Aufwand">
            <select
              value={String(subtopic.fields.aufwand ?? "")}
              onChange={(e) =>
                updateField(stIdx, "aufwand", e.target.value || null)
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
            >
              <option value="">—</option>
              {AUFWAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Text fields */}
          <TextField
            label="Ist-Situation"
            value={subtopic.fields.ist_situation}
            onChange={(v) => updateField(stIdx, "ist_situation", v)}
          />
          <TextField
            label="Empfehlung / Maßnahme"
            value={subtopic.fields.empfehlung}
            onChange={(v) => updateField(stIdx, "empfehlung", v)}
          />
          <TextField
            label="Nächster Schritt"
            value={subtopic.fields.naechster_schritt}
            onChange={(v) => updateField(stIdx, "naechster_schritt", v)}
          />
          <TextField
            label="Belege / Zitate"
            value={subtopic.fields.belege}
            onChange={(v) => updateField(stIdx, "belege", v)}
          />
          <TextField
            label="Owner (Intern)"
            value={subtopic.fields.owner}
            onChange={(v) => updateField(stIdx, "owner", v)}
          />
          <TextField
            label="Abhängigkeiten / Blocker"
            value={subtopic.fields.abhaengigkeiten}
            onChange={(v) => updateField(stIdx, "abhaengigkeiten", v)}
          />
          <TextField
            label="Zielbild (DOD)"
            value={subtopic.fields.zielbild}
            onChange={(v) => updateField(stIdx, "zielbild", v)}
          />
        </div>
      ))}
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-semibold text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string | number | null | undefined;
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  const numVal =
    value !== null && value !== undefined && value !== ""
      ? Number(value)
      : null;

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        value={numVal ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
          } else {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          }
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        {label}
      </label>
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
