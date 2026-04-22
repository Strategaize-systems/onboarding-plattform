"use client";

import { useState, useTransition } from "react";
import { updateKnowledgeUnit } from "./actions";

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

interface KnowledgeUnitEditorProps {
  ku: KnowledgeUnit;
  validationEntries: ValidationEntry[];
  onUpdated: (ku: KnowledgeUnit) => void;
}

const confidenceBadge: Record<string, { label: string; className: string }> = {
  high: { label: "Hoch", className: "bg-green-100 text-green-800" },
  medium: { label: "Mittel", className: "bg-yellow-100 text-yellow-800" },
  low: { label: "Niedrig", className: "bg-red-100 text-red-800" },
};

const statusBadge: Record<string, { label: string; className: string }> = {
  proposed: { label: "Vorgeschlagen", className: "bg-slate-100 text-slate-700" },
  accepted: { label: "Akzeptiert", className: "bg-green-100 text-green-800" },
  edited: { label: "Bearbeitet", className: "bg-blue-100 text-blue-800" },
  rejected: { label: "Abgelehnt", className: "bg-red-100 text-red-800" },
};

const sourceBadge: Record<string, { label: string; className: string }> = {
  questionnaire: { label: "Fragebogen", className: "bg-indigo-100 text-indigo-700" },
  dialogue: { label: "Gespraech", className: "bg-blue-100 text-blue-700" },
  evidence: { label: "Evidenz", className: "bg-teal-100 text-teal-700" },
  ai_draft: { label: "KI-Entwurf", className: "bg-purple-100 text-purple-700" },
  manual: { label: "Manuell", className: "bg-slate-100 text-slate-600" },
  meeting_final: { label: "Meeting-Final", className: "bg-green-100 text-green-700" },
};

export function KnowledgeUnitEditor({
  ku,
  validationEntries,
  onUpdated,
}: KnowledgeUnitEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(ku.title);
  const [editBody, setEditBody] = useState(ku.body);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleAction(action: "accept" | "edit" | "reject") {
    setError(null);

    const patch: { title?: string; body?: string } = {};
    if (action === "edit") {
      patch.title = editTitle;
      patch.body = editBody;
    }

    startTransition(async () => {
      const result = await updateKnowledgeUnit(ku.id, patch, action);

      if (result.error) {
        setError(result.error);
        return;
      }

      const newStatus =
        action === "accept"
          ? "accepted"
          : action === "edit"
            ? "edited"
            : "rejected";

      onUpdated({
        ...ku,
        title: action === "edit" ? editTitle : ku.title,
        body: action === "edit" ? editBody : ku.body,
        status: newStatus,
        updated_at: new Date().toISOString(),
      });

      setIsEditing(false);
    });
  }

  const conf = confidenceBadge[ku.confidence] ?? {
    label: ku.confidence,
    className: "bg-slate-100 text-slate-700",
  };
  const stat = statusBadge[ku.status] ?? {
    label: ku.status,
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-medium"
            />
          ) : (
            <h3 className="text-sm font-medium text-slate-900">{ku.title}</h3>
          )}
        </div>
        <div className="ml-3 flex flex-shrink-0 items-center gap-2">
          {sourceBadge[ku.source] && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadge[ku.source].className}`}
            >
              {sourceBadge[ku.source].label}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${conf.className}`}
          >
            {conf.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${stat.className}`}
          >
            {stat.label}
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
            {ku.unit_type}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{ku.body}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => handleAction("edit")}
                disabled={isPending}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Speichern…" : "Speichern"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(ku.title);
                  setEditBody(ku.body);
                }}
                disabled={isPending}
                className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Abbrechen
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAction("accept")}
                disabled={isPending || ku.status === "accepted"}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Akzeptieren
              </button>
              <button
                onClick={() => setIsEditing(true)}
                disabled={isPending}
                className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Bearbeiten
              </button>
              <button
                onClick={() => handleAction("reject")}
                disabled={isPending || ku.status === "rejected"}
                className="rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                Ablehnen
              </button>
            </>
          )}
        </div>

        {validationEntries.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showHistory ? "Historie verbergen" : `Historie (${validationEntries.length})`}
          </button>
        )}
      </div>

      {/* Validation History */}
      {showHistory && validationEntries.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="space-y-1.5">
            {validationEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 text-xs text-slate-500"
              >
                <span className="font-medium">
                  {entry.action}
                </span>
                {entry.previous_status && (
                  <>
                    <span>{entry.previous_status}</span>
                    <span>→</span>
                  </>
                )}
                {entry.new_status && <span>{entry.new_status}</span>}
                {entry.note && (
                  <span className="text-slate-400">— {entry.note}</span>
                )}
                <span className="ml-auto text-slate-400">
                  {new Date(entry.created_at).toLocaleString("de-DE")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
