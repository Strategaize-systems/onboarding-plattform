"use client";

// SLC-079 MT-2 — Inline-Edit-Form fuer walkthrough_step.
// Native HTML Form + useTransition + Server Action (Memory feedback_native_html_form_pattern).

import { useState, useTransition } from "react";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { editWalkthroughStep } from "@/app/actions/walkthrough-methodology";

interface StepFields {
  action: string;
  responsible: string | null;
  timeframe: string | null;
  success_criterion: string | null;
  dependencies: string | null;
}

interface Props {
  walkthroughStepId: string;
  initial: StepFields;
  onCancel: () => void;
  onSaved?: () => void;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Keine Berechtigung.",
  forbidden_tenant: "Kein Zugriff auf diesen Tenant.",
  step_not_found: "Schritt nicht gefunden.",
  step_id_invalid: "Ungueltige Schritt-ID.",
  patches_missing: "Keine Aenderungen erkannt.",
  no_patches: "Keine gueltigen Aenderungen erkannt.",
  action_required: "Action darf nicht leer sein.",
  update_failed: "Speichern fehlgeschlagen.",
};

export function StepEditForm({
  walkthroughStepId,
  initial,
  onCancel,
  onSaved,
}: Props) {
  const [action, setAction] = useState(initial.action);
  const [responsible, setResponsible] = useState(initial.responsible ?? "");
  const [timeframe, setTimeframe] = useState(initial.timeframe ?? "");
  const [successCriterion, setSuccessCriterion] = useState(
    initial.success_criterion ?? "",
  );
  const [dependencies, setDependencies] = useState(initial.dependencies ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (action.trim().length === 0) {
      toast.error(ERROR_LABEL.action_required);
      return;
    }
    startTransition(async () => {
      const result = await editWalkthroughStep({
        walkthroughStepId,
        patches: {
          action: action.trim(),
          responsible: responsible.trim() || null,
          timeframe: timeframe.trim() || null,
          success_criterion: successCriterion.trim() || null,
          dependencies: dependencies.trim() || null,
        },
      });
      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Speichern fehlgeschlagen.");
        return;
      }
      toast.success("Schritt gespeichert.");
      onSaved?.();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
      data-testid="step-edit-form"
    >
      <FormField
        label="Action"
        required
        id={`action-${walkthroughStepId}`}
        value={action}
        onChange={setAction}
        disabled={pending}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          label="Verantwortlich"
          id={`responsible-${walkthroughStepId}`}
          value={responsible}
          onChange={setResponsible}
          disabled={pending}
          placeholder="z.B. Buchhaltung"
        />
        <FormField
          label="Zeitvorgabe"
          id={`timeframe-${walkthroughStepId}`}
          value={timeframe}
          onChange={setTimeframe}
          disabled={pending}
          placeholder="z.B. bis Tagesende"
        />
      </div>
      <FormField
        label="Erfolgs-Kriterium"
        id={`success-${walkthroughStepId}`}
        value={successCriterion}
        onChange={setSuccessCriterion}
        disabled={pending}
        placeholder="z.B. Tageskasse stimmt"
      />
      <FormField
        label="Abhaengigkeiten"
        id={`deps-${walkthroughStepId}`}
        value={dependencies}
        onChange={setDependencies}
        disabled={pending}
        placeholder="z.B. Schritt 1 abgeschlossen"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-primary-dark disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Speichern
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  id,
  value,
  onChange,
  required,
  placeholder,
  disabled,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-slate-600 mb-1"
      >
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
      />
    </div>
  );
}
