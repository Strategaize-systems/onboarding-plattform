// V7.3 SLC-140 MT-3 — Run-Page Progress-Indicator (Fortschritt + N von 24).
//
// Sticky-top im QuestionFlow-Layout. Zeigt Anteil beantworteter Fragen als
// visuelle Bar und Klartext ("X von Y beantwortet"). EditableText fuer alle
// Strings, damit Partner-Admin sie spaeter ueberschreiben kann.

import { EditableText } from "@/components/text-override/EditableText";

interface ProgressIndicatorProps {
  answered: number;
  total: number;
}

export function ProgressIndicator({ answered, total }: ProgressIndicatorProps) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <EditableText
            keyPath="diagnose.run.progress_label"
            defaultText="Fortschritt"
          />
          <span className="text-slate-400">·</span>
          <span className="font-medium text-slate-700">
            {answered}{" "}
            <EditableText
              keyPath="diagnose.run.progress_separator"
              defaultText="von"
            />{" "}
            {total}{" "}
            <EditableText
              keyPath="diagnose.run.progress_suffix"
              defaultText="beantwortet"
            />
          </span>
        </div>
        <span className="text-sm font-semibold text-brand-primary">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-brand-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
