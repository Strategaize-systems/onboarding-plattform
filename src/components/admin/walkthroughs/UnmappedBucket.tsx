// SLC-079 MT-3 — Unmapped-Bucket fuer Schritte ohne Subtopic-Zuordnung.
// Server Component. Pro Schritt: ConfidenceBadge (rot per DEC-087) + StepCard mit
// Move-Dropdown.

import { StepCard, type StepCardData, type StepMappingMeta } from "./StepCard";
import type { SubtopicOption } from "./MoveStepDropdown";

export interface UnmappedStep extends StepCardData {
  mapping: StepMappingMeta | null;
}

interface Props {
  steps: UnmappedStep[];
  subtopicOptions: SubtopicOption[];
}

export function UnmappedBucket({ steps, subtopicOptions }: Props) {
  if (steps.length === 0) {
    return (
      <div
        className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        data-testid="unmapped-bucket-empty"
      >
        Alle Schritte sind einem Subtopic zugeordnet — kein Unmapped-Bucket.
      </div>
    );
  }

  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  return (
    <section className="space-y-3" data-testid="unmapped-bucket">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Unmapped-Bucket
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({steps.length} {steps.length === 1 ? "Schritt" : "Schritte"} ohne Zuordnung)
          </span>
        </h3>
      </div>
      <div className="space-y-2 rounded-md border border-red-200 bg-red-50/50 p-3">
        {sorted.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            mapping={step.mapping}
            subtopicOptions={subtopicOptions}
          />
        ))}
      </div>
    </section>
  );
}
