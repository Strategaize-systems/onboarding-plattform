"use client";

// SLC-079 MT-3 — Wrapper fuer einen walkthrough_step in der Methodik-Review-UI.
// Client Component weil Edit-Mode + Delete-Confirm State braucht.
// Fasst ConfidenceBadge, MoveStepDropdown, StepEditForm und Delete-Button zusammen.

import { useState, useTransition } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { MoveStepDropdown, type SubtopicOption } from "./MoveStepDropdown";
import { StepEditForm } from "./StepEditForm";
import { softDeleteWalkthroughStep } from "@/app/actions/walkthrough-methodology";

export interface StepCardData {
  id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
  success_criterion: string | null;
  dependencies: string | null;
}

export interface StepMappingMeta {
  subtopic_id: string | null;
  confidence_score: number | null;
  confidence_band: "green" | "yellow" | "red";
  mapping_reasoning: string | null;
  reviewer_corrected: boolean;
}

interface Props {
  step: StepCardData;
  mapping: StepMappingMeta | null;
  subtopicOptions: SubtopicOption[];
  showMoveDropdown?: boolean;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Keine Berechtigung.",
  forbidden_tenant: "Kein Zugriff auf diesen Tenant.",
  step_not_found: "Schritt nicht gefunden.",
  step_id_invalid: "Ungueltige Schritt-ID.",
  already_deleted: "Schritt bereits geloescht.",
  update_failed: "Loeschen fehlgeschlagen.",
};

export function StepCard({
  step,
  mapping,
  subtopicOptions,
  showMoveDropdown = true,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      const result = await softDeleteWalkthroughStep({
        walkthroughStepId: step.id,
      });
      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Loeschen fehlgeschlagen.");
        setConfirmingDelete(false);
        return;
      }
      toast.success("Schritt geloescht.");
    });
  }

  if (editMode) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3" data-testid="step-card">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">#{step.step_number}</span>
          <span>Editieren</span>
        </div>
        <StepEditForm
          walkthroughStepId={step.id}
          initial={{
            action: step.action,
            responsible: step.responsible,
            timeframe: step.timeframe,
            success_criterion: step.success_criterion,
            dependencies: step.dependencies,
          }}
          onCancel={() => setEditMode(false)}
          onSaved={() => setEditMode(false)}
        />
      </div>
    );
  }

  const band = mapping?.confidence_band ?? "red";
  const score = mapping?.confidence_score ?? null;
  const reasoning = mapping?.mapping_reasoning ?? null;

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3 hover:border-slate-300"
      data-testid="step-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">
              #{step.step_number}
            </span>
            <ConfidenceBadge band={band} score={score} reasoning={reasoning} />
            {mapping?.reviewer_corrected && (
              <span className="text-xs text-blue-600 font-medium">
                Berater-korrigiert
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-900">{step.action}</p>
          {(step.responsible || step.timeframe) && (
            <p className="text-xs text-slate-500">
              {step.responsible && <span>Verantwortlich: {step.responsible}</span>}
              {step.responsible && step.timeframe && <span> · </span>}
              {step.timeframe && <span>Wann: {step.timeframe}</span>}
            </p>
          )}
          {step.success_criterion && (
            <p className="text-xs text-slate-500">
              Erfolg: {step.success_criterion}
            </p>
          )}
          {step.dependencies && (
            <p className="text-xs text-slate-500">
              Abhaengigkeit: {step.dependencies}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setEditMode(true)}
            disabled={pending}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            title="Editieren"
            aria-label="Schritt editieren"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className={`rounded-md p-1.5 disabled:opacity-50 ${
              confirmingDelete
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-red-600"
            }`}
            title={confirmingDelete ? "Klick erneut zum Bestaetigen" : "Loeschen"}
            aria-label="Schritt loeschen"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {showMoveDropdown && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <MoveStepDropdown
            walkthroughStepId={step.id}
            currentSubtopicId={mapping?.subtopic_id ?? null}
            subtopicOptions={subtopicOptions}
          />
        </div>
      )}
    </div>
  );
}
