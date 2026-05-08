"use client";

// SLC-079 MT-2 — Inline-Dropdown fuer Move-Action (DEC-086 Select-Move, kein Drag-Drop).
// Native <select> mit useTransition + Server Action. Pattern-Reuse aus
// ApproveRejectButtons.tsx (SLC-042 MT-2).

import { useState, useTransition } from "react";
import { Loader2, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { moveWalkthroughStepMapping } from "@/app/actions/walkthrough-methodology";

export interface SubtopicOption {
  /** unterbereich-String, z.B. "Block A / A1 Grundverständnis" */
  subtopic_id: string;
  /** Block-Key fuer optionales Gruppen-Label */
  block_key: string;
}

interface Props {
  walkthroughStepId: string;
  /** Aktueller subtopic_id (oder null = unmapped) */
  currentSubtopicId: string | null;
  /** Flat-tree der gueltigen Subtopic-Optionen */
  subtopicOptions: SubtopicOption[];
  className?: string;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Keine Berechtigung.",
  forbidden_tenant: "Kein Zugriff auf diesen Tenant.",
  step_not_found: "Schritt nicht gefunden.",
  step_id_invalid: "Ungueltige Schritt-ID.",
  subtopic_id_invalid: "Ungueltige Subtopic-ID.",
  update_failed: "Speichern fehlgeschlagen.",
};

const UNMAPPED_VALUE = "__unmapped__";

export function MoveStepDropdown({
  walkthroughStepId,
  currentSubtopicId,
  subtopicOptions,
  className,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(
    currentSubtopicId ?? UNMAPPED_VALUE,
  );

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newValue = e.target.value;
    setSelected(newValue);

    const newSubtopicId = newValue === UNMAPPED_VALUE ? null : newValue;
    if (newSubtopicId === currentSubtopicId) return;

    startTransition(async () => {
      const result = await moveWalkthroughStepMapping({
        walkthroughStepId,
        newSubtopicId,
      });
      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Verschieben fehlgeschlagen.");
        // revert
        setSelected(currentSubtopicId ?? UNMAPPED_VALUE);
        return;
      }
      toast.success(
        newSubtopicId === null
          ? "Schritt nach Unmapped verschoben."
          : "Schritt verschoben.",
      );
    });
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <MoveRight className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={selected}
        onChange={handleChange}
        disabled={pending}
        aria-label="Subtopic auswaehlen"
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-slate-300 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
        data-testid="move-step-dropdown"
      >
        <option value={UNMAPPED_VALUE}>— Unmapped —</option>
        {subtopicOptions.map((opt) => (
          <option key={opt.subtopic_id} value={opt.subtopic_id}>
            {opt.subtopic_id}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
    </div>
  );
}
