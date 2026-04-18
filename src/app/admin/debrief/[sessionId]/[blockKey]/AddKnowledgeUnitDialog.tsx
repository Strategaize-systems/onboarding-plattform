"use client";

import { useState, useTransition } from "react";
import { addKnowledgeUnit } from "./actions";

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

interface AddKnowledgeUnitDialogProps {
  sessionId: string;
  blockKey: string;
  onAdded: (ku: KnowledgeUnit) => void;
  onClose: () => void;
}

const unitTypes = [
  { value: "observation", label: "Beobachtung" },
  { value: "finding", label: "Erkenntnis" },
  { value: "risk", label: "Risiko" },
  { value: "action", label: "Massnahme" },
];

export function AddKnowledgeUnitDialog({
  sessionId,
  blockKey,
  onAdded,
  onClose,
}: AddKnowledgeUnitDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [unitType, setUnitType] = useState("observation");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !body.trim()) {
      setError("Titel und Inhalt sind Pflichtfelder.");
      return;
    }

    startTransition(async () => {
      const result = await addKnowledgeUnit(sessionId, blockKey, {
        title: title.trim(),
        body: body.trim(),
        unitType,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onAdded({
        id: result.kuId!,
        unit_type: unitType,
        source: "manual",
        title: title.trim(),
        body: body.trim(),
        confidence: "medium",
        evidence_refs: [],
        status: "proposed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Knowledge Unit hinzufuegen
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Typ
            </label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {unitTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Titel
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kurzer, beschreibender Titel"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Inhalt
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Detaillierte Beschreibung der Knowledge Unit"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Wird erstellt…" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
