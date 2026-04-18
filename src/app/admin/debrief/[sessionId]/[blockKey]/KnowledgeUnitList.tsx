"use client";

import { useState } from "react";
import { KnowledgeUnitEditor } from "./KnowledgeUnitEditor";
import { AddKnowledgeUnitDialog } from "./AddKnowledgeUnitDialog";

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

interface KnowledgeUnitListProps {
  sessionId: string;
  blockKey: string;
  knowledgeUnits: KnowledgeUnit[];
  validationEntries: ValidationEntry[];
}

const sourceLabels: Record<string, string> = {
  questionnaire: "Fragebogen",
  ai_draft: "KI-Entwurf",
  manual: "Manuell",
  exception: "Ausnahme",
  meeting_final: "Meeting-Final",
};

const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  proposed: "bg-slate-100 text-slate-700",
  accepted: "bg-green-100 text-green-800",
  edited: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
};

export function KnowledgeUnitList({
  sessionId,
  blockKey,
  knowledgeUnits: initialKUs,
  validationEntries: initialValidation,
}: KnowledgeUnitListProps) {
  const [knowledgeUnits, setKnowledgeUnits] =
    useState<KnowledgeUnit[]>(initialKUs);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Group by source
  const grouped = knowledgeUnits.reduce(
    (acc, ku) => {
      const key = ku.source;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ku);
      return acc;
    },
    {} as Record<string, KnowledgeUnit[]>
  );

  const sourceOrder = [
    "questionnaire",
    "ai_draft",
    "manual",
    "exception",
    "meeting_final",
  ];
  const sortedSources = sourceOrder.filter((s) => grouped[s]?.length > 0);

  function handleKUUpdated(updatedKU: KnowledgeUnit) {
    setKnowledgeUnits((prev) =>
      prev.map((ku) => (ku.id === updatedKU.id ? updatedKU : ku))
    );
  }

  function handleKUAdded(newKU: KnowledgeUnit) {
    setKnowledgeUnits((prev) => [...prev, newKU]);
    setShowAddDialog(false);
  }

  if (knowledgeUnits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-slate-500">
          Noch keine Knowledge Units fuer diesen Block.
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Knowledge Units werden nach Block-Submit automatisch durch den Worker
          erzeugt.
        </p>
        <button
          onClick={() => setShowAddDialog(true)}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          KU manuell hinzufuegen
        </button>
        {showAddDialog && (
          <AddKnowledgeUnitDialog
            sessionId={sessionId}
            blockKey={blockKey}
            onAdded={handleKUAdded}
            onClose={() => setShowAddDialog(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-600">
          <span className="font-medium">{knowledgeUnits.length}</span> KUs
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex gap-2">
          {(["proposed", "accepted", "edited", "rejected"] as const).map(
            (status) => {
              const count = knowledgeUnits.filter(
                (ku) => ku.status === status
              ).length;
              if (count === 0) return null;
              return (
                <span
                  key={status}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}
                >
                  {count} {status}
                </span>
              );
            }
          )}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + KU hinzufuegen
          </button>
        </div>
      </div>

      {/* KU groups by source */}
      {sortedSources.map((source) => (
        <div key={source}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {sourceLabels[source] ?? source} ({grouped[source].length})
          </h2>
          <div className="space-y-3">
            {grouped[source].map((ku) => (
              <KnowledgeUnitEditor
                key={ku.id}
                ku={ku}
                validationEntries={initialValidation.filter(
                  (v) => v.knowledge_unit_id === ku.id
                )}
                onUpdated={handleKUUpdated}
              />
            ))}
          </div>
        </div>
      ))}

      {showAddDialog && (
        <AddKnowledgeUnitDialog
          sessionId={sessionId}
          blockKey={blockKey}
          onAdded={handleKUAdded}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
